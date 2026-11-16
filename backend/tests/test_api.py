import io
import zipfile

from fastapi.testclient import TestClient

from app.routers import export

from .conftest import load_fixture, requires_tex


def test_health(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_export_tex(client: TestClient) -> None:
    r = client.post("/api/export/tex", json=load_fixture("sample"))
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/x-tex")
    assert "filename*=UTF-8''Gi%E1%BA%A3i" in r.headers["content-disposition"]
    assert r"\begin{array}{ccc|c}" in r.text


def test_export_tex_invalid_structure(client: TestClient) -> None:
    r = client.post("/api/export/tex", json={"version": 1, "lines": "nope"})
    assert r.status_code == 422


def test_export_wrong_version(client: TestClient) -> None:
    doc = load_fixture("empty")
    doc["version"] = 2
    assert client.post("/api/export/tex", json=doc).status_code == 422


def test_too_many_lines(client: TestClient) -> None:
    doc = load_fixture("empty")
    doc["lines"] = [{"id": f"l{i}", "type": "text", "content": ""} for i in range(2001)]
    assert client.post("/api/export/tex", json=doc).status_code == 422


def test_body_too_large(client: TestClient) -> None:
    doc = load_fixture("empty")
    doc["lines"] = [{"id": f"l{i}", "type": "text", "content": "x" * 15000} for i in range(80)]
    assert client.post("/api/export/tex", json=doc).status_code == 413


def test_forbidden_command_400(client: TestClient) -> None:
    doc = load_fixture("empty")
    doc["lines"] = [
        {"id": "ok", "type": "math", "content": "x"},
        {"id": "evil", "type": "math", "content": r"\input{/etc/passwd}"},
    ]
    for kind in ("tex", "pdf", "png"):
        r = client.post(f"/api/export/{kind}", json=doc)
        assert r.status_code == 400
        assert r.json()["lineId"] == "evil"


def test_png_dpi_range(client: TestClient) -> None:
    doc = load_fixture("empty")
    assert client.post("/api/export/png?dpi=10", json=doc).status_code == 422
    assert client.post("/api/export/png?dpi=601", json=doc).status_code == 422


def test_rate_limit(client: TestClient, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(export.limiter, "limit", 3)
    doc = load_fixture("empty")
    codes = [client.post("/api/export/tex", json=doc).status_code for _ in range(5)]
    assert codes == [200, 200, 200, 429, 429]


def test_file_stem() -> None:
    assert export.file_stem('  Bài: 1/2 "x" ') == "Bài_12_x"
    assert export.file_stem("") == "mathpad"


@requires_tex
def test_export_pdf(client: TestClient) -> None:
    r = client.post("/api/export/pdf", json=load_fixture("sample"))
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")


@requires_tex
def test_export_png_single(client: TestClient) -> None:
    r = client.post("/api/export/png?dpi=72", json=load_fixture("sample"))
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"


@requires_tex
def test_export_png_multi_page_zip(client: TestClient) -> None:
    doc = load_fixture("empty")
    doc["lines"] = [{"id": f"l{i}", "type": "math", "content": f"x_{{{i}}}"} for i in range(80)]
    r = client.post("/api/export/png?dpi=72", json=doc)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/zip"
    assert len(zipfile.ZipFile(io.BytesIO(r.content)).namelist()) >= 2


@requires_tex
def test_compile_error_400(client: TestClient) -> None:
    doc = load_fixture("empty")
    doc["lines"] = [{"id": "bad", "type": "math", "content": r"\nosuchmacro"}]
    r = client.post("/api/export/pdf", json=doc)
    assert r.status_code == 400
    assert r.json()["lineId"] == "bad"


def test_timeout_504(client: TestClient, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    from app.services.errors import CompileTimeout

    def boom(_tex: str) -> bytes:
        raise CompileTimeout()

    monkeypatch.setattr(export.compiler, "compile_pdf", boom)
    r = client.post("/api/export/pdf", json=load_fixture("empty"))
    assert r.status_code == 504
