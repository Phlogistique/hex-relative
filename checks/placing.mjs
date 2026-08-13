/**
 * What a click does, per placing mode. Only erasing takes a stone off: while
 * alternating an occupied cell is not playable, and with a colour forced the
 * other colour may be overwritten.
 */
import { check, pad } from "./lib/browser.mjs";

const START = "#13,d10j9d5"; // d10 red, j9 blue, d5 red
const D10 = 9 * 13 + 3;

const CASES = [
  ["alternate", "click d10", "#13,d10j9d5", (c) => c.click()],
  ["red", "click d10", "#13,d10j9d5", (c) => c.click()],
  ["blue", "click d10", "#13,:pj9d5d10", (c) => c.click()],
  ["erase", "click d10", "#13,:pj9d5", (c) => c.click()],
  ["inspect", "click d10", "#13,d10j9d5", (c) => c.click()],
  [
    "alternate",
    "right-click",
    "#13,:pj9d5",
    (c) => c.click({ button: "right" }),
  ],
  [
    "alternate",
    "shift-click",
    "#13,:pj9d5",
    (c) => c.click({ modifiers: ["Shift"] }),
  ],
];

await check("Placing modes", async ({ open }) => {
  for (const [mode, action, want, run] of CASES) {
    const page = await open(START);
    await page.selectOption("#mode", mode);
    await run(page.locator(".cells .cell").nth(D10));
    await page.waitForTimeout(80);
    const got = await page.evaluate(() => location.hash);
    console.log(`  ${pad(mode, 11)}${pad(action, 13)}-> ${got}`);
    if (got !== want)
      throw new Error(`${mode} ${action}: wanted ${want}, got ${got}`);
    await page.close();
  }

  // an empty cell always takes a stone, except when inspecting
  const page = await open(START);
  await page.locator(".cells .cell").nth(0).click();
  const after = await page.evaluate(() => location.hash);
  console.log(`  ${pad("alternate", 11)}${pad("click empty", 13)}-> ${after}`);
  if (after !== "#13,d10j9d5a1") throw new Error(`empty cell: got ${after}`);
});
