/**
 * Passes and swaps as moves of the history.
 *
 * The swap is hexworld's swap-pieces: the board is reflected across its long
 * diagonal and every stone changes colour, which makes it its own undo. The
 * pass is what lets a one-colour position be written down at all, since the
 * format infers the colours from the order of play.
 */
import { check, pad } from "./lib/browser.mjs";

const stones = (page) =>
  page.evaluate(() => {
    const size = Number(document.getElementById("size").value);
    const out = [];
    document.querySelectorAll(".cells .cell").forEach((cell, i) => {
      const stone = cell.querySelector(".stone");
      if (stone.classList.contains("hidden")) return;
      const colour = stone.classList.contains("stone-red") ? "r" : "b";
      out.push(
        colour +
          "abcdefghijklmnopqrstuvwxyz"[i % size] +
          (Math.floor(i / size) + 1),
      );
    });
    return out.sort().join(" ");
  });

await check("Passes and swaps", async ({ open }) => {
  const cases = [
    ["plain", "#5,a1b2", "bb2 ra1"],
    // a2 is (col 0, row 1); reflected that is (1, 0) = b1, and it changes colour
    ["swap of one stone", "#5,a2:s", "bb1"],
    ["swap of two", "#5,a2b3:s", "bb1 rc2"],
    ["swap twice is the same", "#5,a2b3:s:s", "bb3 ra2"],
    ["rewound before the swap", "#5,a2b3,:s", "bb3 ra2"],
    ["red only", "#5,a1:pb1:pc1", "ra1 rb1 rc1"],
    ["blue only", "#5,:pa1:pb1", "ba1 bb1"],
  ];
  for (const [label, hash, want] of cases) {
    const page = await open(hash);
    const got = await stones(page);
    console.log(`  ${pad(label, 26)}${pad(hash, 16)}${got}`);
    if (got !== want)
      throw new Error(`${label}: wanted "${want}", got "${got}"`);
    await page.close();
  }

  // placing with a colour forced puts the passes in by itself
  const page = await open("#5");
  await page.selectOption("#mode", "red");
  await page.locator(".cells .cell").nth(0).click();
  await page.locator(".cells .cell").nth(1).click();
  const written = await page.evaluate(() => location.hash);
  console.log(
    `  ${pad("red only, placed by hand", 26)}${pad("", 16)}${written}`,
  );
  if (written !== "#5,a1:pb1") throw new Error(`forced colour: got ${written}`);
});
