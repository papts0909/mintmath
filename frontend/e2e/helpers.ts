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

/** Open a menu path, e.g. menu(page, "Tệp", "Xuất", "PDF"), on the menu bar
 *  (wide screens) or the single "Menu" button (phones). The last item is
 *  clicked. */
export async function menu(page: Page, ...path: string[]): Promise<void> {
  const bar = page.getByRole("menubar", { name: "Menu chính" });
  if (await bar.isVisible()) {
    await bar.getByRole("menuitem", { name: path[0], exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await menuItem(page, path[0]).click();
  }
  for (const name of path.slice(1)) await menuItem(page, name).click();
}

/** A visible menu item by its exact name, whatever its kind. */
export function menuItem(page: Page, name: string) {
  return page
    .getByRole("menuitem", { name, exact: true })
    .or(page.getByRole("menuitemcheckbox", { name, exact: true }))
    .or(page.getByRole("menuitemradio", { name, exact: true }))
    .last();
}

/** Export through the toolbar's "Xuất" button: "LaTeX (.tex)", "PDF", "PNG",
 *  "Xem trước bản in", "In", "Lưu .tex và PDF lên B2". */
export async function exportAs(page: Page, item: string): Promise<void> {
  await page.getByRole("toolbar", { name: "Công cụ soạn" }).getByRole("button", { name: "Xuất" }).click();
  await menuItem(page, item).click();
}
