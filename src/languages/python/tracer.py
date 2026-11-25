"""Trace harness for CS Practice Lab.

Runs user code under ``sys.settrace`` and returns a JSON document describing every executed line.
Imports nothing from ``js``/``pyodide`` so it can be tested on plain CPython (see tests/tracer).

Design notes (PLAN.md section 4):
* Rows are POST-state. A ``line`` event fires *before* the line runs, so each frame keeps a "pending
  line" which is finalised (snapshot, diff, stdout) on that frame's next event.
* Values are serialised to immutable JSON the moment a step is finalised, so later mutation can
  never alter an earlier row.
* The abort exception is a BaseException so ``except Exception`` can't swallow it; broad handlers
  (bare ``except:`` / ``except BaseException``) get a re-raise guard injected by an AST transform.
"""

from __future__ import annotations

import ast
import builtins
import copy
import json
import random
import re
import sys
import time
import traceback
import types
from collections import defaultdict

USER_FILE = "<user>"
TRANSPARENT = frozenset({"<genexpr>", "<lambda>", "<listcomp>", "<dictcomp>", "<setcomp>"})
BLOCKED_IMPORTS = frozenset({"js", "pyodide", "pyodide_js", "micropip", "_pyodide"})
MAX_STDOUT = 100_000
CO_NEWLOCALS = 0x2  # function code objects have it; module and class bodies don't
MAX_LINE_INFO = 2000  # described source lines
MAX_EXPR_TEXT = 200
MAX_EXPR_NAMES = 40

_MISSING = object()


class TraceAbort(BaseException):
    """Raised from the trace function to stop the user program."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


class InputExhausted(BaseException):
    """Raised by the patched input() when the supplied stdin has run out."""

    def __init__(self, prompt: str, consumed: int):
        super().__init__(prompt)
        self.prompt = prompt
        self.consumed = consumed


# ───────────────────────────── options ─────────────────────────────


class Options:
    def __init__(self, d: dict):
        self.max_steps = int(d.get("maxSteps", 1000))
        self.timeout_ms = float(d.get("timeoutMs", 3000))
        self.max_call_depth = int(d.get("maxCallDepth", 100))
        self.stdin = [str(x) for x in d.get("stdin", [])]
        self.seed = d.get("randomSeed", 0)
        lim = d.get("valueLimits", {})
        self.max_items = int(lim.get("maxItems", 50))
        self.max_depth = int(lim.get("maxDepth", 4))
        self.max_str = int(lim.get("maxStringLength", 200))
        self.show_callables = bool(d.get("showCallables", False))
        self.watches = list(d.get("watches", []))


# ───────────────────────────── stdout capture ─────────────────────────────


class StepBuffer:
    """Replaces sys.stdout/sys.stderr. ``take()`` returns what was written since the last call."""

    encoding = "utf-8"

    def __init__(self, cap: int):
        self._pending: list[str] = []
        self._all: list[str] = []
        self._size = 0
        self._cap = cap
        self.truncated = False

    def write(self, s) -> int:
        if not isinstance(s, str):
            s = str(s)
        n = len(s)
        if self._size + n > self._cap:
            s = s[: max(0, self._cap - self._size)]
            self.truncated = True
        if s:
            self._pending.append(s)
            self._all.append(s)
            self._size += len(s)
        return n

    def writelines(self, lines) -> None:
        for line in lines:
            self.write(line)

    def flush(self) -> None:
        pass

    def isatty(self) -> bool:
        return False

    def take(self) -> str:
        s = "".join(self._pending)
        self._pending = []
        return s

    def getvalue(self) -> str:
        return "".join(self._all)


# ───────────────────────────── value serialisation ─────────────────────────────


class RefTable:
    """Maps id(obj) -> small stable int. Holds strong refs so ids can't be recycled during a run."""

    def __init__(self):
        self._ids: dict[int, int] = {}
        self._keep: list[object] = []

    def get(self, obj) -> int:
        i = id(obj)
        if i not in self._ids:
            self._ids[i] = len(self._ids) + 1
            self._keep.append(obj)
        return self._ids[i]


def safe_repr(v, limit: int = 80) -> str:
    try:
        s = repr(v)
    except Exception:
        s = f"<{type(v).__name__}>"
    return s if len(s) <= limit else s[: limit - 1] + "…"


_CONTAINERS = ((list, "list"), (tuple, "tuple"), (frozenset, "frozenset"), (set, "set"))


