import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .routers import export

MAX_BODY_BYTES = 1_000_000

logging.basicConfig(level=os.environ.get("MATHPAD_LOG_LEVEL", "INFO"))

app = FastAPI(title="MathPad export API", version="0.1.0")

_origins = [o.strip() for o in os.environ.get("MATHPAD_CORS_ORIGINS", "").split(",") if o.strip()]
if _origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
        expose_headers=["Content-Disposition"],
    )


@app.middleware("http")
async def limit_body_size(request: Request, call_next):  # type: ignore[no-untyped-def]
    if request.method == "POST":
        length = request.headers.get("content-length")
        if length is not None:
            try:
                too_big = int(length) > MAX_BODY_BYTES
            except ValueError:
                return JSONResponse({"message": "Content-Length không hợp lệ"}, status_code=400)
            if too_big:
                return JSONResponse({"message": "Tài liệu vượt quá 1 MB"}, status_code=413)
        else:
            body = await request.body()
            if len(body) > MAX_BODY_BYTES:
                return JSONResponse({"message": "Tài liệu vượt quá 1 MB"}, status_code=413)
    return await call_next(request)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(export.router)
