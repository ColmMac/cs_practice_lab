"""pseudocode.py: Python -> AQA / OCR / SQA. The goldens were written by hand before the converter."""

import json
from pathlib import Path

import pytest

import pseudocode  # conftest puts src/languages/python on sys.path

ROOT = Path(__file__).resolve().parents[2]
PRESETS = ROOT / "src" / "languages" / "python" / "presets"
GOLDENS = ROOT / "tests" / "fixtures" / "pseudocode"
IDS = [p["id"] for p in json.loads((PRESETS / "presets.json").read_text(encoding="utf-8"))]


def convert(code, dialect="aqa"):
    return json.loads(pseudocode.to_pseudocode(code, dialect))


def as_text(result):
    out = []
    for line in result["lines"]:
        mark = ""
        if line.get("unsupported"):
            mark = f"  [! {line['note']}]" if "note" in line else "  [!]"
        out.append("    " * line["indent"] + line["text"] + mark)
    return "\n".join(out) + "\n"


def text(code, dialect="aqa"):
    result = convert(code, dialect)
    assert result["ok"], result
    return as_text(result).rstrip("\n").split("\n")


@pytest.mark.parametrize("dialect", pseudocode.DIALECTS)
@pytest.mark.parametrize("preset", IDS)
def test_preset_golden(preset, dialect):
    code = (PRESETS / f"{preset}.py").read_text(encoding="utf-8")
    golden = (GOLDENS / f"{preset}.{dialect}.txt").read_text(encoding="utf-8")
    assert as_text(convert(code, dialect)) == golden


def test_source_lines_follow_the_python_and_closers_have_none():
    code = (PRESETS / "linear-search.py").read_text(encoding="utf-8")
    found = [(line["text"], line["sourceLine"]) for line in convert(code)["lines"]]
    assert ("WHILE i < LEN(items) AND NOT found", 5) in found
    assert ("ELSE", None) in found
    assert ("ENDWHILE", None) in found
    assert found[-1] == ("OUTPUT found, i", 10)


def test_syntax_error_gives_a_message_and_no_partial_pseudocode():
    result = convert("x = 1\nwhile x >\n    x = 2")
    assert result["ok"] is False
    assert result["line"] == 2
    assert "lines" not in result
    assert "valid Python" in result["message"]


@pytest.mark.parametrize("code", ["x = " + "(" * 500 + "1" + ")" * 500, "x = " + "1+" * 5000 + "1", "x = " + "-" * 5000 + "1"])
def test_deep_nesting_fails_cleanly(code):
    result = convert(code)
    assert result["ok"] is False
    assert "lines" not in result


def test_null_byte_and_unknown_dialect_fail_cleanly():
    assert convert("x = 1\x00")["ok"] is False
    assert convert("x = 1", "ib")["ok"] is False


def test_empty_program():
    assert convert("")["lines"] == []


@pytest.mark.parametrize("dialect", pseudocode.DIALECTS)
def test_nothing_is_ever_executed(dialect, tmp_path):
    marker = tmp_path / "ran"
    code = f"open({str(marker)!r}, 'w')\nraise SystemExit(1)\nimport does_not_exist\n"
    assert convert(code, dialect)["ok"]
    assert not marker.exists()


@pytest.mark.parametrize(
    "code",
    [
        "x = [n for n in items]",
        "f = lambda a: a",
        "x = items[1:3]",
        "x = items[-1]",
        "x = a if b else c",
        "x = (1, 2)",
        "x = {'a': 1}",
        "x = None",
        "x = f'{a}'",
        "x = [0] * 5",
        "x = '-' * 5",
        "x = a in b",
        "x = a is b",
        "x = a & b",
        "x = sum(a)",
        "x = a.upper()",
        "x = 0 < f(a) < 3",
        "items.append(1)",
        "import random",
        "print(a, end='')",
        "a, b = pair",
        "a, b = b, a + b",
        "i, a[i] = a[i], i",
        "x = y = f()",
        "return",
        "pass",
    ],
)
@pytest.mark.parametrize("dialect", pseudocode.DIALECTS)
def test_constructs_without_an_equivalent_stay_visible_and_marked(code, dialect):
    (line,) = convert(code, dialect)["lines"]
    assert line["unsupported"] is True
    assert line["text"] == code


