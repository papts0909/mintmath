import { expect, type Page } from "@playwright/test";

export interface LineView {
  type: "math" | "text";
  content: string;
  joinPrev?: boolean;
}

/** Read the document as rendered (MathLive value / input value per line). */
export async function readLines(page: Page): Promise<LineView[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-testid=line]")].map((li) => {
      const mf = li.querySelector("math-field") as (HTMLElement & { getValue: (f: string) => string }) | null;
      const input = li.querySelector<HTMLTextAreaElement>("textarea.text-line");
      const view: { type: "math" | "text"; content: string; joinPrev?: boolean } = mf
        ? {
            type: "math",
            // Same mapping as src/core/displayLatex.ts fromDisplay().
            content: mf
              .getValue("latex")
              .replace(
                /\\begin\{bmatrix\}\s*(\\begin\{array\}\{[^}]*\}[\s\S]*?\\end\{array\})\s*\\end\{bmatrix\}/g,
                "\\left[$1\\right]",
              ),
          }
        : { type: "text", content: input?.value ?? "" };
      if (li.classList.contains("is-joined")) view.joinPrev = true;
      return view;
    }),
  );
}

/** Read the persisted document from localStorage. */
export async function readStored(page: Page): Promise<{ title: string; lines: LineView[] } | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("mathpad.doc.v1");
    return raw ? (JSON.parse(raw) as { doc: { title: string; lines: LineView[] } }).doc : null;
  });
}

export async function freshPage(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("math-field")).toHaveCount(1);
  await page.locator("math-field").first().click();
}

export async function focusedIndex(page: Page): Promise<number> {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-testid=line]")].findIndex((li) =>
      li.classList.contains("is-focused"),
    ),
  );
}

/** Type `text` key by key (shortcut-sensitive input), waiting briefly at the end. */
export async function typeKeys(page: Page, text: string): Promise<void> {
  await page.keyboard.type(text);
}

/** Wait until localStorage holds exactly what the editor shows. */
export async function waitSaved(page: Page): Promise<void> {
  const shown = (await readLines(page)).map((l) => l.content);
  await expect
    .poll(async () => (await readStored(page))?.lines.map((l) => l.content), { timeout: 5000 })
    .toEqual(shown);
  await expect(page.locator(".save-state")).toHaveText("Đã lưu");
}
