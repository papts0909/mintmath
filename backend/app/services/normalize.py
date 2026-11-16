"""Convert LaTeX produced by MathLive into LaTeX that XeTeX/amsmath can compile.

Also acts as the security gate: user math goes straight into the .tex file, so
commands that touch files or redefine the macro machinery are rejected.
"""

import re

from .errors import LineError

FORBIDDEN_COMMANDS = (
    "input",
    "include",
    "includeonly",
    "write",
    "immediate",
    "openout",
    "openin",
    "read",
    "readline",
    "def",
    "edef",
    "gdef",
    "xdef",
    "let",
    "futurelet",
    "newcommand",
    "renewcommand",
    "providecommand",
    "DeclareRobustCommand",
    "catcode",
    "csname",
    "endcsname",
    "expandafter",
    "special",
    "usepackage",
    "RequirePackage",
    "documentclass",
    "directlua",
    "write18",
    "ShellEscape",
    "jobname",
    "endinput",
)

_FORBIDDEN_RE = re.compile(
    r"\\(" + "|".join(re.escape(c) for c in FORBIDDEN_COMMANDS) + r")(?![A-Za-z])"
)

# MathLive-specific macros -> standard LaTeX. Order matters only for prefixes;
# every pattern requires that no letter follows the command name.
_MACRO_MAP: dict[str, str] = {
    "differentialD": r"\mathrm{d}",
    "capitalDifferentialD": r"\mathrm{D}",
    "exponentialE": r"\mathrm{e}",
    "imaginaryI": r"\mathrm{i}",
    "imaginaryJ": r"\mathrm{j}",
    "mleft": r"\left",
    "mright": r"\right",
    "R": r"\mathbb{R}",
    "N": r"\mathbb{N}",
    "Z": r"\mathbb{Z}",
    "Q": r"\mathbb{Q}",
    "C": r"\mathbb{C}",
    "doubleStruckCapitalR": r"\mathbb{R}",
    "doubleStruckCapitalN": r"\mathbb{N}",
    "doubleStruckCapitalZ": r"\mathbb{Z}",
    "doubleStruckCapitalQ": r"\mathbb{Q}",
    "doubleStruckCapitalC": r"\mathbb{C}",
    "lbrace": r"\{",
    "rbrace": r"\}",
}
_MACRO_RE = re.compile(
    r"\\(" + "|".join(sorted(_MACRO_MAP, key=len, reverse=True)) + r")(?![A-Za-z])"
)


def _find_group_end(s: str, start: int) -> int:
    """`s[start]` is '{' (or '['); return index of the matching closer."""
    opener = s[start]
    closer = "}" if opener == "{" else "]"
    depth = 0
    i = start
    while i < len(s):
        ch = s[i]
        if ch == "\\":
            i += 2
            continue
        if ch == opener:
            depth += 1
        elif ch == closer:
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise LineError("Thiếu dấu ngoặc đóng")


def _strip_placeholders(s: str) -> str:
    """`\\placeholder[id]{x}` -> `x`; `\\placeholder{}` -> `{}`."""
    out: list[str] = []
    i = 0
    token = "\\placeholder"
    while True:
        j = s.find(token, i)
        if j < 0 or (j + len(token) < len(s) and s[j + len(token)].isalpha()):
            if j < 0:
                out.append(s[i:])
                break
            out.append(s[i : j + len(token)])
            i = j + len(token)
            continue
        out.append(s[i:j])
        k = j + len(token)
        while k < len(s) and s[k] == " ":
            k += 1
        if k < len(s) and s[k] == "[":
            k = _find_group_end(s, k) + 1
        while k < len(s) and s[k] == " ":
            k += 1
        if k < len(s) and s[k] == "{":
            end = _find_group_end(s, k)
            out.append("{" + s[k + 1 : end] + "}")
            i = end + 1
        else:
            out.append("{}")
            i = k
    return "".join(out)


_AUG_TOKEN = "\\augmented"


def _expand_augmented(s: str) -> str:
    """`\\augmented{k}{\\begin{bmatrix}...\\end{bmatrix}}` -> bracketed array with a
    vertical rule before the last k columns (fallback encoding, see DECISIONS.md)."""
    while True:
        j = s.find(_AUG_TOKEN)
        if j < 0:
            return s
        k = j + len(_AUG_TOKEN)
        if k >= len(s) or s[k] != "{":
            raise LineError("Cú pháp \\augmented không hợp lệ")
        e1 = _find_group_end(s, k)
        try:
            after = int(s[k + 1 : e1].strip())
        except ValueError as exc:
            raise LineError("Cú pháp \\augmented không hợp lệ") from exc
        if e1 + 1 >= len(s) or s[e1 + 1] != "{":
            raise LineError("Cú pháp \\augmented không hợp lệ")
        e2 = _find_group_end(s, e1 + 1)
        body = s[e1 + 2 : e2]
        m = re.fullmatch(r"\s*\\begin\{[bpv]?matrix\}(.*)\\end\{[bpv]?matrix\}\s*", body, re.S)
        inner = m.group(1) if m else body
        s = s[:j] + _augmented_array(inner, after) + s[e2 + 1 :]


def _count_cols(rows_src: str) -> int:
    depth = 0
    best = 1
    cols = 1
    i = 0
    while i < len(rows_src):
        ch = rows_src[i]
        if ch == "\\":
            if rows_src.startswith("\\\\", i) and depth == 0:
                best = max(best, cols)
                cols = 1
            i += 2
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        elif ch == "&" and depth == 0:
            cols += 1
        i += 1
    return max(best, cols)


def _augmented_array(inner: str, after: int) -> str:
    n = _count_cols(inner)
    after = max(1, min(after, n - 1)) if n > 1 else 0
    spec = "c" * (n - after) + ("|" + "c" * after if after else "")
    return r"\left[\begin{array}{" + spec + "}" + inner + r"\end{array}\right]"


def _fix_array_brackets(s: str) -> str:
    # MathLive may emit \left\lbrack ... \right\rbrack - valid, keep. Normalise
    # a column spec written with spaces, e.g. {c c c | c}.
    return re.sub(
        r"\\begin\{array\}\{([clr|\s]+)\}",
        lambda m: r"\begin{array}{" + re.sub(r"\s+", "", m.group(1)) + "}",
        s,
    )


def check_safe(latex: str) -> None:
    if "^^" in latex:
        raise LineError("Không cho phép chuỗi ^^ trong công thức")
    m = _FORBIDDEN_RE.search(latex)
    if m:
        raise LineError(f"Lệnh \\{m.group(1)} không được phép")


def normalize(latex: str) -> str:
    check_safe(latex)
    s = latex.strip()
    s = _strip_placeholders(s)
    s = _MACRO_RE.sub(lambda m: _MACRO_MAP[m.group(1)], s)
    s = _expand_augmented(s)
    s = _fix_array_brackets(s)
    _check_balanced(s)
    check_safe(s)
    return s.strip()


def _check_balanced(s: str) -> None:
    depth = 0
    i = 0
    while i < len(s):
        ch = s[i]
        if ch == "\\":
            i += 2
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth < 0:
                raise LineError("Thừa dấu ngoặc đóng }")
        i += 1
    if depth:
        raise LineError("Thiếu dấu ngoặc đóng }")
    begins = re.findall(r"\\begin\{([^}]*)\}", s)
    ends = re.findall(r"\\end\{([^}]*)\}", s)
    if sorted(begins) != sorted(ends):
        raise LineError("\\begin và \\end không khớp")
