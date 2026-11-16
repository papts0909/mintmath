import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers.export import limiter
from app.services.compiler import find_engine

FIXTURES = Path(__file__).parent / "fixtures"

has_engine = find_engine() is not None
requires_tex = pytest.mark.skipif(not has_engine, reason="no TeX engine installed")


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


def fixture_names() -> list[str]:
    return sorted(p.stem for p in FIXTURES.glob("*.json"))


@pytest.fixture
def client() -> TestClient:
    limiter.reset()
    return TestClient(app)
