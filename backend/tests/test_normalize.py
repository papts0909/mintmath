import pytest

from app.services.errors import LineError
from app.services.normalize import normalize


def test_plain_passthrough() -> None:
    assert normalize(r" x^{2}+1 ") == r"x^{2}+1"


def test_empty() -> None:
    assert normalize("") == ""


def test_strip_empty_placeholder() -> None:
    assert normalize(r"\frac{\placeholder{}}{2}") == r"\frac{{}}{2}"


def test_placeholder_keeps_content() -> None:
    assert normalize(r"\placeholder[a]{x}+1") == r"{x}+1"


def test_placeholder_without_braces() -> None:
    assert normalize(r"1+\placeholder") == r"1+{}"


@pytest.mark.parametrize(
    ("src", "expected"),
    [
        (r"\R", r"\mathbb{R}"),
        (r"x\in\N", r"x\in\mathbb{N}"),
        (r"\Z\cup\Q\cup\C", r"\mathbb{Z}\cup\mathbb{Q}\cup\mathbb{C}"),
        (r"\differentialD x", r"\mathrm{d} x"),
        (r"\exponentialE^{x}", r"\mathrm{e}^{x}"),
        (r"\imaginaryI", r"\mathrm{i}"),
        (r"\mleft(x\mright)", r"\left(x\right)"),
        (r"\lbrace x\rbrace", r"\{ x\}"),
    ],
)
def test_macro_mapping(src: str, expected: str) -> None:
    assert normalize(src) == expected


def test_macro_mapping_respects_word_boundary() -> None:
    # \Rightarrow must not become \mathbb{R}ightarrow
    assert normalize(r"\Rightarrow\Re\Nu") == r"\Rightarrow\Re\Nu"


def test_augmented_native_array_kept() -> None:
    src = r"\left[\begin{array}{ccc|c}1&1&2&3\\2&3&5&7\end{array}\right]"
    assert normalize(src) == src


def test_array_spec_spaces_removed() -> None:
    src = r"\left[\begin{array}{c c | c}1&2&3\end{array}\right]"
    assert r"\begin{array}{cc|c}" in normalize(src)


def test_augmented_marker_expanded() -> None:
    src = r"\augmented{1}{\begin{bmatrix}1&2&3\\4&5&6\end{bmatrix}}"
    assert normalize(src) == r"\left[\begin{array}{cc|c}1&2&3\\4&5&6\end{array}\right]"


def test_augmented_marker_two_after() -> None:
    src = r"\augmented{2}{\begin{bmatrix}1&2&3&4\end{bmatrix}}"
    assert r"{cc|cc}" in normalize(src)


def test_augmented_marker_bad() -> None:
    with pytest.raises(LineError):
        normalize(r"\augmented{x}{1}")


@pytest.mark.parametrize(
    "src",
    [
        r"\input{/etc/passwd}",
        r"\include{a}",
        r"\write18{rm -rf /}",
        r"\immediate\write",
        r"\openout1=a",
        r"\read16 to \x",
        r"\def\x{1}",
        r"\catcode`\^=7",
        r"\csname input\endcsname",
        r"\newcommand{\x}{1}",
        r"\usepackage{x}",
        r"x^^5cinput",
    ],
)
def test_forbidden_commands(src: str) -> None:
    with pytest.raises(LineError):
        normalize(src)


def test_forbidden_prefix_not_overmatched() -> None:
    # \defin is not a command we know, but \delta / \inputs-like words must pass
    assert normalize(r"\delta+\inf") == r"\delta+\inf"


@pytest.mark.parametrize("src", [r"\frac{1}{2", r"x}", r"\begin{cases}x"])
def test_unbalanced(src: str) -> None:
    with pytest.raises(LineError):
        normalize(src)
