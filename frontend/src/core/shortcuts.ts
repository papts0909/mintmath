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

  {
    trigger: "sys",
    latex: buildEnv("cases", 2, 1),
    label: "Hệ phương trình (ngoặc trái)",
    group: "Cấu trúc",
  },
  { trigger: "mat", latex: buildEnv("bmatrix", 2, 2), label: "Ma trận [ ] 2×2", group: "Cấu trúc" },
  { trigger: "pat", latex: buildEnv("pmatrix", 2, 2), label: "Ma trận ( ) 2×2", group: "Cấu trúc" },
  { trigger: "dat", latex: buildEnv("vmatrix", 2, 2), label: "Định thức | | 2×2", group: "Cấu trúc" },
  { trigger: "amat", latex: buildEnv("augmented", 2, 3), label: "Ma trận bổ sung 2×3", group: "Cấu trúc" },
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
  return Object.fromEntries(SHORTCUTS.map((s) => [s.trigger, toDisplay(s.latex)]));
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