@pytest.mark.parametrize(
    "code",
    [
        "try:\n    x = 1\nexcept ValueError:\n    x = 2",
        "with open('a') as f:\n    x = 1",
        "class A:\n    pass",
        "for i in items:\n    x = 1\nelse:\n    x = 2",
        "while x:\n    x = 1\nelse:\n    x = 2",
        "for a, b in pairs:\n    x = 1",
        "def f(a=1):\n    return a",
        "@cache\ndef f(a):\n    return a",
    ],
)
def test_whole_blocks_without_an_equivalent_keep_every_line(code):
    lines = convert(code)["lines"]
    assert [line["text"] for line in lines] == code.split("\n")
    assert all(line["unsupported"] for line in lines)
    assert [line["sourceLine"] for line in lines] == list(range(1, len(lines) + 1))


def test_an_unsupported_block_inside_a_loop_keeps_its_indent():
    assert text("while x:\n    try:\n        y = 1\n    finally:\n        y = 2") == [
        "WHILE x",
        "    try:  [!]",
        "        y = 1  [!]",
        "    finally:  [!]",
        "        y = 2  [!]",
        "ENDWHILE",
    ]


@pytest.mark.parametrize(
    ("loop", "aqa", "ocr", "sqa"),
    [
        ("range(5)", "FOR i ← 0 TO 4", "for i=0 to 4", "FOR i FROM 0 TO 4 DO"),
        ("range(2, 8)", "FOR i ← 2 TO 7", "for i=2 to 7", "FOR i FROM 2 TO 7 DO"),
        ("range(1, n + 1)", "FOR i ← 1 TO n", "for i=1 to n", "FOR i FROM 1 TO n DO"),
        ("range(a, b)", "FOR i ← a TO b - 1", "for i=a to b - 1", "FOR i FROM a TO b - 1 DO"),
        ("range(n * 2)", "FOR i ← 0 TO n * 2 - 1", "for i=0 to n * 2 - 1", "FOR i FROM 0 TO n * 2 - 1 DO"),
        ("range(0, 10, 2)", "FOR i ← 0 TO 9 STEP 2", "for i=0 to 9 step 2", "FOR i FROM 0 TO 9 STEP 2 DO"),
        ("range(5, 0, -1)", "FOR i ← 5 TO 1 STEP -1", "for i=5 to 1 step -1", "FOR i FROM 5 TO 1 STEP -1 DO"),
        ("range(n, -1, -2)", "FOR i ← n TO 0 STEP -2", "for i=n to 0 step -2", "FOR i FROM n TO 0 STEP -2 DO"),
    ],
)
def test_range_forms(loop, aqa, ocr, sqa):
    code = f"for i in {loop}:\n    x = i"
    assert [text(code, d)[0] for d in pseudocode.DIALECTS] == [aqa, ocr, sqa]


@pytest.mark.parametrize("loop", ["range(0, 10, step)", "range(0, 10, 0)", "range()", "enumerate(items)"])
def test_loop_header_without_an_equivalent_keeps_the_body_translated(loop):
    assert text(f"for i in {loop}:\n    x += 1") == [f"for i in {loop}:  [!]", "    x ← x + 1", "ENDFOR"]


def test_for_each_closers():
    code = "for c in word:\n    print(c)"
    assert text(code, "aqa")[-1] == "ENDFOR"
    assert text(code, "ocr")[-1] == "next c"
    assert text(code, "sqa")[-1] == "END FOR EACH"


def test_elif_is_flat_in_aqa_and_ocr_and_nested_in_sqa():
    code = "if a:\n    x = 1\nelif b:\n    x = 2\nelse:\n    x = 3"
    assert text(code, "aqa") == ["IF a THEN", "    x ← 1", "ELSE IF b THEN", "    x ← 2", "ELSE", "    x ← 3", "ENDIF"]
    assert text(code, "ocr") == ["if a then", "    x = 1", "elseif b then", "    x = 2", "else", "    x = 3", "endif"]
    assert text(code, "sqa") == [
        "IF a THEN",
        "    SET x TO 1",
        "ELSE",
        "    IF b THEN",
        "        SET x TO 2",
        "    ELSE",
        "        SET x TO 3",
        "    END IF",
        "END IF",
    ]