class Serialiser:
    def __init__(self, refs: RefTable, opts: Options):
        self.refs = refs
        self.max_items = opts.max_items
        self.max_depth = opts.max_depth
        self.max_str = opts.max_str

    def __call__(self, v, depth: int = 0, path: tuple = ()):
        if v is None:
            return {"k": "none"}
        if isinstance(v, bool):
            return {"k": "bool", "v": v}
        if isinstance(v, int):
            try:
                return {"k": "int", "v": str(v)}
            except ValueError:  # int -> str digit limit
                return {"k": "opaque", "type": "int", "repr": "<very large int>"}
        if isinstance(v, float):
            return {"k": "float", "v": repr(v)}
        if isinstance(v, str):
            if len(v) > self.max_str:
                return {"k": "str", "v": v[: self.max_str], "truncated": len(v)}
            return {"k": "str", "v": v}

        if isinstance(v, (dict, list, tuple, set, frozenset)):
            ref = self.refs.get(v)
            if id(v) in path:
                return {"k": "cycle", "ref": ref}
            if depth >= self.max_depth:
                return {"k": "opaque", "type": type(v).__name__, "repr": "…"}
            inner = path + (id(v),)
            if isinstance(v, dict):
                items = list(v.items())
                out = {
                    "k": "dict",
                    "entries": [
                        [self(a, depth + 1, inner), self(b, depth + 1, inner)] for a, b in items[: self.max_items]
                    ],
                    "ref": ref,
                }
            else:
                kind = next(name for cls, name in _CONTAINERS if isinstance(v, cls))
                items = list(v)
                out = {"k": kind, "items": [self(x, depth + 1, inner) for x in items[: self.max_items]], "ref": ref}
            if len(items) > self.max_items:
                out["truncated"] = len(items)
            return out

        if callable(v) or isinstance(v, types.ModuleType):
            return {"k": "opaque", "type": type(v).__name__, "repr": safe_repr(v)}

        d = getattr(v, "__dict__", None)
        if isinstance(d, dict):
            ref = self.refs.get(v)
            if id(v) in path:
                return {"k": "cycle", "ref": ref}
            if depth >= self.max_depth:
                return {"k": "opaque", "type": type(v).__name__, "repr": "…"}
            inner = path + (id(v),)
            fields = {k: self(x, depth + 1, inner) for k, x in list(d.items())[: self.max_items] if not k.startswith("__")}
            return {"k": "object", "type": type(v).__name__, "fields": fields, "ref": ref}

        return {"k": "opaque", "type": type(v).__name__, "repr": safe_repr(v)}


def visible(name: str, val, show_callables: bool) -> bool:
    if name.startswith("__"):
        return False
    if show_callables:
        return True
    return not (callable(val) or isinstance(val, types.ModuleType))


_IMMUTABLE = (int, float, str, bytes, tuple, frozenset, type(None), range)


def is_mutable(v) -> bool:
    """Could this binding's content change without the name being rebound?"""
    return not isinstance(v, _IMMUTABLE) and not callable(v) and not isinstance(v, types.ModuleType)


# ───────────────────────────── static analysis ─────────────────────────────


def _target_names(t, out: set) -> None:
    if isinstance(t, ast.Name):
        out.add(t.id)
    elif isinstance(t, (ast.Tuple, ast.List)):
        for e in t.elts:
            _target_names(e, out)
    elif isinstance(t, ast.Starred):
        _target_names(t.value, out)


# ── line descriptions (what each line is, for the Condition column and explanations) ──

_COMPREHENSION_NODES = (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)
_IMPURE_NODES = (ast.NamedExpr, ast.Await, ast.Yield, ast.YieldFrom, ast.Lambda, *_COMPREHENSION_NODES)
_PLACEHOLDER = re.compile(r"__tt_(\d+)__")


def _is_pure(node) -> bool:
    """Safe to restate with values substituted: no calls except safe built-ins, nothing that binds or defers."""
    for n in ast.walk(node):
        if isinstance(n, _IMPURE_NODES):
            return False
        if isinstance(n, ast.Call) and not (isinstance(n.func, ast.Name) and n.func.id in SAFE_CALLS):
            return False
    return True


class _Placeholders(ast.NodeTransformer):
    """Swaps every variable read (not a called function's name) for a numbered placeholder."""

    def __init__(self):
        self.names: list[str] = []

    def visit_Call(self, node):
        if not isinstance(node.func, ast.Name):
            node.func = self.visit(node.func)
        node.args = [self.visit(a) for a in node.args]
        node.keywords = [self.visit(k) for k in node.keywords]
        return node

    def visit_Name(self, node):
        if not isinstance(node.ctx, ast.Load):
            return node
        self.names.append(node.id)
        return ast.Name(f"__tt_{len(self.names) - 1}__", ast.Load())


def _template(exprs: list, text: str) -> dict | None:
    """``{"t": source text, "p": [literal, {"n": name}, literal, ...], "u": pure}``, or None if too big.

    ``exprs`` are joined with ", " (print arguments). Works on copies: the tree is compiled afterwards.
    Nothing is evaluated.
    """
    if len(text) > MAX_EXPR_TEXT or "__tt_" in text:
        return None
    try:
        swap = _Placeholders()
        source = ", ".join(ast.unparse(swap.visit(copy.deepcopy(e))) for e in exprs)
        if len(swap.names) > MAX_EXPR_NAMES:
            return None
        pure = all(_is_pure(e) for e in exprs)
    except (ValueError, RecursionError):  # huge int literal, absurd nesting
        return None
    parts = [{"n": swap.names[int(x)]} if i % 2 else x for i, x in enumerate(_PLACEHOLDER.split(source))]
    return {"t": text, "p": parts, "u": pure}


class _Source:
    """Source text of AST nodes. (``ast.get_source_segment`` re-splits the whole file on every call.)"""

    def __init__(self, code: str):
        self.lines = re.split(r"\r\n|\r|\n", code)

    def line(self, lineno: int) -> str:
        return self.lines[lineno - 1] if 0 < lineno <= len(self.lines) else ""

    def segment(self, node) -> str:
        """As written, with a multi-line expression joined onto one line."""
        first, last = node.lineno, node.end_lineno
        rows = [self.line(n).encode("utf-8") for n in range(first, last + 1)]
        rows[-1] = rows[-1][: node.end_col_offset]
        rows[0] = rows[0][node.col_offset :]
        return " ".join(r.decode("utf-8", "replace").strip() for r in rows)

    def text(self, nodes: list) -> str:
        total = sum(n.end_lineno - n.lineno for n in nodes)
        if total > 20:  # cannot fit in MAX_EXPR_TEXT in any useful way
            return " " * (MAX_EXPR_TEXT + 1)
        return ", ".join(self.segment(n) for n in nodes)


