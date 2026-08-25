/**
 * The one field. The page names a cell and looks a cell up in the same place:
 * what a tap on the board puts there is what a coordinate is typed into.
 *
 * Four things have to hold for that to work. A tap names the cell, in the
 * field and beside it. A name typed in finds it, whichever of the cell's four
 * names was typed, and the field then holds the one this page prefers. A name
 * that is not on the board says so. And what is being typed is not rubbed out
 * by the pointer crossing the board, which is the one thing a field that
 * doubles as an answer can get wrong.
 */
import { check, pad } from "./lib/browser.mjs";

const said = () => ({
  coord: document.querySelector("#coord").value,
  standard: document.querySelector("#standard").textContent,
  others: [...document.querySelectorAll("#variants li")].map(
    (n) => n.textContent,
  ),
  error: document.querySelector("#coord-error").textContent,
  marked: document.querySelectorAll(".hex-marked").length,
});

await check("The one field", async ({ open }) => {
  const page = await open("#13n,");
  await page.selectOption("#mode", "inspect");
  await page
    .locator(".cells .cell")
    .nth(3 * 13 + 3)
    .click();
  let got = await page.evaluate(said);
  console.log(
    `  ${pad("a tap", 22)}names ${got.coord} ${got.standard}, and its other names are ${got.others.join(" ")}`,
  );
  if (!got.coord) throw new Error("a tap named nothing");
  if (got.others.length !== 3)
    throw new Error(`${got.others.length} other names`);
  if (got.others.includes(got.coord))
    throw new Error("the name is printed twice");

  // 8'2 is b8's name counted from the far edges; this page prefers 62.
  for (const [typed, coord, standard] of [
    ["44", "44", "d10"],
    ["8'2", "62", "b8"],
    ["d5", "5'4", "d5"],
  ]) {
    await page.fill("#coord", typed);
    await page.press("#coord", "Enter");
    await page.waitForTimeout(60);
    got = await page.evaluate(said);
    console.log(
      `  ${pad(`typing ${typed}`, 22)}finds ${got.coord} ${got.standard}, ${got.marked} cell marked`,
    );
    if (got.coord !== coord || got.standard !== standard)
      throw new Error(`${typed} found ${got.coord} ${got.standard}`);
    if (got.marked !== 1) throw new Error(`${got.marked} cells marked`);
  }

  await page.fill("#coord", "zz9");
  await page.press("#coord", "Enter");
  await page.waitForTimeout(60);
  got = await page.evaluate(said);
  console.log(
    `  ${pad("typing zz9", 22)}${got.error} ${got.marked} cells marked`,
  );
  if (!got.error) throw new Error("a name off the board passed");
  if (got.marked !== 0) throw new Error("a name off the board marked a cell");

  // Focus in the field, and the pointer over a cell that would otherwise name
  // itself there.
  await page.fill("#coord", "5'");
  await page.locator(".cells .cell").nth(0).hover();
  await page.waitForTimeout(60);
  got = await page.evaluate(said);
  console.log(
    `  ${pad("hovering while typing", 22)}leaves ${got.coord} in the field`,
  );
  if (got.coord !== "5'") throw new Error(`the typing became ${got.coord}`);
  await page.close();
});