def test_else_followed_by_if_is_not_an_elif():
    code = "if a:\n    x = 1\nelse:\n    if b:\n        x = 2"
    assert text(code) == ["IF a THEN", "    x ← 1", "ELSE", "    IF b THEN", "        x ← 2", "    ENDIF", "ENDIF"]


@pytest.mark.parametrize(
    ("code", "aqa", "ocr", "sqa"),
    [
        ("x = (a + b) * c", "x ← (a + b) * c", "x = (a + b) * c", "SET x TO (a + b) * c"),
        ("x = a - (b - c)", "x ← a - (b - c)", "x = a - (b - c)", "SET x TO a - (b - c)"),
        ("x *= a + b", "x ← x * (a + b)", "x = x * (a + b)", "SET x TO x * (a + b)"),
        ("x = (a + b) // 2", "x ← (a + b) DIV 2", "x = (a + b) DIV 2", "SET x TO INT((a + b) / 2)"),
        ("x = a != b or not a <= b", "x ← a ≠ b OR NOT (a ≤ b)", "x = a != b OR NOT (a <= b)", "SET x TO a ≠ b OR NOT (a ≤ b)"),
        ("x = (a or b) and c", "x ← (a OR b) AND c", "x = (a OR b) AND c", "SET x TO (a OR b) AND c"),
        ("x = 0 <= i < n", "x ← 0 ≤ i AND i < n", "x = 0 <= i AND i < n", "SET x TO 0 ≤ i AND i < n"),
        ("print()", "OUTPUT ''", "print()", 'SEND "" TO DISPLAY'),
        ("a, b = 1, 2", "a ← 1", "a = 1", "SET a TO 1"),
    ],
)
def test_expressions(code, aqa, ocr, sqa):
    assert [text(code, d)[0] for d in pseudocode.DIALECTS] == [aqa, ocr, sqa]


def test_exponent():
    assert text("x = 2 ** n", "aqa") == ["x = 2 ** n  [!]"]
    assert text("x = 2 ** n", "ocr") == ["x = 2 ^ n"]
    assert text("x = (-2) ** 2", "sqa") == ["SET x TO (-2) ^ 2"]


def test_number_input():
    code = 'age = int(input("Age? "))'
    assert text(code, "aqa") == ["OUTPUT 'Age? '", "age ← STRING_TO_INT(USERINPUT)"]
    assert text(code, "ocr") == ['age = int(input("Age? "))']
    assert text(code, "sqa") == [f"{code}  [!]"]  # the summary does not say how to read a number
    assert text("name = input()", "sqa") == ["RECEIVE name FROM KEYBOARD"]


def test_aqa_only_converts_from_text():
    assert text("s = input()\nn = int(s)") == ["s ← USERINPUT", "n ← STRING_TO_INT(s)"]
    assert text("n = int(a / 2)") == ["n = int(a / 2)  [!]"]
    assert text("s = str(n)") == ["s ← INT_TO_STRING(n)"]
    assert text("s = str(a / 2)") == ["s ← REAL_TO_STRING(a / 2)"]


def test_the_swap_temp_does_not_clash_with_a_variable():
    assert text("temp = 1\na, b = b, a")[1:] == [
        "# swap the two values using temp2",
        "temp2 ← a",
        "a ← b",
        "b ← temp2",
    ]


def test_procedures_and_functions():
    code = "def show(a):\n    print(a)\nshow(1)"
    assert text(code, "ocr") == ["procedure show(a)", "    print(a)", "endprocedure", "show(1)"]
    assert text(code, "sqa") == ["PROCEDURE show(a)", "    SEND a TO DISPLAY", "END PROCEDURE", "show(1)"]
    assert text(code, "aqa")[0] == "SUBROUTINE show(a)"


def test_a_multi_line_condition_is_one_line():
    result = convert("while (a and\n       b):\n    x = 1")
    assert (result["lines"][0]["text"], result["lines"][0]["sourceLine"]) == ("WHILE a AND b", 1)


def test_windows_line_endings():
    assert text("if a:\r\n    x = 1\r\n") == ["IF a THEN", "    x ← 1", "ENDIF"]
