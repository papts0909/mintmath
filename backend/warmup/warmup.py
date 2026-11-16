"""Build-time warm-up: compile a document that uses every template package."""

import time

from app.models import Doc
from app.services.compiler import compile_pdf
from app.services.raster import pdf_to_png
from app.services.tex_builder import build_tex

SAMPLE = {
    "version": 1,
    "id": "warmup",
    "title": "Giải và biện luận hệ phương trình",
    "updatedAt": "2026-01-01T00:00:00Z",
    "lines": [
        {"id": "a", "type": "text", "content": "Với tham số m trên ℝ, đặng ơ ư ỹ"},
        {
            "id": "b",
            "type": "math",
            "content": r"\left[\begin{array}{ccc|c}1&1&2&3\\2&3&5&7\end{array}\right]",
        },
        {"id": "c", "type": "math", "content": r"\begin{cases}x+y=1\\x-y=2\end{cases}"},
        {"id": "d", "type": "math", "content": r"\forall x\in\mathbb{R}\Rightarrow x^2\ge 0"},
        {"id": "e", "type": "math", "content": r"a=b", "joinPrev": False},
        {"id": "f", "type": "math", "content": r"&=c", "joinPrev": True},
    ],
}


def main() -> None:
    tex = build_tex(Doc.model_validate(SAMPLE))
    for attempt in range(2):
        start = time.perf_counter()
        pdf = compile_pdf(tex, timeout=900)
        print(f"warm-up compile #{attempt + 1}: {time.perf_counter() - start:.2f}s")
    pages = pdf_to_png(pdf, 100)
    print(f"warm-up ok: {len(pdf)} bytes PDF, {len(pages)} page(s) PNG")


if __name__ == "__main__":
    main()
