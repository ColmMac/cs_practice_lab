"""Python source -> exam-board pseudocode (PLAN.md §17.2 G, §17.3).

The code is only PARSED (``ast.parse``), never compiled or run, so this is safe for shared code that is still
under review. Plain CPython can import this module: it must not import ``js`` or ``pyodide``.

Keywords follow the published documents:
  aqa  AQA 8525 "Notes and guidance: Pseudo-code" (2024)
  ocr  OCR J277 specification v3.1, section 3c "OCR Exam Reference Language"
  sqa  SQA "Reference language for Computing Science question papers (summary)", Sept 2016 v1.0 (Higher)

Anything without an equivalent stays visible as the original Python, marked ``unsupported``. A wrong
translation is worse than none, so when in doubt a construct is not translated.
"""

import ast
import json

DIALECTS = ("aqa", "ocr", "sqa")

_MAX_DEPTH = 150

# Binding strength, loosest first
_OR, _AND, _NOT, _CMP, _ADD, _MUL, _UNARY, _POW, _ATOM = 1, 2, 3, 4, 6, 7, 8, 9, 10

_COMPARE = {
    "aqa": {ast.Eq: "=", ast.NotEq: "≠", ast.Lt: "<", ast.LtE: "≤", ast.Gt: ">", ast.GtE: "≥"},
    "ocr": {ast.Eq: "==", ast.NotEq: "!=", ast.Lt: "<", ast.LtE: "<=", ast.Gt: ">", ast.GtE: ">="},
    "sqa": {ast.Eq: "=", ast.NotEq: "≠", ast.Lt: "<", ast.LtE: "≤", ast.Gt: ">", ast.GtE: "≥"},
}

_OCR_FOR_EACH_NOTE = "not in the OCR Exam Reference Language"


class _NoEquivalent(Exception):
    """This construct cannot be written in the exam language."""


def _root_name(node):
    while isinstance(node, ast.Subscript):
        node = node.value
    return node.id if isinstance(node, ast.Name) else None


def _names_in(node):
    return {n.id for n in ast.walk(node) if isinstance(n, ast.Name)}


def _call_to(node, *names):
    """True when ``node`` is a plain call ``name(...)`` with positional arguments only."""
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id in names
        and not node.keywords
        and not any(isinstance(a, ast.Starred) for a in node.args)
    )


def _constant_int(node):
    sign = 1
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        sign, node = -1, node.operand
    if isinstance(node, ast.Constant) and type(node.value) is int:
        return sign * node.value
    return None


def _returns_a_value(function):
    """Does the function's OWN body return something? Nested definitions do not count."""
    pending = list(function.body)
    while pending:
        node = pending.pop()
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
            continue
        if isinstance(node, ast.Return) and node.value is not None:
            return True
        pending.extend(ast.iter_child_nodes(node))
    return False