def _target_texts(targets: list, src: _Source) -> list[str]:
    out: list[str] = []
    todo = list(targets)
    while todo and len(out) < MAX_EXPR_NAMES:
        t = todo.pop(0)
        if isinstance(t, (ast.Tuple, ast.List)):
            todo[:0] = t.elts
        elif isinstance(t, ast.Starred):
            todo.insert(0, t.value)
        else:
            text = t.id if isinstance(t, ast.Name) else src.text([t])[:MAX_EXPR_TEXT]
            if text not in out:
                out.append(text)
    return out


def _reads_input(node) -> bool:
    return any(isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "input" for n in ast.walk(node))


def _describe(n: ast.stmt, src: _Source, is_elif: bool) -> dict:
    kind, exprs, targets, text, value = "other", [], [], None, None
    if isinstance(n, ast.If):
        kind, exprs = ("elif" if is_elif else "if"), [n.test]
    elif isinstance(n, ast.While):
        kind, exprs = "while", [n.test]
    elif isinstance(n, (ast.For, ast.AsyncFor)):
        kind, exprs, targets = "for", [n.iter], [n.target]
    elif isinstance(n, ast.Assign):
        kind, exprs, targets, value = "assign", [n.value], n.targets, n.value
    elif isinstance(n, ast.AnnAssign) and n.value is not None:
        kind, exprs, targets, value = "assign", [n.value], [n.target], n.value
    elif isinstance(n, ast.AugAssign):
        kind, targets, value = "augassign", [n.target], n.value
        left = copy.copy(n.target)  # shallow: only the context changes, from "store" to "read"
        left.ctx = ast.Load()
        whole = ast.BinOp(left, n.op, n.value)
        if len(src.text([n])) <= MAX_EXPR_TEXT:
            try:
                text = ast.unparse(whole)
            except (ValueError, RecursionError):
                text = None
        exprs = [whole] if text is not None else []
    elif isinstance(n, ast.Return):
        kind, exprs = "return", [n.value] if n.value is not None else []
    elif isinstance(n, ast.Expr) and isinstance(n.value, ast.Call):
        f = n.value.func
        if isinstance(f, ast.Name) and f.id == "print":
            kind, exprs = "output", n.value.args

    out: dict = {"k": kind}
    if exprs:
        expr = _template(exprs, text if text is not None else src.text(exprs))
        if expr is not None:
            out["e"] = expr
    if targets:
        out["tg"] = _target_texts(targets, src)
    if value is not None and _reads_input(value):
        out["in"] = True
    return out


class Static:
    """One AST pass collecting per-line facts the runtime tracer can't know.

    assigns      line -> names (re)bound by the statement that starts on that line. Makes
                 ``found = False`` a write even when the value didn't change (exam tables want that row).
    return_lines lines holding an explicit ``return``.
    body_range   header line -> (first, last) line of its body, so the line that runs next tells us
                 whether an if/elif/while/for condition sent control into the body.
    ephemeral    names bound only as comprehension targets (hidden by default).
    header_span  every line of a MULTI-LINE if/elif/while test or for iterable -> the header's first line,
                 so line events inside it are one evaluation of one row.
    line_info    line -> description of the first statement on it (sent to the host as ``lines``).
    """

    def __init__(self, tree: ast.AST, code: str):
        self.assigns: dict[int, set[str]] = defaultdict(set)
        # A for-loop target is only (re)assigned when the body is entered, not when the loop is exhausted.
        self.for_targets: dict[int, set[str]] = defaultdict(set)
        self.return_lines: set[int] = set()
        self.body_range: dict[int, tuple[int, int]] = {}
        self.header_span: dict[int, int] = {}
        self.line_info: dict[int, dict] = {}
        src = _Source(code)
        elifs: set[int] = set()  # id() of If nodes written as `elif` (not `else:` followed by `if`)
        comp: set[str] = set()
        params: set[str] = set()
        for n in ast.walk(tree):  # breadth-first: the first statement on a line is visited first
            if isinstance(n, ast.If) and len(n.orelse) == 1 and isinstance(n.orelse[0], ast.If):
                if src.line(n.orelse[0].lineno).lstrip().startswith("elif"):
                    elifs.add(id(n.orelse[0]))
            if isinstance(n, ast.stmt) and n.lineno not in self.line_info and len(self.line_info) < MAX_LINE_INFO:
                self.line_info[n.lineno] = _describe(n, src, id(n) in elifs)

            if isinstance(n, ast.Assign):
                for t in n.targets:
                    _target_names(t, self.assigns[n.lineno])
            elif isinstance(n, ast.AugAssign):
                _target_names(n.target, self.assigns[n.lineno])
            elif isinstance(n, ast.AnnAssign):
                if n.value is not None:
                    _target_names(n.target, self.assigns[n.lineno])
            elif isinstance(n, (ast.For, ast.AsyncFor)):
                _target_names(n.target, self.for_targets[n.lineno])
                self._range(n, n.iter)
            elif isinstance(n, (ast.If, ast.While)):
                self._range(n, n.test)
            elif isinstance(n, (ast.With, ast.AsyncWith)):
                for item in n.items:
                    if item.optional_vars is not None:
                        _target_names(item.optional_vars, self.assigns[n.lineno])
            elif isinstance(n, ast.NamedExpr):
                _target_names(n.target, self.assigns[n.lineno])
            elif isinstance(n, ast.Import):
                for a in n.names:
                    self.assigns[n.lineno].add(a.asname or a.name.split(".")[0])
            elif isinstance(n, ast.ImportFrom):
                for a in n.names:
                    if a.name != "*":
                        self.assigns[n.lineno].add(a.asname or a.name)
            elif isinstance(n, ast.ExceptHandler):
                if n.name:
                    self.assigns[n.lineno].add(n.name)
            elif isinstance(n, ast.Return):
                self.return_lines.add(n.lineno)
            elif isinstance(n, ast.comprehension):
                _target_names(n.target, comp)
            elif isinstance(n, ast.arg):
                params.add(n.arg)
        for line, header in self.header_span.items():  # e.g. a `:=` on a continuation line of a condition
            if line != header and line in self.assigns:
                self.assigns[header] |= self.assigns[line]
        bound = params.union(*self.assigns.values(), *self.for_targets.values())
        self.ephemeral = comp - bound

    def _range(self, n, head) -> None:
        """``head`` is the test (or iterable) expression of the header ``n``."""
        first = n.body[0].lineno
        if first <= head.end_lineno:
            # inline body (`if x: y`): the next line event can't tell us the outcome
            info = self.line_info.get(n.lineno)
            if info is not None and info["k"] in ("if", "elif", "while", "for"):
                info["ol"] = True
            return
        if head.end_lineno > n.lineno:
            for line in range(n.lineno, head.end_lineno + 1):
                self.header_span[line] = n.lineno
        self.body_range[n.lineno] = (first, max(getattr(s, "end_lineno", s.lineno) or s.lineno for s in n.body))


