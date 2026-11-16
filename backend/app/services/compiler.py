"""Compile a .tex string into PDF bytes with Tectonic (fallback: xelatex)."""

import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from .errors import CompileTimeout, LineError
from .tex_builder import line_id_for_tex_line

COMPILE_TIMEOUT_S = float(os.environ.get("MATHPAD_COMPILE_TIMEOUT", "20"))


def find_engine() -> list[str] | None:
    """Return the base command for the available TeX engine, or None."""
    override = os.environ.get("MATHPAD_TECTONIC")
    if override and Path(override).exists():
        return [override]
    tectonic = shutil.which("tectonic")
    if tectonic:
        return [tectonic]
    xelatex = shutil.which("xelatex")
    if xelatex:
        return [xelatex]
    return None


def _command(engine: list[str], tex_name: str) -> list[str]:
    exe = Path(engine[0]).name
    if exe.startswith("tectonic"):
        # No shell-escape (Tectonic disables it unless -Z shell-escape is given).
        return [*engine, "-X", "compile", "--keep-logs", "--chatter", "minimal", tex_name]
    return [*engine, "-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error", tex_name]


_LOG_LINE_RE = re.compile(r"^l\.(\d+)", re.M)
_ERR_RE = re.compile(r"^! (.+)$", re.M)
_TECTONIC_ERR_RE = re.compile(r"error: [^:\n]*\.tex:(\d+): (.+)")


def parse_error(tex: str, log: str) -> LineError:
    message = "Lỗi biên dịch LaTeX"
    lineno: int | None = None
    m = _TECTONIC_ERR_RE.search(log)
    if m:
        lineno = int(m.group(1))
        message = m.group(2).strip()
    else:
        em = _ERR_RE.search(log)
        if em:
            message = em.group(1).strip()
        lm = _LOG_LINE_RE.search(log)
        if lm:
            lineno = int(lm.group(1))
    line_id = line_id_for_tex_line(tex, lineno) if lineno else None
    return LineError(message, line_id)


def compile_pdf(tex: str, timeout: float | None = None) -> bytes:
    engine = find_engine()
    if engine is None:
        raise RuntimeError("No TeX engine (tectonic/xelatex) available")
    timeout = COMPILE_TIMEOUT_S if timeout is None else timeout
    with tempfile.TemporaryDirectory(prefix="mathpad-") as tmp:
        work = Path(tmp)
        (work / "doc.tex").write_text(tex, encoding="utf-8")
        try:
            proc = subprocess.run(  # noqa: S603 - argument list, no shell
                _command(engine, "doc.tex"),
                cwd=work,
                capture_output=True,
                timeout=timeout,
                check=False,
                stdin=subprocess.DEVNULL,
            )
        except subprocess.TimeoutExpired as exc:
            raise CompileTimeout() from exc
        pdf = work / "doc.pdf"
        if proc.returncode != 0 or not pdf.exists():
            log_path = work / "doc.log"
            log = log_path.read_text(errors="replace") if log_path.exists() else ""
            output = proc.stdout.decode(errors="replace") + proc.stderr.decode(errors="replace")
            raise parse_error(tex, output + "\n" + log)
        return pdf.read_bytes()
