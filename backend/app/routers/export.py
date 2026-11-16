import asyncio
import logging
import os
import re
import time
import unicodedata
from urllib.parse import quote

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool

from ..models import Doc
from ..services import compiler, raster
from ..services.errors import CompileTimeout, LineError
from ..services.ratelimit import RateLimiter
from ..services.tex_builder import build_tex

log = logging.getLogger("mathpad.export")
router = APIRouter(prefix="/api/export")

_compile_slots = asyncio.Semaphore(int(os.environ.get("MATHPAD_MAX_CONCURRENT", "2")))
limiter = RateLimiter(int(os.environ.get("MATHPAD_RATE_LIMIT", "20")), 60.0)


def file_stem(title: str) -> str:
    stem = unicodedata.normalize("NFC", title).strip()
    stem = re.sub(r"[\\/:*?\"<>|\x00-\x1f]+", "", stem)
    stem = re.sub(r"\s+", "_", stem)[:80]
    return stem or "mathpad"


def _ascii_stem(stem: str) -> str:
    s = unicodedata.normalize("NFKD", stem.replace("đ", "d").replace("Đ", "D"))
    s = s.encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9_.-]", "", s) or "mathpad"


def _disposition(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1]
    fallback = _ascii_stem(filename.rsplit(".", 1)[0]) + "." + ext
    return f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(filename)}"


def _client_key(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd and os.environ.get("MATHPAD_TRUST_PROXY") == "1":
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _error(status: int, message: str, line_id: str | None = None) -> JSONResponse:
    return JSONResponse({"lineId": line_id, "message": message}, status_code=status)


def _rate_limited(request: Request) -> JSONResponse | None:
    if not limiter.allow(_client_key(request)):
        return _error(429, "Quá nhiều yêu cầu, vui lòng thử lại sau ít phút")
    return None


async def _compile(doc: Doc) -> bytes:
    tex = build_tex(doc)
    async with _compile_slots:
        started = time.perf_counter()
        try:
            return await run_in_threadpool(compiler.compile_pdf, tex)
        finally:
            log.info(
                "compile doc=%s lines=%d took=%.2fs",
                doc.id,
                len(doc.lines),
                time.perf_counter() - started,
            )


@router.post("/tex")
async def export_tex(doc: Doc, request: Request) -> Response:
    if (limited := _rate_limited(request)) is not None:
        return limited
    try:
        tex = build_tex(doc)
    except LineError as exc:
        return _error(400, exc.message, exc.line_id)
    return Response(
        tex.encode("utf-8"),
        media_type="text/x-tex; charset=utf-8",
        headers={"Content-Disposition": _disposition(file_stem(doc.title) + ".tex")},
    )


async def _pdf_or_error(doc: Doc) -> bytes | JSONResponse:
    try:
        return await _compile(doc)
    except LineError as exc:
        return _error(400, exc.message, exc.line_id)
    except CompileTimeout:
        return _error(504, "Biên dịch quá thời gian cho phép")
    except RuntimeError as exc:
        log.exception("compile failed")
        return _error(503, f"Máy chủ chưa sẵn sàng biên dịch: {exc}")


@router.post("/pdf")
async def export_pdf(doc: Doc, request: Request) -> Response:
    if (limited := _rate_limited(request)) is not None:
        return limited
    result = await _pdf_or_error(doc)
    if isinstance(result, JSONResponse):
        return result
    return Response(
        result,
        media_type="application/pdf",
        headers={"Content-Disposition": _disposition(file_stem(doc.title) + ".pdf")},
    )


@router.post("/png")
async def export_png(
    doc: Doc,
    request: Request,
    dpi: int = Query(200, ge=raster.MIN_DPI, le=raster.MAX_DPI),
) -> Response:
    if (limited := _rate_limited(request)) is not None:
        return limited
    result = await _pdf_or_error(doc)
    if isinstance(result, JSONResponse):
        return result
    try:
        pages = await run_in_threadpool(raster.pdf_to_png, result, dpi)
    except Exception as exc:  # noqa: BLE001
        log.exception("rasterise failed")
        return _error(500, f"Không chuyển được PDF sang PNG: {exc}")
    stem = file_stem(doc.title)
    if len(pages) == 1:
        return Response(
            pages[0],
            media_type="image/png",
            headers={"Content-Disposition": _disposition(stem + ".png")},
        )
    return Response(
        raster.zip_pages(pages, _ascii_stem(stem)),
        media_type="application/zip",
        headers={"Content-Disposition": _disposition(stem + ".zip")},
    )