# ───────────────────────────── watch expressions ─────────────────────────────
#
# A watch is a small read-only expression (``arr[i]``, ``len(items)``, ``i < n``) evaluated against the
# program's state after every step. It must never change that state, so it is checked against an
# allowlist before it is compiled, and method calls are routed through a guard at run time.

SAFE_CALLS = frozenset(
    "len abs min max sum sorted round int float str bool ord chr isinstance any all list tuple set dict divmod repr".split()
)
PURE_METHODS = frozenset(
    (
        "count index get keys values items copy upper lower title capitalize strip lstrip rstrip "
        "find rfind startswith endswith isdigit isalpha isalnum isupper islower isspace split join format"
    ).split()
)
MUTATING_METHODS = frozenset(
    "pop append remove sort reverse clear update add extend insert discard setdefault popitem write".split()
)
_SAFE_LIST = ", ".join(sorted(SAFE_CALLS))
_PURE_LIST = "count, index, get, keys, values, items, upper, lower, strip, find, startswith, endswith, split, join"

_ALLOWED_NODES = (
    ast.Expression, ast.Name, ast.Constant, ast.Subscript, ast.Slice, ast.Attribute, ast.BinOp, ast.UnaryOp,
    ast.BoolOp, ast.Compare, ast.IfExp, ast.Tuple, ast.List, ast.Set, ast.Dict, ast.Call, ast.keyword, ast.Starred,
    ast.expr_context, ast.operator, ast.unaryop, ast.boolop, ast.cmpop,
)  # fmt: skip

_COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)


class WatchRejected(Exception):
    """The expression isn't allowed in a watch; ``str(e)`` is a message for the student."""


def _describe_rejected(n) -> str:
    if isinstance(n, ast.Lambda):
        return "Lambdas aren't allowed in a watch expression."
    if isinstance(n, _COMPREHENSIONS):
        return "Comprehensions aren't allowed in a watch expression."
    if isinstance(n, ast.NamedExpr):
        return "Assignments (:=) aren't allowed in a watch expression."
    if isinstance(n, ast.JoinedStr):
        return "f-strings aren't supported in a watch expression; use str(...) instead."
    if isinstance(n, (ast.Await, ast.Yield, ast.YieldFrom)):
        return "await / yield aren't allowed in a watch expression."
    return f"{type(n).__name__} expressions aren't allowed in a watch."


def _check_call(n: ast.Call) -> None:
    f = n.func
    if isinstance(f, ast.Name):
        if f.id not in SAFE_CALLS:
            raise WatchRejected(
                f"Watch expressions can't call {f.id}() — it might change your program's state. "
                f"You can call: {_SAFE_LIST}."
            )
    elif isinstance(f, ast.Attribute):
        if f.attr in MUTATING_METHODS:
            raise WatchRejected(
                f"Watch expressions can't call .{f.attr}() — it would change your program's state. "
                f"Read-only methods such as {_PURE_LIST} are fine."
            )
        if f.attr not in PURE_METHODS:
            raise WatchRejected(
                f".{f.attr}() isn't allowed in a watch expression. Read-only methods such as {_PURE_LIST} are."
            )
    else:
        raise WatchRejected("Only simple function and method calls are allowed in a watch expression.")


