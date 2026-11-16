"""Build a complete .tex document from a Doc."""

from pathlib import Path

from ..models import Doc, Line
from .errors import LineError
from .normalize import normalize

TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "templates" / "article.tex"

_TEXT_ESCAPES = {
    "\\": r"\textbackslash{}",
    "{": r"\{",
    "}": r"\}",
    "$": r"\$",
    "&": r"\&",
    "#": r"\#",
    "_": r"\_",
    "%": r"\%",
    "^": r"\textasciicircum{}",
    "~": r"\textasciitilde{}",
}


def escape_text(text: str) -> str:
    return "".join(_TEXT_ESCAPES.get(ch, ch) for ch in text)


def _math(line: Line) -> str:
    try:
        return normalize(line.content)
    except LineError as exc:
        raise LineError(exc.message, line.id) from exc


def build_body(doc: Doc) -> str:
    parts: list[str] = []
    if doc.title.strip():
        parts.append(r"\section*{" + escape_text(doc.title.strip()) + "}")

    lines = doc.lines
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.type == "text":
            parts.append(f"% line:{line.id}")
            text = escape_text(line.content)
            parts.append(text if text.strip() else r"\medskip")
            parts.append("")
            i += 1
            continue

        # Gather a math block: this line plus following joinPrev math lines.
        block = [line]
        j = i + 1
        while j < len(lines) and lines[j].type == "math" and lines[j].joinPrev:
            block.append(lines[j])
            j += 1
        i = j

        rendered = [(ln, _math(ln)) for ln in block]
        rendered = [(ln, tex) for ln, tex in rendered if tex]
        if not rendered:
            continue
        if len(rendered) == 1:
            ln, tex = rendered[0]
            parts.append(f"% line:{ln.id}")
            parts.append(r"\[ " + tex + r" \]")
        else:
            parts.append(r"\begin{align*}")
            for k, (ln, tex) in enumerate(rendered):
                parts.append(f"% line:{ln.id}")
                sep = r" \\" if k < len(rendered) - 1 else ""
                body = tex if "&" in _top_level(tex) else "& " + tex
                parts.append(body + sep)
            parts.append(r"\end{align*}")
        parts.append("")
    if not parts:
        parts.append(r"\null")  # an empty document still yields one blank page
    return "\n".join(parts)


def _top_level(tex: str) -> str:
    """Strip environment bodies so '&' inside matrices is not mistaken for align."""
    out = []
    depth = 0
    i = 0
    while i < len(tex):
        if tex.startswith("\\begin{", i):
            depth += 1
        elif tex.startswith("\\end{", i):
            depth -= 1
        if depth == 0:
            out.append(tex[i])
        i += 1
    return "".join(out)


def build_tex(doc: Doc) -> str:
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    return template.replace("%%BODY%%", build_body(doc))


def line_id_for_tex_line(tex: str, lineno: int) -> str | None:
    """Return the id of the doc line that produced .tex line `lineno` (1-based)."""
    src = tex.splitlines()
    for idx in range(min(lineno, len(src)) - 1, -1, -1):
        s = src[idx].strip()
        if s.startswith("% line:"):
            return s[len("% line:") :].strip()
    return None