class _Translator:
    def __init__(self, source, tree, dialect):
        self.source = source
        self.source_lines = source.split("\n")
        self.tree = tree
        self.dialect = dialect
        self.out = []
        self.depth = 0
        nodes = list(ast.walk(tree))
        self.functions = {n.name for n in nodes if isinstance(n, ast.FunctionDef)}
        self.names = {n.id for n in nodes if isinstance(n, ast.Name)} | {n.arg for n in nodes if isinstance(n, ast.arg)}
        # names that are given text directly: the only ones int()/float() can honestly be a "string to number" for
        self.text_names = {
            t.id
            for n in nodes
            if isinstance(n, ast.Assign)
            and (_call_to(n.value, "input") or (isinstance(n.value, ast.Constant) and isinstance(n.value.value, str)))
            for t in n.targets
            if isinstance(t, ast.Name)
        }

    def pick(self, aqa, ocr, sqa):
        return {"aqa": aqa, "ocr": ocr, "sqa": sqa}[self.dialect]

    def emit(self, text, indent, source_line, unsupported=False, note=None):
        line = {"text": text, "indent": indent, "sourceLine": source_line}
        if unsupported:
            line["unsupported"] = True
        if note:
            line["note"] = note
        self.out.append(line)

    def _enter(self):
        self.depth += 1
        if self.depth > _MAX_DEPTH:
            raise RecursionError

    # ───────────── expressions ─────────────

    def expr(self, node, minimum=0):
        self._enter()
        text, strength = self._expr(node)
        self.depth -= 1
        return f"({text})" if strength < minimum else text

    def _expr(self, node):
        if isinstance(node, ast.Constant):
            return self._constant(node.value), _ATOM
        if isinstance(node, ast.Name):
            return node.id, _ATOM
        if isinstance(node, ast.List):
            if any(isinstance(e, ast.Starred) for e in node.elts):
                raise _NoEquivalent
            return "[" + ", ".join(self.expr(e) for e in node.elts) + "]", _ATOM
        if isinstance(node, ast.Subscript):
            return self._subscript(node), _ATOM
        if isinstance(node, ast.BinOp):
            return self._binary(node)
        if isinstance(node, ast.UnaryOp):
            if isinstance(node.op, ast.Not):
                # brackets round a comparison: NOT (a < b)
                return "NOT " + self.expr(node.operand, _CMP + 1), _NOT
            if isinstance(node.op, ast.USub):
                return "-" + self.expr(node.operand, _UNARY), _UNARY
            raise _NoEquivalent
        if isinstance(node, ast.BoolOp):
            word, strength = ("AND", _AND) if isinstance(node.op, ast.And) else ("OR", _OR)
            return f" {word} ".join(self.expr(v, strength + 1) for v in node.values), strength
        if isinstance(node, ast.Compare):
            return self._compare(node)
        if isinstance(node, ast.Call):
            return self._call(node), _ATOM
        raise _NoEquivalent

    def _constant(self, value):
        if isinstance(value, bool):
            return "True" if value else "False"
        if isinstance(value, (int, float)):
            return repr(value)
        if isinstance(value, str):
            # AQA examples quote with ', the OCR and SQA ones with "
            return repr(value) if self.dialect == "aqa" else json.dumps(value, ensure_ascii=False)
        raise _NoEquivalent

    def _subscript(self, node):
        indices = []
        base = node
        while isinstance(base, ast.Subscript):
            if isinstance(base.slice, (ast.Slice, ast.Tuple)):
                raise _NoEquivalent
            position = _constant_int(base.slice)
            if position is not None and position < 0:  # counting from the end is Python only
                raise _NoEquivalent
            indices.append(base.slice)
            base = base.value
            if self.dialect != "ocr":
                break
        index_text = ",".join(self.expr(i) for i in reversed(indices))  # OCR writes 2D elements as a[i,j]
        return f"{self.expr(base, _ATOM)}[{index_text}]"

    def _binary(self, node):
        op = node.op
        if isinstance(op, (ast.Mult, ast.Mod)):
            # "-" * 10, [0] * n and "%d" % x are not arithmetic
            sides = (node.left, node.right) if isinstance(op, ast.Mult) else (node.left,)
            if any(isinstance(s, (ast.List, ast.JoinedStr)) or self._is_text(s) for s in sides):
                raise _NoEquivalent
        if isinstance(op, ast.FloorDiv):
            if self.dialect == "sqa":  # no DIV in the SQA reference language
                return f"INT({self.expr(node.left, _MUL)} / {self.expr(node.right, _MUL + 1)})", _ATOM
            symbol, strength = "DIV", _MUL
        elif isinstance(op, ast.Pow):
            if self.dialect == "aqa":  # the AQA guide defines no exponent operator
                raise _NoEquivalent
            return f"{self.expr(node.left, _ATOM)} ^ {self.expr(node.right, _UNARY)}", _POW
        else:
            table = {
                ast.Add: ("+", _ADD),
                ast.Sub: ("-", _ADD),
                ast.Mult: ("*", _MUL),
                ast.Div: ("/", _MUL),
                ast.Mod: ("MOD", _MUL),
            }
            if type(op) not in table:
                raise _NoEquivalent
            symbol, strength = table[type(op)]
        return f"{self.expr(node.left, strength)} {symbol} {self.expr(node.right, strength + 1)}", strength

    @staticmethod
    def _is_text(node):
        return isinstance(node, ast.Constant) and isinstance(node.value, str)

    def _compare(self, node):
        symbols = _COMPARE[self.dialect]
        if any(type(op) not in symbols for op in node.ops):  # in, not in, is, is not
            raise _NoEquivalent
        operands = [node.left, *node.comparators]
        # a < b < c repeats b, which is only the same thing when b is a name or a literal
        if any(not isinstance(m, (ast.Name, ast.Constant)) for m in operands[1:-1]):
            raise _NoEquivalent
        parts = [
            f"{self.expr(left, _CMP + 1)} {symbols[type(op)]} {self.expr(right, _CMP + 1)}"
            for left, op, right in zip(operands, node.ops, operands[1:])
        ]
        return " AND ".join(parts), _CMP if len(parts) == 1 else _AND

    def _call(self, node):
        if not isinstance(node.func, ast.Name) or not _call_to(node, node.func.id):
            raise _NoEquivalent
        name, args = node.func.id, node.args
        if name in self.functions:
            return f"{name}({', '.join(self.expr(a) for a in args)})"
        if name == "len" and len(args) == 1:
            if self.dialect == "ocr":
                return f"{self.expr(args[0], _ATOM)}.length"
            return f"{self.pick('LEN', '', 'LENGTH')}({self.expr(args[0])})"
        if self.dialect == "ocr":
            if (name in ("str", "int", "float") and len(args) == 1) or (name == "input" and len(args) <= 1):
                return f"{name}({', '.join(self.expr(a) for a in args)})"
        if self.dialect == "aqa" and name in ("str", "int", "float") and len(args) == 1:
            return self._aqa_conversion(name, args[0])
        raise _NoEquivalent

    def _aqa_conversion(self, name, arg):
        if name == "str":
            real = (isinstance(arg, ast.Constant) and isinstance(arg.value, float)) or (
                isinstance(arg, ast.BinOp) and isinstance(arg.op, ast.Div)
            )
            return f"{'REAL' if real else 'INT'}_TO_STRING({self.expr(arg)})"
        # AQA only converts FROM a string; int(7 / 2) would be nonsense as STRING_TO_INT
        if not (self._is_text(arg) or (isinstance(arg, ast.Name) and arg.id in self.text_names)):
            raise _NoEquivalent
        return f"STRING_TO_{'INT' if name == 'int' else 'REAL'}({self.expr(arg)})"

    # ───────────── statements ─────────────

    def block(self, statements, indent):
        self._enter()
        for statement in statements:
            self.statement(statement, indent)
        self.depth -= 1

    def statement(self, node, indent):
        mark = len(self.out)
        try:
            if isinstance(node, ast.If):
                self._if(node, indent)
            elif isinstance(node, ast.While) and not node.orelse:
                self._while(node, indent)
            elif isinstance(node, ast.For) and not node.orelse and isinstance(node.target, ast.Name):
                self._for(node, indent)
            elif isinstance(node, ast.FunctionDef):
                self._function(node, indent)
            else:
                self._simple(node, indent)
        except _NoEquivalent:
            del self.out[mark:]
            self._verbatim(node, indent)

    def _verbatim(self, node, indent):
        """Show the original Python of a whole statement, marked as having no equivalent."""
        decorators = getattr(node, "decorator_list", [])
        first = min([node.lineno, *(d.lineno for d in decorators)])
        if first == node.end_lineno:
            self.emit(ast.get_source_segment(self.source, node), indent, first, unsupported=True)
            return
        margin = node.col_offset
        for number in range(first, node.end_lineno + 1):
            raw = self.source_lines[number - 1]
            text = raw[margin:] if not raw[:margin].strip() else raw.lstrip()
            if text.strip():
                self.emit(text.rstrip(), indent, number, unsupported=True)

    def _header(self, build, python, indent, line, note=None):
        """A block header. If it cannot be translated it stays as Python; the body is still translated."""
        try:
            self.emit(build(), indent, line, unsupported=note is not None, note=note)
        except _NoEquivalent:
            self.emit(python(), indent, line, unsupported=True)

    def _python(self, node):
        return " ".join(ast.get_source_segment(self.source, node).split())

    def _is_elif(self, node):
        """``elif`` and ``else:`` + nested ``if`` have the same tree; only the source text differs."""
        if len(node.orelse) != 1 or not isinstance(node.orelse[0], ast.If):
            return False
        inner = node.orelse[0]
        return self.source_lines[inner.lineno - 1].lstrip().startswith("elif")

    def _if_header(self, node, word, indent):
        def build():
            test = self.expr(node.test)
            if self.dialect == "ocr":
                return f"{word} {test} then"
            return f"{'ELSE IF' if word == 'elseif' else 'IF'} {test} THEN"

        python_word = "elif" if word == "elseif" else "if"
        self._header(build, lambda: f"{python_word} {self._python(node.test)}:", indent, node.lineno)

    def _if(self, node, indent):
        end = self.pick("ENDIF", "endif", "END IF")
        otherwise = self.pick("ELSE", "else", "ELSE")
        self._if_header(node, "if", indent)
        self.block(node.body, indent + 1)
        # The SQA summary has no ELSE IF, so each elif becomes an IF nested inside the ELSE
        if self.dialect != "sqa":
            while self._is_elif(node):
                node = node.orelse[0]
                self._if_header(node, "elseif", indent)
                self.block(node.body, indent + 1)
        if node.orelse:
            self.emit(otherwise, indent, None)
            self.block(node.orelse, indent + 1)
        self.emit(end, indent, None)

    def _while(self, node, indent):
        def build():
            test = self.expr(node.test)
            return self.pick(f"WHILE {test}", f"while {test}", f"WHILE {test} DO")

        self._header(build, lambda: f"while {self._python(node.test)}:", indent, node.lineno)
        self.block(node.body, indent + 1)
        self.emit(self.pick("ENDWHILE", "endwhile", "END WHILE"), indent, None)

    def _for(self, node, indent):
        name = node.target.id
        counted = _call_to(node.iter, "range") and "range" not in self.functions
        python = lambda: f"for {name} in {self._python(node.iter)}:"  # noqa: E731
        if counted:
            self._header(lambda: self._counted_for(name, node.iter.args), python, indent, node.lineno)
        else:

            def build():
                items = self.expr(node.iter)
                return self.pick(f"FOR {name} IN {items}", f"for {name} in {items}", f"FOR EACH {name} FROM {items} DO")

            note = _OCR_FOR_EACH_NOTE if self.dialect == "ocr" else None
            self._header(build, python, indent, node.lineno, note)
        self.block(node.body, indent + 1)
        self.emit(self.pick("ENDFOR", f"next {name}", "END FOR" if counted else "END FOR EACH"), indent, None)

    def _counted_for(self, name, args):
        if not 1 <= len(args) <= 3:
            raise _NoEquivalent
        step = _constant_int(args[2]) if len(args) == 3 else 1
        if step is None or step == 0:  # the direction decides the last value, so it must be known
            raise _NoEquivalent
        first = self.expr(args[0]) if len(args) > 1 else "0"
        # range() stops BEFORE its bound, the exam loops include their last value
        last = self._shifted(args[1] if len(args) > 1 else args[0], -1 if step > 0 else 1)
        by = "" if step == 1 else str(step)
        if self.dialect == "ocr":
            return f"for {name}={first} to {last}" + (f" step {by}" if by else "")
        step_text = f" STEP {by}" if by else ""
        if self.dialect == "aqa":
            return f"FOR {name} ← {first} TO {last}{step_text}"
        return f"FOR {name} FROM {first} TO {last}{step_text} DO"

    def _shifted(self, node, by):
        """``node + by`` written tidily: 5 -> 4, n + 1 -> n, n - 1 -> n - 2."""
        value = _constant_int(node)
        if value is not None:
            return str(value + by)
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub)):
            amount = _constant_int(node.right)
            if amount is not None:
                total = (amount if isinstance(node.op, ast.Add) else -amount) + by
                if total == 0:
                    return self.expr(node.left)
                return f"{self.expr(node.left, _ADD)} {'+' if total > 0 else '-'} {abs(total)}"
        return f"{self.expr(node, _ADD)} {'+' if by > 0 else '-'} {abs(by)}"

    def _function(self, node, indent):
        a = node.args
        if node.decorator_list or a.defaults or a.kw_defaults or a.vararg or a.kwarg or a.kwonlyargs or a.posonlyargs:
            raise _NoEquivalent
        signature = f"{node.name}({', '.join(p.arg for p in a.args)})"
        gives_value = _returns_a_value(node)
        if self.dialect == "aqa":
            head, end = f"SUBROUTINE {signature}", "ENDSUBROUTINE"
        elif self.dialect == "ocr":
            kind = "function" if gives_value else "procedure"
            head, end = f"{kind} {signature}", f"end{kind}"
        else:
            kind = "FUNCTION" if gives_value else "PROCEDURE"
            # <...> is the SQA notation for "fill this in": Python does not say what type comes back
            head, end = f"{kind} {signature}" + (" RETURNS <type>" if gives_value else ""), f"END {kind}"
        self.emit(head, indent, node.lineno)
        self.block(node.body, indent + 1)
        self.emit(end, indent, None)

    def _simple(self, node, indent):
        line = node.lineno
        if isinstance(node, ast.Assign):
            self._assign(node.targets, node.value, indent, line)
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            self._assign([node.target], node.value, indent, line)
        elif isinstance(node, ast.AugAssign):
            self._assign_one(node.target, ast.BinOp(left=node.target, op=node.op, right=node.value), indent, line)
        elif isinstance(node, ast.Return) and node.value is not None:
            word = self.pick("RETURN", "return", "RETURN")
            self.emit(f"{word} {self.expr(node.value)}", indent, line)
        elif isinstance(node, ast.Expr) and _call_to(node.value, "print") and "print" not in self.functions:
            self._print(node.value.args, indent, line)
        elif isinstance(node, ast.Expr) and _call_to(node.value, *self.functions):
            self.emit(self.expr(node.value), indent, line)
        else:
            raise _NoEquivalent

    def _print(self, args, indent, line):
        if self.dialect == "sqa":
            values = " & ".join(self.expr(a, _ADD) for a in args) or '""'
            self.emit(f"SEND {values} TO DISPLAY", indent, line)
        elif self.dialect == "ocr":
            self.emit(f"print({', '.join(self.expr(a) for a in args)})", indent, line)
        else:
            self.emit(f"OUTPUT {', '.join(self.expr(a) for a in args) or chr(39) * 2}", indent, line)

    def _set(self, target, value, indent, line):
        """One assignment, from already translated text."""
        self.emit(self.pick(f"{target} ← {value}", f"{target} = {value}", f"SET {target} TO {value}"), indent, line)

    def _target(self, node):
        if not isinstance(node, (ast.Name, ast.Subscript)):
            raise _NoEquivalent
        return self.expr(node)

    def _assign(self, targets, value, indent, line):
        if len(targets) > 1:  # a = b = 0
            simple = isinstance(value, ast.Constant) or (
                isinstance(value, ast.Name) and all(not (isinstance(t, ast.Name) and t.id == value.id) for t in targets)
            )
            if not simple or not all(isinstance(t, ast.Name) for t in targets):
                raise _NoEquivalent
            for target in targets:
                self._assign_one(target, value, indent, line)
        elif isinstance(targets[0], ast.Tuple):
            self._assign_tuple(targets[0].elts, value, indent, line)
        else:
            self._assign_one(targets[0], value, indent, line)

    def _assign_one(self, target, value, indent, line):
        name = self._target(target)
        if self.dialect != "ocr" and "input" not in self.functions and self._read(name, value, indent, line):
            return
        if self.dialect == "ocr" and isinstance(target, ast.Name) and isinstance(value, ast.List):
            self.emit(f"array {name} = {self.expr(value)}", indent, line)
            return
        self._set(name, self.expr(value), indent, line)

    def _read(self, name, value, indent, line):
        """AQA and SQA read the keyboard with a statement; the prompt is a separate output."""
        conversion = None
        if _call_to(value, "int", "float") and len(value.args) == 1 and _call_to(value.args[0], "input"):
            conversion, value = value.func.id, value.args[0]
        if not _call_to(value, "input"):
            return False
        if len(value.args) > 1 or (conversion and self.dialect == "sqa"):
            raise _NoEquivalent
        if value.args:
            self._print(value.args, indent, line)
        if self.dialect == "sqa":
            self.emit(f"RECEIVE {name} FROM KEYBOARD", indent, line)
        else:
            read = f"STRING_TO_{'INT' if conversion == 'int' else 'REAL'}(USERINPUT)" if conversion else "USERINPUT"
            self._set(name, read, indent, line)
        return True

    def _assign_tuple(self, targets, value, indent, line):
        if not isinstance(value, ast.Tuple) or len(value.elts) != len(targets):
            raise _NoEquivalent
        values = value.elts
        if any(isinstance(n, ast.Starred) for n in (*targets, *values)):
            raise _NoEquivalent
        names = [self._target(t) for t in targets]
        # an index that itself looks something up could move while we assign one value at a time
        for target in targets:
            if isinstance(target, ast.Subscript) and any(
                isinstance(n, (ast.Subscript, ast.Call)) for n in ast.walk(target.slice)
            ):
                raise _NoEquivalent
        text = [ast.unparse(t) for t in targets]
        if len(targets) == 2 and [ast.unparse(v) for v in values] == text[::-1]:
            for one, other in (targets, targets[::-1]):
                if isinstance(one, ast.Name) and isinstance(other, ast.Subscript) and one.id in _names_in(other):
                    raise _NoEquivalent
            temp, n = "temp", 1
            while temp in self.names:
                n += 1
                temp = f"temp{n}"
            self.emit(f"{self.pick('#', '//', '#')} swap the two values using {temp}", indent, line)
            self._set(temp, names[0], indent, line)
            self._set(names[0], names[1], indent, line)
            self._set(names[1], temp, indent, line)
            return
        # one at a time is only right when nothing later reads something already overwritten
        changed = set()
        for target, new in zip(targets, values):
            if changed & (_names_in(new) | _names_in(target)) or any(isinstance(n, ast.Call) for n in ast.walk(new)):
                raise _NoEquivalent
            changed.add(_root_name(target))
        for target, new in zip(targets, values):
            self._assign_one(target, new, indent, line)


def _failure(message, line=None):
    result = {"ok": False, "message": message}
    if line:
        result["line"] = line
    return json.dumps(result)


def to_pseudocode(code, dialect):
    """Return a JSON ``PseudoResult``. Never raises for bad user code and never runs it."""
    if dialect not in DIALECTS:
        return _failure("Unknown exam board.")
    source = code.replace("\r\n", "\n").replace("\r", "\n")
    try:
        tree = ast.parse(source)
        translator = _Translator(source, tree, dialect)
        translator.block(tree.body, 0)
    except SyntaxError as error:
        return _failure(f"This is not valid Python yet: {error.msg}", error.lineno)
    except (RecursionError, MemoryError):
        return _failure("This program is nested too deeply to convert.")
    except ValueError:
        return _failure("This program contains characters Python cannot read.")
    return json.dumps({"ok": True, "dialect": dialect, "lines": translator.out}, ensure_ascii=False)