def check_watch(tree: ast.Expression) -> None:
    for n in ast.walk(tree):
        if not isinstance(n, _ALLOWED_NODES):
            raise WatchRejected(_describe_rejected(n))
        if isinstance(n, ast.Name) and n.id.startswith("__"):
            raise WatchRejected("Names starting with __ aren't allowed in a watch expression.")
        if isinstance(n, ast.Attribute) and n.attr.startswith("_"):
            raise WatchRejected("Private / dunder attributes (starting with _) aren't allowed in a watch expression.")
        if isinstance(n, ast.Call):
            _check_call(n)


def _tt_method(obj, name, *args, **kwargs):
    """Run-time guard: only built-in types may have methods called from a watch.

    A student's own class might define ``count()`` that mutates state, which the static allowlist can't see.
    """
    if type(obj).__module__ != "builtins":
        raise TypeError(f"watch expressions can't call methods of {type(obj).__name__} objects")
    return getattr(obj, name)(*args, **kwargs)


class _MethodGuard(ast.NodeTransformer):
    def visit_Call(self, node):
        self.generic_visit(node)
        if isinstance(node.func, ast.Attribute):
            guard = ast.Name("__tt_method__", ast.Load())
            node = ast.Call(guard, [node.func.value, ast.Constant(node.func.attr), *node.args], node.keywords)
        return node


def compile_watch(expr: str):
    """Parse, check and compile a watch expression. Raises WatchRejected."""
    if not expr.strip():
        raise WatchRejected("Type an expression, for example  arr[i]  or  len(items).")
    try:
        tree = ast.parse(expr.strip(), mode="eval")
    except SyntaxError as e:
        raise WatchRejected(f"Not a valid expression: {e.msg}") from None
    check_watch(tree)
    tree = ast.fix_missing_locations(_MethodGuard().visit(tree))
    return compile(tree, "<watch>", "eval")


def validate_watch(expr: str) -> str:
    """Entry point for the editor: JSON ``{"ok": true}`` or ``{"ok": false, "message": ...}``."""
    try:
        compile_watch(expr)
    except WatchRejected as e:
        return json.dumps({"ok": False, "message": str(e)})
    return json.dumps({"ok": True})


class Watch:
    def __init__(self, spec: dict):
        self.id = str(spec.get("id", ""))
        self.scope = spec.get("scope") or {"kind": "current"}
        self.code = None
        self.error: dict | None = None
        try:
            self.code = compile_watch(str(spec.get("expr", "")))
        except WatchRejected as e:
            self.error = {"ok": False, "reason": "rejected", "message": str(e)}


# ───────────────────────────── tracer ─────────────────────────────


