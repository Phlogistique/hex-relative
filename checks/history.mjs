/**
 * Stepping through the history, and the cursor's place in the URL. The comma
 * between hexworld's two move lists is that cursor, so it moves as we walk.
 */
import { check, pad } from "./lib/browser.mjs";

const GAME = "#13n,d10j9d5";

await check("History navigation", async ({ open }) => {
  const page = await open(GAME);
  const state = async (label) => {
    const got = await page.evaluate(() => ({
      hash: location.hash,
      stones: document.querySelectorAll(".stone:not(.hidden)").length,
      current: document.querySelector(".movelist .is-current .num")
        ?.textContent,
    }));
    console.log(
      `  ${pad(label, 14)}${pad(got.stones + " stones", 11)}row ${pad(got.current, 3)} ${got.hash}`,
    );
    return got;
  };

  await state("loaded");
  for (const [button, label, hash, stones] of [
    ["#prev", "prev", "#13n,d10j9,d5", 2],
    ["#prev", "prev", "#13n,d10,j9d5", 1],
    ["#first", "first", "#13n,,d10j9d5", 0],
    ["#next", "next", "#13n,d10,j9d5", 1],
    ["#last", "last", "#13n,d10j9d5", 3],
  ]) {
    await page.click(button);
    const got = await state(label);
    if (got.hash !== hash || got.stones !== stones) {
      throw new Error(
        `${label}: wanted ${hash} with ${stones} stones, got ${got.hash} with ${got.stones}`,
      );
    }
  }

  // clicking a row of the stone list jumps to that position
  await page.click('.movelist tr[data-n="1"]');
  const jumped = await state("click row 1");
  if (jumped.stones !== 1)
    throw new Error("clicking a history row did not jump");

  // the keyboard does the same
  for (const [key, hash] of [
    ["ArrowLeft", "#13n,,d10j9d5"],
    ["End", "#13n,d10j9d5"],
    ["Home", "#13n,,d10j9d5"],
  ]) {
    await page.keyboard.press(key);
    const got = await page.evaluate(() => location.hash);
    console.log(`  ${pad(key, 14)}${pad("", 11)}    ${got}`);
    if (got !== hash) throw new Error(`${key}: wanted ${hash}, got ${got}`);
  }

  // playing while rewound drops what was ahead
  await page.click("#first");
  await page.locator(".cells .cell").nth(0).click();
  const branched = await page.evaluate(() => location.hash);
  console.log(`  ${pad("play at start", 14)}${pad("", 11)}    ${branched}`);
  if (branched !== "#13n,a1") throw new Error(`branching: got ${branched}`);
});
