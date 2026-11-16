"""The frontend's offline .tex export (frontend/src/core/texBuilder.ts) is tested
against the same golden files, so both implementations stay identical."""

import json
from pathlib import Path

import pytest

from app.models import Doc
from app.services.errors import LineError
from app.services.normalize import normalize
from app.services.tex_builder import build_tex

from .conftest import fixture_names, load_fixture

GOLDEN = Path(__file__).parent / "golden"


@pytest.mark.parametrize("name", fixture_names())
def test_build_tex_matches_golden(name: str) -> None:
    expected = (GOLDEN / f"{name}.tex").read_text(encoding="utf-8")
    assert build_tex(Doc.model_validate(load_fixture(name))) == expected


def test_template_matches_frontend_copy() -> None:
    template = (Path(__file__).parents[1] / "app/templates/article.tex").read_text()
    ts = (Path(__file__).parents[2] / "frontend/src/core/texBuilder.ts").read_text()
    body = ts.split("export const TEX_TEMPLATE = `", 1)[1].split("`;", 1)[0]
    assert body.replace("\\\\", "\\") == template


@pytest.mark.parametrize(
    "case", json.loads((GOLDEN / "normalize_cases.json").read_text(encoding="utf-8"))
)
def test_normalize_cases(case: dict) -> None:
    if case.get("error"):
        with pytest.raises(LineError):
            normalize(case["in"])
    else:
        assert normalize(case["in"]) == case["out"]