class Tracer:
    def __init__(self, opts: Options, static: Static, emit_cb=None):
        self.o = opts
        self.static = static
        self.return_lines = static.return_lines
        self.emit_cb = emit_cb
        self.sent_steps = self.sent_frames = self.sent_vars = 0
        self.sent_lines = False
        self.frame_objs: dict[int, object] = {}  # fid -> live frame object
        self.watches = [Watch(s) for s in opts.watches]
        self.last_watch: dict[str, str] = {}  # watch id -> canonical JSON of the last emitted result
        self.refs = RefTable()
        self.ser = Serialiser(self.refs, opts)
        self.out = StepBuffer(MAX_STDOUT)
        self.steps: list[dict] = []
        self.raw = 0
        self.last_line = 0
        self.running_line = 0  # line about to execute / executing now; where a blocked run is stuck
        self.deadline = time.monotonic() + opts.timeout_ms / 1000
        self.abort_reason: str | None = None
        self.next_fid = 0
        self.fids: dict[int, int] = {}  # id(frame) -> fid
        self.frames: dict[int, dict] = {}  # fid -> wire frame info
        self.stack: list[int] = []  # live user frames, outermost first
        self.pending: dict[int, tuple[object, int]] = {}  # fid -> (frame, line)
        self.exc: dict[int, tuple[str, str]] = {}  # fid -> (type, message) raised in that frame
        self.last: dict[int, dict] = {}  # fid -> {name: Value} as of the last emitted step
        self.var_meta: dict[str, dict] = {}
        self.frame_list: list[dict] = []  # append-only mirrors of frames / var_meta, in creation order
        self.var_list: list[dict] = []
        self.module_frame = None

    # ── trace callbacks ──

    def global_trace(self, frame, event, arg):
        code = frame.f_code
        if code.co_filename != USER_FILE:
            return None  # never trace stdlib / harness frames
        if self.abort_reason:
            raise TraceAbort(self.abort_reason)
        name = code.co_name
        if name != "<module>" and (name in TRANSPARENT or not code.co_flags & CO_NEWLOCALS):
            return self.transparent_trace  # lambdas, genexprs, class bodies: count steps, emit no rows
        self.on_call(frame)
        return self.local_trace

    def transparent_trace(self, frame, event, arg):
        if event == "line":
            self.tick(frame)
        return self.transparent_trace

    def local_trace(self, frame, event, arg):
        if event == "line":
            line = frame.f_lineno
            header = self.static.header_span.get(line)
            if header is not None:
                p = self.pending.get(self.fids[id(frame)])
                if p is not None and p[1] == header:
                    self.tick(frame)  # still evaluating that header: no new row (but it counts towards limits)
                    return self.local_trace
            self.running_line = line  # set first: the flush inside finalise() reports it
            self.finalise(frame, next_line=line)
            self.tick(frame)
            fid = self.fids[id(frame)]
            self.pending[fid] = (frame, line if header is None else header)
        elif event == "exception":
            if not issubclass(arg[0], StopIteration):
                self.exc[self.fids[id(frame)]] = (arg[0].__name__, str(arg[1]))
        elif event == "return":
            self.finalise(frame, closing=True, ret=arg)
            self.on_return(frame)
        return self.local_trace

    # ── limits ──

    def tick(self, frame) -> None:
        self.raw += 1
        self.last_line = frame.f_lineno
        if self.raw > self.o.max_steps:
            self.abort("step-limit")
        if (self.raw & 63) == 0 and time.monotonic() > self.deadline:
            self.abort("timeout")

    def abort(self, reason: str) -> None:
        self.abort_reason = reason  # sticky: re-raised at every later call event / guarded handler
        raise TraceAbort(reason)

    # ── frames ──

    def on_call(self, frame) -> None:
        code = frame.f_code
        is_module = code.co_name == "<module>"
        depth = len(self.stack)
        if depth > self.o.max_call_depth:
            self.abort("depth-limit")
        fid = self.next_fid
        self.next_fid += 1
        self.fids[id(frame)] = fid
        info = {"id": fid, "name": "<module>" if is_module else code.co_qualname.replace(".<locals>", ""), "depth": depth}
        if is_module:
            self.module_frame = frame
        else:
            back = frame.f_back
            if back is not None and back.f_code.co_filename == USER_FILE:
                info["callLine"] = back.f_lineno
        self.frames[fid] = info
        self.frame_list.append(info)
        self.frame_objs[fid] = frame
        self.stack.append(fid)
        self.last[fid] = {}
        if is_module:
            return
        cur = self.snapshot(frame)
        raw = dict(frame.f_locals)
        nparams = code.co_argcount + code.co_kwonlyargcount
        parts = [f"{n}={safe_repr(raw[n], 20)}" for n in code.co_varnames[:nparams] if n in raw]
        info["argsLabel"] = f"{info['name']}({', '.join(parts)})"
        writes = [(fid, n, v) for n, v in cur.items()]
        self.last[fid] = cur
        self.emit("c", frame.f_lineno, fid, writes, [], "", watches=self.eval_watches(frame))

    # ── watch expressions ──

    def _watch_frame(self, w: Watch, frame):
        kind = w.scope.get("kind")
        if kind == "module":
            return self.module_frame
        if kind == "function":
            for f in reversed(self.stack):  # innermost live call of that function
                if self.frames[f]["name"] == w.scope.get("name") and f in self.frame_objs:
                    return self.frame_objs[f]
            return None
        return frame

    def _eval_watch(self, w: Watch, frame) -> dict:
        if w.error is not None:
            return w.error
        target = self._watch_frame(w, frame)
        if target is None:
            return {"ok": False, "reason": "not-in-scope", "message": "not in scope here"}
        ns = dict(target.f_locals)
        ns["__tt_method__"] = _tt_method
        try:
            value = eval(w.code, target.f_globals, ns)
        except NameError as e:
            return {"ok": False, "reason": "not-in-scope", "message": str(e)}
        except Exception as e:
            return {"ok": False, "reason": "error", "message": f"{type(e).__name__}: {e}"}
        return {"ok": True, "value": self.ser(value)}

    def eval_watches(self, frame) -> dict:
        """Results that CHANGED since the last step (the host carries unchanged ones forward)."""
        out = {}
        for w in self.watches:
            res = self._eval_watch(w, frame)
            sig = json.dumps(res, sort_keys=True)
            if self.last_watch.get(w.id) != sig:
                self.last_watch[w.id] = sig
                out[w.id] = res
        return out

    def on_return(self, frame) -> None:
        fid = self.fids.pop(id(frame))
        if self.stack and self.stack[-1] == fid:
            self.stack.pop()
        elif fid in self.stack:
            self.stack.remove(fid)
        self.last.pop(fid, None)
        self.exc.pop(fid, None)
        self.frame_objs.pop(fid, None)

    # ── snapshots ──

    def snapshot(self, frame) -> dict:
        show = self.o.show_callables
        return {n: self.ser(v) for n, v in dict(frame.f_locals).items() if visible(n, v, show)}

    def diff(self, fid: int, cur: dict) -> tuple[list, list]:
        prev = self.last.get(fid, {})
        writes = [(fid, n, v) for n, v in cur.items() if prev.get(n, _MISSING) != v]
        deletes = [(fid, n) for n in prev if n not in cur]
        self.last[fid] = cur
        return writes, deletes

    def mutable_diff(self, fid: int, frame) -> list:
        """Writes for mutable bindings of a SUSPENDED frame (a callee may have changed them in place)."""
        show = self.o.show_callables
        prev = self.last.setdefault(fid, {})
        writes = []
        for n, v in dict(frame.f_locals).items():
            if is_mutable(v) and visible(n, v, show):
                s = self.ser(v)
                if prev.get(n, _MISSING) != s:
                    prev[n] = s
                    writes.append((fid, n, s))
        return writes

    def finalise(self, frame, closing: bool = False, ret=None, next_line=None, aborted: bool = False) -> None:
        fid = self.fids.get(id(frame))
        p = self.pending.pop(fid, None) if fid is not None else None
        if p is None:
            return
        line = p[1]
        cur = self.snapshot(frame)
        writes, deletes = self.diff(fid, cur)

        exc = self.exc.pop(fid, None)
        branch = None
        rng = self.static.body_range.get(line)
        if rng is not None and exc is None and not aborted:
            branch = next_line is not None and rng[0] <= next_line <= rng[1]

        # Assignments are writes even when the value didn't change (`found = False` twice).
        names = set(self.static.assigns.get(line, ()))
        if branch is not False and not (aborted and rng is not None):  # a for header that is exhausting does not rebind its target
            names |= self.static.for_targets.get(line, set())
        if names:
            have = {n for _f, n, _v in writes}
            writes += [(fid, n, cur[n]) for n in sorted(names) if n in cur and n not in have]

        if fid != 0 and self.module_frame is not None:  # a callee can rebind / mutate globals
            w, d = self.diff(0, self.snapshot(self.module_frame))
            writes += w
            deletes += d
        for cfid in self.stack:  # ...and mutate lists/dicts held by suspended caller functions
            if cfid != fid and cfid != 0 and cfid in self.frame_objs:
                writes += self.mutable_diff(cfid, self.frame_objs[cfid])

        kind, rv = "l", None
        if closing and exc is not None:
            kind = "x"
        elif closing and line in self.return_lines:
            kind, rv = "r", self.ser(ret)
        x = {"t": exc[0], "m": exc[1], "c": not closing} if exc else None
        self.emit(kind, line, fid, writes, deletes, self.out.take(), rv, x, branch, self.eval_watches(frame))

    def emit(self, kind, line, fid, writes, deletes, out, ret=None, exc=None, branch=None, watches=None) -> None:
        i = len(self.steps)
        step = {"i": i, "k": kind, "ln": line, "f": fid, "stk": list(self.stack)}
        if writes:
            step["w"] = [[f, n, v] for f, n, v in writes]
        if deletes:
            step["d"] = [[f, n] for f, n in deletes]
        if out:
            step["o"] = out
        if ret is not None:
            step["r"] = ret
        if exc is not None:
            step["x"] = exc
        if branch is not None:
            step["b"] = branch
        if watches:
            step["wt"] = watches
        self.steps.append(step)
        for f, n, _ in writes:
            scope = self.frames[f]["name"]
            col = f"{scope}:{n}"
            if col not in self.var_meta:
                meta = {
                    "columnId": col,
                    "scopeName": scope,
                    "name": n,
                    "firstStep": i,
                    "ephemeral": n in self.static.ephemeral,
                }
                self.var_meta[col] = meta
                self.var_list.append(meta)
        self.maybe_flush()

    # ── streaming ──

    def maybe_flush(self) -> None:
        """Hand each finished row to the host immediately.

        Rows are only complete once the NEXT line starts, so everything before the line that is currently
        executing has already been delivered. If that line blocks inside C (``time.sleep``,
        ``sum(range(10**10))``) and the worker has to be killed, the trace up to it survives.
        """
        if self.emit_cb is not None and len(self.steps) > self.sent_steps:
            self.emit_cb(json.dumps(self.take_unsent()))

    def take_unsent(self) -> dict:
        frames, variables = self.frame_list, self.var_list
        chunk = {
            "steps": self.steps[self.sent_steps :],
            "frames": frames[self.sent_frames :],
            "variables": variables[self.sent_vars :],
            "rawSteps": self.raw,
            "line": self.running_line,
        }
        if not self.sent_lines:  # static, so once is enough; first, so a killed run still has it
            chunk["lines"] = self.static.line_info
            self.sent_lines = True
        self.sent_steps, self.sent_frames, self.sent_vars = len(self.steps), len(frames), len(variables)
        return chunk

    def flush_pending(self) -> None:
        """After an abort the tracer is switched off, so finalise whatever lines were mid-flight."""
        for fid in reversed(list(self.pending)):
            frame, _ = self.pending[fid]
            self.finalise(frame, aborted=True)  # no next line: a header's outcome is unknown, not False


