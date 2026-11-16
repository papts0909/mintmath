// MathLive draws `\left[ \begin{array}…\end{array} \right]` with a large blank
// band above the matrix, while `bmatrix` wrapping the same `array` renders
// tightly and stays editable cell by cell. Documents always store the standard
// form; editors and the print renderer use the display form.

const STORED_AUG =
  /\\left(?:\[|\\lbrack)\s*(\\begin\{array\}\{[^}]*\}[\s\S]*?\\end\{array\})\s*\\right(?:\]|\\rbrack)/g;
const DISPLAY_AUG =
  /\\begin\{bmatrix\}\s*(\\begin\{array\}\{[^}]*\}[\s\S]*?\\end\{array\})\s*\\end\{bmatrix\}/g;

/** Stored LaTeX -> LaTeX shown in MathLive. */
export function toDisplay(latex: string): string {
  return latex.replace(STORED_AUG, "\\begin{bmatrix}$1\\end{bmatrix}");
}

/** LaTeX read back from MathLive -> stored LaTeX. */
export function fromDisplay(latex: string): string {
  return latex.replace(DISPLAY_AUG, "\\left[$1\\right]");
}
