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
  await page.close();

  // A size typed into the box is only reported when the box loses focus, and
  // what takes the focus off it is the press that starts the next click. The
  // board is rebuilt on that press, so the click used to land on a hexagon
  // that no longer existed and be dropped: the first stone after a resize went
  // missing. The mouse hands the size over as it arrives over the board, so
  // the click plays on the board it asked for.
  const resized = await open(START);
  await resized.fill("#size", "21");
  await resized.locator(".cells .cell").nth(0).click();
  const played = await resized.evaluate(() => location.hash);
  console.log(
    `  ${pad("alternate", 11)}${pad("type 21, click", 13)}-> ${played}`,
  );
  if (played !== "#21,d10j9d5a1")
    throw new Error(`after a resize: got ${played}`);
  await resized.close();

  // A finger arrives and presses at once, so there is no such moment: the size
  // waits for the tap to be over instead. The stone goes where it was aimed on
  // the board that was on screen, and the board changes size behind it.
  const phone = await open(START, {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await phone.tap("#size");
  await phone.keyboard.press("Control+a");
  await phone.keyboard.type("21");
  await phone.locator(".cells .cell").nth(0).tap();
  await phone.waitForTimeout(80);
  const tapped = await phone.evaluate(() => location.hash);
  const grew = await phone.evaluate(
    () => document.querySelectorAll(".cells .cell").length,
  );
  console.log(
    `  ${pad("alternate", 11)}${pad("type 21, tap", 13)}-> ${tapped}  ${grew} cells`,
  );
  if (tapped !== "#21,d10j9d5a1") throw new Error(`after a tap: got ${tapped}`);
  if (grew !== 21 * 21) throw new Error(`${grew} cells after the tap`);
});