# ───────────────────────────── sandbox pieces ─────────────────────────────


def _is_broad(t) -> bool:
    if t is None:
        return True
    if isinstance(t, ast.Name):
        return t.id == "BaseException"
    if isinstance(t, ast.Tuple):
        return any(_is_broad(e) for e in t.elts)
    return False


class _AbortGuard(ast.NodeTransformer):
    """Inserts ``__tt_check__()`` first in broad except handlers so TraceAbort can't be swallowed.

    The injected node reuses the first body statement's location, so it adds no extra line events.
    """

    def visit_ExceptHandler(self, node):
        self.generic_visit(node)
        if _is_broad(node.type):
            call = ast.Expr(ast.Call(ast.Name("__tt_check__", ast.Load()), [], []))
            ast.copy_location(call, node.body[0])
            ast.fix_missing_locations(call)
            for n in ast.walk(call):
                ast.copy_location(n, node.body[0])
            node.body.insert(0, call)
        return node


def _make_builtins(opts: Options, tracer: Tracer):
    b = dict(vars(builtins))
    queue = list(opts.stdin)
    consumed = [0]

    def _input(prompt=""):
        prompt = str(prompt)
        tracer.out.write(prompt)
        if not queue:
            raise InputExhausted(prompt, consumed[0])
        value = queue.pop(0)
        consumed[0] += 1
        tracer.out.write(value + "\n")
        return value

    real_import = builtins.__import__

    def _guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
        if level == 0 and name.split(".")[0] in BLOCKED_IMPORTS:
            raise ImportError(f"Importing '{name}' is not available in CS Practice Lab")
        return real_import(name, globals, locals, fromlist, level)

    def _check():
        if tracer.abort_reason:
            raise TraceAbort(tracer.abort_reason)

    b["input"] = _input
    b["__import__"] = _guarded_import
    b["__tt_check__"] = _check
    return b


