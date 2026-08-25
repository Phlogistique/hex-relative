/**
 * What the pointer lights up, and what a finger does not.
 *
 * Two claims, and the second is the one worth the check. A touch screen has no
 * pointer, but it does have `:hover`: the cell last tapped keeps it, and keeps
 * it through a zoom or a scroll that carries the finger nowhere near. So the
 * highlight is offered to real pointers only, and the way to measure that is
 * to hold a cell hovered on a screen that reports itself touch — hovered, and
 * still dark. A reading of nothing lit would be worth nothing if the cell were
 * not hovered, so that is measured too.
 *
 * The first claim is the shape. On the hexagons the mark is the cell, which is
 * a hexagon. On a goban it is the stone the pointer would put down, so it is
 * round and the size of a stone: the cell's own stone element, unhidden.
 */
import { check, pad } from "./lib/browser.mjs";

const EMPTY = 3 * 9 + 3; // an empty cell on the 9x9 boards opened below
const PLAYED = 4 * 9 + 4; // e5, which the hash below has a stone on

const look = (index) => {
  const cell = document.querySelectorAll(".cells .cell")[index];
  const stone = cell.querySelector(".stone");
  const shown = getComputedStyle(stone).display !== "none";
  return {
    hovered: cell.matches(":hover"),
    hex: getComputedStyle(cell.querySelector(".hex")).fill,
    r: Number(stone.getAttribute("r")),
    mark: shown ? stone.tagName : null,
  };
};

const hover = async (page, index) => {
  await page.locator(".cells .cell").nth(index).hover();
  await page.waitForTimeout(60);
};

await check("What the pointer lights up", async ({ open }) => {
  const page = await open("#9n,e5");
  await page.selectOption("#mode", "inspect");

  const before = await page.evaluate(look, EMPTY);
  await hover(page, EMPTY);
  const hexes = await page.evaluate(look, EMPTY);
  console.log(
    `  ${pad("hexes", 7)}the hexagon goes ${before.hex} -> ${hexes.hex}, and nothing round turns up`,
  );
  if (!hexes.hovered) throw new Error("the cell was not hovered at all");
  if (hexes.hex === before.hex)
    throw new Error(`hovering left the hexagon at ${hexes.hex}`);
  if (hexes.mark) throw new Error(`a ${hexes.mark} lit on the hexagons`);

  await page.selectOption("#style", "goban");
  await page.waitForTimeout(150);
  await hover(page, EMPTY);
  const goban = await page.evaluate(look, EMPTY);
  const stone = await page.evaluate(look, PLAYED);
  console.log(
    `  ${pad("goban", 7)}the hexagon stays ${goban.hex}, a ${goban.mark ?? "nothing"} of r ${goban.r} lights instead`,
  );
  console.log(
    `  ${pad("", 7)}a stone played on this board is r ${stone.r}, which is the mark's own size`,
  );
  if (goban.mark !== "circle")
    throw new Error(`the goban's mark is ${goban.mark ?? "nothing"}`);
  if (goban.r !== stone.r)
    throw new Error(`the mark is r ${goban.r}, a stone r ${stone.r}`);
  if (goban.hex !== "rgba(0, 0, 0, 0)")
    throw new Error(`the hexagon lit ${goban.hex} under it`);
});

await check("What a finger does not", async ({ open }) => {
  // `hasTouch` is what makes Chromium report `hover: none`; `isMobile` on its
  // own leaves the page thinking it has a pointer, and the check passes blind.
  const phone = { viewport: { width: 390, height: 780 }, hasTouch: true };
  for (const style of ["hex", "goban"]) {
    const page = await open("#9n,e5", phone);
    await page.selectOption("#mode", "inspect");
    if (style !== "hex") await page.selectOption("#style", style);
    await page.waitForTimeout(150);

    const before = await page.evaluate(look, EMPTY);
    await hover(page, EMPTY);
    const held = await page.evaluate(look, EMPTY);
    console.log(
      `  ${pad(style, 7)}cell held hovered: ${held.hovered}, hexagon ${held.hex}, ${held.mark ?? "nothing"} round`,
    );
    if (!held.hovered)
      throw new Error("the cell was not hovered, so this proves nothing");
    if (held.hex !== before.hex || held.mark)
      throw new Error(`${style}: a touch screen lit the cell anyway`);
    await page.close();
  }
});
