// Touch-device support: when to show MathLive's on-screen keyboard and the
// extra "MintMath" keyboard layout with structures and set/logic symbols.
import type { VirtualKeyboardLayout } from "mathlive";
import { toDisplay } from "../core/displayLatex";
import { buildEnv } from "../core/matrix";

export const isCoarsePointer = (): boolean =>
  typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;

const sym = (latex: string, tooltip?: string) => ({ latex, ...(tooltip ? { tooltip } : {}) });

export const MINTMATH_LAYOUT: VirtualKeyboardLayout = {
  label: "MintMath",
  tooltip: "Ký hiệu và cấu trúc MintMath",
  rows: [
    [
      sym("\\forall", "với mọi"),
      sym("\\exists", "tồn tại"),
      sym("\\Rightarrow", "suy ra"),
      sym("\\Leftrightarrow", "tương đương"),
      sym("\\in", "thuộc"),
      sym("\\notin", "không thuộc"),
      sym("\\subset", "tập con"),
      sym("\\cup", "hợp"),
      sym("\\cap", "giao"),
      sym("\\varnothing", "tập rỗng"),
    ],
    [
      sym("\\mathbb{R}"),
      sym("\\mathbb{N}"),
      sym("\\mathbb{Z}"),
      sym("\\mathbb{Q}"),
      sym("\\mathbb{C}"),
      sym("\\ne"),
      sym("\\le"),
      sym("\\ge"),
      sym("\\pm"),
      sym("\\infty"),
    ],
    [
      { label: "Hệ {", tooltip: "Hệ phương trình", insert: buildEnv("cases", 2, 1), class: "small" },
      { label: "[ ]", tooltip: "Ma trận", insert: buildEnv("bmatrix", 2, 2), class: "small" },
      { label: "( )", tooltip: "Ma trận ngoặc tròn", insert: buildEnv("pmatrix", 2, 2), class: "small" },
      { label: "| |", tooltip: "Định thức", insert: buildEnv("vmatrix", 2, 2), class: "small" },
      {
        label: "[A|b]",
        tooltip: "Ma trận bổ sung",
        insert: toDisplay(buildEnv("augmented", 2, 3)),
        class: "small",
      },
      { label: "+hàng", tooltip: "Thêm hàng", command: "addRowAfter", class: "small" },
      { label: "+cột", tooltip: "Thêm cột", command: "addColumnAfter", class: "small" },
      { latex: "\\frac{#@}{#?}", tooltip: "Phân số" },
      { latex: "\\sqrt{#0}", tooltip: "Căn bậc hai" },
      { latex: "#@^{#?}", tooltip: "Mũ" },
    ],
    [
      { latex: "#@_{#?}", tooltip: "Chỉ số dưới" },
      sym("\\to"),
      { latex: "(", key: "(" },
      { latex: ")", key: ")" },
      { latex: "=" },
      "[left]",
      "[right]",
      "[up]",
      "[down]",
      "[backspace]",
    ],
  ],
};

let configured = false;

/** Configure the shared on-screen keyboard once. */
export function setupVirtualKeyboard(): void {
  if (configured || typeof window === "undefined" || !window.mathVirtualKeyboard) return;
  configured = true;
  window.mathVirtualKeyboard.layouts = [MINTMATH_LAYOUT, "numeric", "symbols", "alphabetic", "greek"];
}