def _error_from_exception(e: BaseException, kind: str) -> dict:
    tb = traceback.extract_tb(e.__traceback__)
    user = [(f.lineno, f.name) for f in tb if f.filename == USER_FILE]
    name = type(e).__name__
    msg = str(e)
    return {
        "kind": kind,
        "type": name,
        "message": f"{name}: {msg}" if msg else name,
        "line": user[-1][0] if user else None,
        "traceback": [{"line": ln, "functionName": fn} for ln, fn in user],
    }


def _empty_result(status: str, error: dict | None, t0: float) -> dict:
    return {
        "status": status,
        "error": error,
        "steps": [],
        "frames": [],
        "variables": [],
        "functions": [],
        "stdout": "",
        "stats": {"rawSteps": 0, "truncated": False, "durationMs": round((time.perf_counter() - t0) * 1000, 2)},
    }


def run_trace(code: str, opts_json: str, emit=None) -> str:
    """Entry point. Returns a JSON string; never raises for problems in the user's program.

    With ``emit`` (a callable taking a JSON string) finished steps are streamed in chunks as the program
    runs, and the return value holds only the tail not yet streamed plus the final status/metadata.
    Without it the return value is the complete trace.
    """
    t0 = time.perf_counter()
    opts = Options(json.loads(opts_json))

    try:
        tree = ast.parse(code, filename=USER_FILE)
        static = Static(tree, code)
        tree = ast.fix_missing_locations(_AbortGuard().visit(tree))
        code_obj = compile(tree, USER_FILE, "exec")
    except SyntaxError as e:
        err = {
            "kind": "syntax-error",
            "type": type(e).__name__,
            "message": f"{type(e).__name__}: {e.msg}",
            "line": e.lineno,
            "column": e.offset,
            "endLine": getattr(e, "end_lineno", None),
            "endColumn": getattr(e, "end_offset", None),
        }
        return json.dumps(_empty_result("syntax-error", err, t0))
    except (ValueError, RecursionError, MemoryError) as e:  # null bytes, absurd nesting
        err = {"kind": "syntax-error", "type": type(e).__name__, "message": f"{type(e).__name__}: {e}"}
        return json.dumps(_empty_result("syntax-error", err, t0))

    tracer = Tracer(opts, static, emit)
    g = {"__name__": "__main__", "__builtins__": _make_builtins(opts, tracer)}
    saved = (sys.stdout, sys.stderr, sys.getrecursionlimit())
    status, error, input_request = "ok", None, None

    random.seed(opts.seed)
    sys.stdout = sys.stderr = tracer.out
    sys.setrecursionlimit(max(saved[2], opts.max_call_depth * 3 + 100))
    try:
        sys.settrace(tracer.global_trace)
        exec(code_obj, g)
    except TraceAbort:
        pass  # status comes from tracer.abort_reason below
    except InputExhausted as e:
        status = "awaiting-input"
        input_request = {"prompt": e.prompt, "consumedCount": e.consumed}
        error = {"kind": status, "message": f"The program asked for input ({e.prompt!r}) but none was left.", "line": tracer.last_line}
    except SystemExit:
        pass
    except KeyboardInterrupt as e:
        status = "cancelled"
        error = _error_from_exception(e, status)
    except BaseException as e:
        status = "runtime-error"
        error = _error_from_exception(e, status)
    finally:
        sys.settrace(None)
        tracer.flush_pending()
        sys.stdout, sys.stderr = saved[0], saved[1]
        sys.setrecursionlimit(saved[2])

    # The abort reason is sticky, so it wins even if user code swallowed the exception somehow.
    reason = tracer.abort_reason
    if reason == "step-limit":
        status = "step-limit"
        error = {
            "kind": status,
            "message": f"Stopped after {opts.max_steps} steps. Your program may contain an infinite loop.",
            "line": tracer.last_line,
        }
    elif reason == "timeout":
        status = "timeout"
        error = {
            "kind": status,
            "message": f"Stopped after {opts.timeout_ms / 1000:g} s. Your program ran for too long and may contain an infinite loop.",
            "line": tracer.last_line,
        }
    elif reason == "depth-limit":
        status = "runtime-error"
        error = {
            "kind": status,
            "type": "RecursionError",
            "message": f"RecursionError: more than {opts.max_call_depth} nested function calls (infinite recursion?)",
            "line": tracer.last_line,
        }

    functions = []
    for info in tracer.frames.values():
        if info["name"] != "<module>" and info["name"] not in functions:
            functions.append(info["name"])
    result = {
        "status": status,
        "error": error,
        "inputRequest": input_request,
        **tracer.take_unsent(),
        "functions": functions,
        "stdout": tracer.out.getvalue(),
        "stats": {
            "rawSteps": tracer.raw,
            "truncated": tracer.out.truncated,
            "durationMs": round((time.perf_counter() - t0) * 1000, 2),
        },
    }
    return json.dumps(result)
