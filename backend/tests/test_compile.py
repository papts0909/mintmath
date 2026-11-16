import io
import zipfile

import pytest

from app.models import Doc
from app.services.compiler import compile_pdf, parse_error
from app.services.errors import LineError
from app.services.raster import pdf_to_png, zip_pages
from app.services.tex_builder import build_tex

from .conftest import fixture_names, load_fixture, requires_tex


def test_at_least_six_fixtures() -> None:
    assert len(fixture_names()) >= 6


@requires_tex
@pytest.mark.parametrize("name", fixture_names())
def test_fixture_compiles(name: str) -> None:
    pdf = compile_pdf(build_tex(Doc.model_validate(load_fixture(name))))
    assert pdf.startswith(b"%PDF")


@requires_tex
def test_sample_png() -> None:
    pdf = compile_pdf(build_tex(Doc.model_validate(load_fixture("sample"))))
    pages = pdf_to_png(pdf, 100)
    assert len(pages) >= 1
    assert pages[0].startswith(b"\x89PNG")


@requires_tex
def test_compile_error_maps_to_line() -> None:
    doc = Doc.model_validate(
        {
            "version": 1,
            "id": "e",
            "title": "",
            "updatedAt": "x",
            "lines": [
                {"id": "ok", "type": "math", "content": "x"},
                {"id": "bad", "type": "math", "content": r"\frac{1}{2}\undefinedmacro"},
            ],
        }
    )
    with pytest.raises(LineError) as exc:
        compile_pdf(build_tex(doc))
    assert exc.value.line_id == "bad"


def test_parse_error_tex_log() -> None:
    tex = "a\n% line:L7\n\\[ \\oops \\]\n"
    err = parse_error(tex, "! Undefined control sequence.\nl.3 \\[ \\oops\n")
    assert err.line_id == "L7"
    assert "Undefined" in err.message


def test_parse_error_tectonic_style() -> None:
    tex = "a\n% line:Q\n\\[ x \\]\n"
    err = parse_error(tex, "error: doc.tex:3: Undefined control sequence")
    assert err.line_id == "Q"


def test_zip_pages() -> None:
    data = zip_pages([b"1", b"2"], "doc")
    names = zipfile.ZipFile(io.BytesIO(data)).namelist()
    assert names == ["doc-1.png", "doc-2.png"]
