"""Rasterise PDF pages to PNG with pdftoppm."""

import io
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

MIN_DPI = 72
MAX_DPI = 600


def pdf_to_png(pdf: bytes, dpi: int = 200, timeout: float = 30) -> list[bytes]:
    if not MIN_DPI <= dpi <= MAX_DPI:
        raise ValueError("dpi out of range")
    exe = shutil.which("pdftoppm")
    if exe is None:
        raise RuntimeError("pdftoppm not available")
    with tempfile.TemporaryDirectory(prefix="mathpad-png-") as tmp:
        work = Path(tmp)
        (work / "in.pdf").write_bytes(pdf)
        subprocess.run(  # noqa: S603
            [exe, "-png", "-r", str(dpi), "in.pdf", "page"],
            cwd=work,
            capture_output=True,
            timeout=timeout,
            check=True,
        )
        pages = sorted(work.glob("page-*.png"), key=lambda p: int(p.stem.split("-")[-1]))
        return [p.read_bytes() for p in pages]


def zip_pages(pages: list[bytes], stem: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, data in enumerate(pages, start=1):
            zf.writestr(f"{stem}-{i}.png", data)
    return buf.getvalue()
