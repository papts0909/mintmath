"""Document model. Must stay in sync with frontend/src/core/types.ts."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MAX_LINES = 2000
MAX_LINE_CHARS = 20_000


class Line(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1, max_length=64)
    type: Literal["math", "text"]
    content: str = Field(max_length=MAX_LINE_CHARS)
    joinPrev: bool | None = None  # noqa: N815 - mirrors the JSON contract


class Doc(BaseModel):
    model_config = ConfigDict(extra="ignore")

    version: Literal[1]
    id: str = Field(min_length=1, max_length=64)
    title: str = Field(max_length=500)
    lines: list[Line] = Field(max_length=MAX_LINES)
    updatedAt: str  # noqa: N815
