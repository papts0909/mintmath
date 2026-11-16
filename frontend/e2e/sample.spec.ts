import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { freshPage, readLines, waitSaved } from "./helpers";
import { typeSample } from "./sampleSteps";

const expected = JSON.parse(
  readFileSync(new URL("./fixtures/sample-typed.json", import.meta.url), "utf-8"),
) as { title: string; lines: { type: string; content: string; joinPrev?: boolean }[] };

test("the sample can be typed with the keyboard only", async ({ page }) => {
  await freshPage(page);
  await typeSample(page);
  const lines = await readLines(page);
  if (process.env.PRINT_SAMPLE) console.log(JSON.stringify(lines, null, 2));
  expect(await page.locator(".title-input").inputValue()).toBe(expected.title);
  expect(lines).toEqual(expected.lines);
  await waitSaved(page);
});
