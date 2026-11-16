from app.models import Doc
from app.services.tex_builder import build_body, build_tex, escape_text, line_id_for_tex_line


def make(lines: list[dict], title: str = "") -> Doc:
    return Doc.model_validate(
        {"version": 1, "id": "d", "title": title, "updatedAt": "x", "lines": lines}
    )


def test_escape_text() -> None:
    assert escape_text(r"a\b{c}$&#_%^~") == (
        r"a\textbackslash{}b\{c\}\$\&\#\_\%\textasciicircum{}\textasciitilde{}"
    )


def test_title_section() -> None:
    body = build_body(make([], title="Bài 1 & 2"))
    assert r"\section*{Bài 1 \& 2}" in body


def test_blank_title_omitted() -> None:
    assert r"\section*" not in build_body(make([], title="   "))


def test_single_math_line() -> None:
    body = build_body(make([{"id": "a", "type": "math", "content": "x+1"}]))
    assert "% line:a\n\\[ x+1 \\]" in body


def test_empty_math_skipped() -> None:
    body = build_body(make([{"id": "a", "type": "math", "content": "  "}]))
    assert "line:a" not in body
    assert r"\[" not in body


def test_text_line() -> None:
    body = build_body(make([{"id": "t", "type": "text", "content": "Xin chào 50%"}]))
    assert "% line:t\nXin chào 50\\%" in body


def test_joined_math_lines_become_align() -> None:
    body = build_body(
        make(
            [
                {"id": "a", "type": "math", "content": "a=b"},
                {"id": "b", "type": "math", "content": "=c", "joinPrev": True},
                {"id": "c", "type": "math", "content": "&=d", "joinPrev": True},
                {"id": "d", "type": "math", "content": "e"},
            ]
        )
    )
    expected = (
        "\\begin{align*}\n% line:a\n& a=b \\\\\n% line:b\n& =c \\\\\n% line:c\n&=d\n\\end{align*}"
    )
    assert expected in body
    assert "% line:d\n\\[ e \\]" in body


def test_matrix_ampersand_not_alignment() -> None:
    body = build_body(
        make(
            [
                {"id": "a", "type": "math", "content": r"\begin{bmatrix}1&2\end{bmatrix}"},
                {"id": "b", "type": "math", "content": "=0", "joinPrev": True},
            ]
        )
    )
    assert "& \\begin{bmatrix}1&2\\end{bmatrix}" in body


def test_joinprev_on_text_ignored() -> None:
    body = build_body(
        make(
            [
                {"id": "a", "type": "text", "content": "t"},
                {"id": "b", "type": "math", "content": "x", "joinPrev": True},
            ]
        )
    )
    assert "\\[ x \\]" in body


def test_template_wraps_body() -> None:
    tex = build_tex(make([{"id": "a", "type": "math", "content": "x"}]))
    assert tex.startswith(r"\documentclass")
    assert "%%BODY%%" not in tex
    assert tex.rstrip().endswith(r"\end{document}")


def test_line_id_lookup() -> None:
    tex = "a\n% line:x1\n\\[ y \\]\n% line:x2\nfoo\n"
    assert line_id_for_tex_line(tex, 3) == "x1"
    assert line_id_for_tex_line(tex, 5) == "x2"
    assert line_id_for_tex_line(tex, 1) is None
