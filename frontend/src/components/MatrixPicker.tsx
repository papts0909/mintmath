// Pick a matrix size on a grid (like inserting a table) and its brackets.
import { useRef, useState } from "react";
import { buildEnv, type EnvKind } from "../core/matrix";

export const MATRIX_KINDS: { kind: EnvKind; label: string; name: string }[] = [
  { kind: "bmatrix", label: "[ ]", name: "Ma trận [ ]" },
  { kind: "pmatrix", label: "( )", name: "Ma trận ( )" },
  { kind: "vmatrix", label: "| |", name: "Định thức" },
  { kind: "augmented", label: "[A|b]", name: "Ma trận bổ sung" },
];

const N = 8;

interface Props {
  onPick: (latex: string, rows: number, cols: number) => void;
}

export default function MatrixPicker({ onPick }: Props) {
  const [kind, setKind] = useState<EnvKind>("bmatrix");
  const [at, setAt] = useState({ r: 2, c: 2 });
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const square = kind === "vmatrix";
  // A determinant is square; an augmented matrix has at least 2 columns.
  const size = (r: number, c: number) =>
    square ? { r: Math.max(r, c), c: Math.max(r, c) } : { r, c: kind === "augmented" ? Math.max(c, 2) : c };
  const shown = size(at.r, at.c);

  const pick = (r: number, c: number) => {
    const s = size(r, c);
    onPick(buildEnv(kind, s.r, s.c), s.r, s.c);
  };
  const focusCell = (r: number, c: number) => {
    const rr = Math.min(N, Math.max(1, r));
    const cc = Math.min(N, Math.max(1, c));
    setAt({ r: rr, c: cc });
    cells.current[(rr - 1) * N + (cc - 1)]?.focus();
  };

  return (
    <div className="matrix-picker">
      <div className="matrix-kinds" role="radiogroup" aria-label="Kiểu ngoặc">
        {MATRIX_KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="radio"
            aria-checked={kind === k.kind}
            aria-label={k.name}
            title={k.name}
            onClick={() => setKind(k.kind)}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div
        className="matrix-grid"
        role="grid"
        aria-label="Kích thước"
        style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}
        onMouseLeave={() => setAt({ r: 2, c: 2 })}
      >
        {Array.from({ length: N * N }, (_, i) => {
          const r = Math.floor(i / N) + 1;
          const c = (i % N) + 1;
          const on = r <= shown.r && c <= shown.c;
          return (
            <button
              key={i}
              ref={(b) => {
                cells.current[i] = b;
              }}
              type="button"
              role="gridcell"
              className={on ? "is-on" : ""}
              aria-label={`${r} × ${c}`}
              tabIndex={r === at.r && c === at.c ? 0 : -1}
              onMouseEnter={() => setAt({ r, c })}
              onFocus={() => setAt({ r, c })}
              onClick={() => pick(r, c)}
              onKeyDown={(e) => {
                const moves: Record<string, [number, number]> = {
                  ArrowRight: [0, 1],
                  ArrowLeft: [0, -1],
                  ArrowDown: [1, 0],
                  ArrowUp: [-1, 0],
                };
                const m = moves[e.key];
                if (!m) return;
                // ← on the first column goes back to the parent menu.
                if (e.key === "ArrowLeft" && c === 1) return;
                e.preventDefault();
                e.stopPropagation();
                focusCell(r + m[0], c + m[1]);
              }}
            />
          );
        })}
      </div>
      <p className="matrix-size" aria-live="polite">
        {shown.r} × {shown.c}
      </p>
    </div>
  );
}
