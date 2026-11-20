// Single source of truth for math text shortcuts: loaded into MathLive's
// inline shortcuts and reused by the help panel.
import { toDisplay } from "./displayLatex";
import { buildEnv } from "./matrix";

export type ShortcutGroup = "Logic" | "Tập hợp" | "Quan hệ" | "Phép toán" | "Cấu trúc";

export interface Shortcut {
  trigger: string;
  latex: string;
  label: string;
  group: ShortcutGroup;
  /** A structure inserted on Space/Tab, with an optional size after the
   *  trigger (see parseSizedTrigger), instead of as soon as it is typed. */
  sized?: boolean;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { trigger: "forall", latex: "\\forall", label: "∀ với mọi", group: "Logic" },
  { trigger: "exists", latex: "\\exists", label: "∃ tồn tại", group: "Logic" },
  { trigger: "=>", latex: "\\Rightarrow", label: "⇒ suy ra", group: "Logic" },
  { trigger: "<=>", latex: "\\Leftrightarrow", label: "⇔ tương đương", group: "Logic" },
  { trigger: "iff", latex: "\\Leftrightarrow", label: "⇔ tương đương", group: "Logic" },
  { trigger: "->", latex: "\\to", label: "→ mũi tên", group: "Logic" },

  { trigger: "Rbb", latex: "\\mathbb{R}", label: "ℝ số thực", group: "Tập hợp" },
  { trigger: "Zbb", latex: "\\mathbb{Z}", label: "ℤ số nguyên", group: "Tập hợp" },
  { trigger: "Nbb", latex: "\\mathbb{N}", label: "ℕ số tự nhiên", group: "Tập hợp" },
  { trigger: "Qbb", latex: "\\mathbb{Q}", label: "ℚ số hữu tỉ", group: "Tập hợp" },
  { trigger: "Cbb", latex: "\\mathbb{C}", label: "ℂ số phức", group: "Tập hợp" },
  { trigger: "element", latex: "\\in", label: "∈ thuộc", group: "Tập hợp" },
  { trigger: "notin", latex: "\\notin", label: "∉ không thuộc", group: "Tập hợp" },
  { trigger: "subset", latex: "\\subset", label: "⊂ tập con", group: "Tập hợp" },
  { trigger: "union", latex: "\\cup", label: "∪ hợp", group: "Tập hợp" },
  { trigger: "inter", latex: "\\cap", label: "∩ giao", group: "Tập hợp" },
  { trigger: "empty", latex: "\\varnothing", label: "∅ tập rỗng", group: "Tập hợp" },

  { trigger: "!=", latex: "\\ne", label: "≠ khác", group: "Quan hệ" },
  { trigger: "<=", latex: "\\le", label: "≤ nhỏ hơn hoặc bằng", group: "Quan hệ" },
  { trigger: ">=", latex: "\\ge", label: "≥ lớn hơn hoặc bằng", group: "Quan hệ" },

  { trigger: "+-", latex: "\\pm", label: "± cộng trừ", group: "Phép toán" },
  { trigger: "inf", latex: "\\infty", label: "∞ vô cùng", group: "Phép toán" },
  { trigger: "sqrt", latex: "\\sqrt{#?}", label: "√ căn bậc hai", group: "Phép toán" },
  { trigger: "sum", latex: "\\sum", label: "∑ tổng", group: "Phép toán" },
  { trigger: "int", latex: "\\int", label: "∫ tích phân", group: "Phép toán" },
  { trigger: "lim", latex: "\\lim_{#?}", label: "lim giới hạn", group: "Phép toán" },

  // Structures take an optional size and are inserted on Space or Tab:
  // "mat" → 2×2, "mat3" → 3×3, "mat34" or "mat3x4" → 3 rows × 4 columns.
  {
    trigger: "sys",
    latex: buildEnv("cases", 2, 1),
    label: "Hệ phương trình. sys3 = 3 phương trình",
    group: "Cấu trúc",
    sized: true,
  },
  {
    trigger: "mat",
    latex: buildEnv("bmatrix", 2, 2),
    label: "Ma trận [ ]. mat3 = 3×3, mat34 = 3×4",
    group: "Cấu trúc",
    sized: true,
  },
  {
    trigger: "pat",
    latex: buildEnv("pmatrix", 2, 2),
    label: "Ma trận ( ). pat3 = 3×3, pat34 = 3×4",
    group: "Cấu trúc",
    sized: true,
  },
  {
    trigger: "dat",
    latex: buildEnv("vmatrix", 2, 2),
    label: "Định thức | |. dat3 = 3×3",
    group: "Cấu trúc",
    sized: true,
  },
  {
    trigger: "amat",
    latex: buildEnv("augmented", 2, 3),
    label: "Ma trận bổ sung [A|b]. amat3 = 3×4, amat35 = 3×5",
    group: "Cấu trúc",
    sized: true,
  },
];

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  "Logic",
  "Tập hợp",
  "Quan hệ",
  "Phép toán",
  "Cấu trúc",
];

/** MathLive inline-shortcut dictionary built from SHORTCUTS. */
export function inlineShortcutMap(): Record<string, string> {
  return Object.fromEntries(SHORTCUTS.filter((s) => !s.sized).map((s) => [s.trigger, toDisplay(s.latex)]));
}

export const MAX_STRUCTURE_SIZE = 10;

const SIZED_RE = /(amat|mat|pat|dat|sys)(\d+(?:x\d+)?)?$/;
/** A structure trigger, possibly with its size, being typed (no size check). */
export const PENDING_SIZED_RE = /(amat|mat|pat|dat|sys)(\d*(?:x\d*)?)$/;

/** The structure for text that ends with a sized trigger, e.g. "mat34".
 *  Sizes: one digit N (N×N, N equations for sys, N unknowns for amat), two
 *  digits RC, or RxC. Returns the LaTeX and how many characters it replaces,
 *  or null when the text does not end with a valid one. */
export function parseSizedTrigger(text: string): { latex: string; length: number } | null {
  const m = SIZED_RE.exec(text);
  if (!m) return null;
  const [all, trigger, size = ""] = m;
  let rows: number;
  let cols: number | null = null;
  if (!size) rows = 2;
  else if (size.includes("x")) [rows, cols] = size.split("x").map(Number);
  else if (size.length === 2) [rows, cols] = [Number(size[0]), Number(size[1])];
  else rows = Number(size);
  const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_STRUCTURE_SIZE;
  let latex: string;
  if (trigger === "sys") {
    if (cols !== null || !ok(rows)) return null;
    latex = buildEnv("cases", rows, 1);
  } else if (trigger === "amat") {
    // One digit = number of unknowns (plus the right-hand side column).
    const c = cols ?? rows + 1;
    if (!ok(rows) || !ok(c) || c < 2) return null;
    latex = buildEnv("augmented", rows, c);
  } else if (trigger === "dat") {
    if (cols !== null && cols !== rows) return null; // a determinant is square
    if (!ok(rows)) return null;
    latex = buildEnv("vmatrix", rows, rows);
  } else {
    const c = cols ?? rows;
    if (!ok(rows) || !ok(c)) return null;
    latex = buildEnv(trigger === "mat" ? "bmatrix" : "pmatrix", rows, c);
  }
  return { latex: toDisplay(latex), length: all.length };
}

export function searchShortcuts(query: string): Shortcut[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...SHORTCUTS];
  return SHORTCUTS.filter(
    (s) =>
      s.trigger.toLowerCase().includes(q) ||
      s.label.toLowerCase().includes(q) ||
      s.latex.toLowerCase().includes(q),
  );
}
