/**
 * The cell's names standing in the corner of the drawing.
 *
 * A rhombus leaves two corners of its box with nothing in them, so what the
 * page has to say about a cell — its name, its standard name, and its other
 * three names — goes in the top right one, and nothing stands under the board
 * at all.
 *
 * How much room that corner has is the whole question, and it is easy to
 * measure wrongly: the coloured edges are one polygon per flank, running
 * diagonally, so the bounding box of a single band covers the entire corner
 * and says there is no room where there is most of it. What is asked here
 * instead is the browser's own hit testing, point by point under the block:
 * anything of the board's found under it is something the block is covering,
 * and a hexagon under it would be a cell that could no longer be tapped.
 *
 * Where the block genuinely does not fit — a small screen and the largest
 * board — it goes back under the board, and that is checked too.
 */
import { check, pad } from "./lib/browser.mjs";

/** Where the block stands, and what of the board's is underneath it. */
const stands = () => {
  const block = document.querySelector("#names");
  const svg = document.querySelector(".hex-board");
  const box = svg.getBoundingClientRect();
  const view = svg.viewBox.baseVal;
  block.scrollIntoView({ block: "center" });
  const seat = block.getBoundingClientRect();
  const under = new Set();
  const STEP = 4;
  for (let y = seat.top + 1; y < seat.bottom; y += STEP) {
    for (let x = seat.left + 1; x < seat.right; x += STEP) {
      for (const node of document.elementsFromPoint(x, y)) {
        if (node !== svg && svg.contains(node)) {
          under.add(node.tagName + "." + (node.getAttribute("class") ?? ""));
        }
      }
    }
  }
  return {
    corner: block.parentElement.classList.contains("board"),
    size: block.style.fontSize || "the page's own",
    block: `${Math.round(seat.width)}x${Math.round(seat.height)}`,
    cell:
      Math.round(
        Math.sqrt(3) *
          Math.min(box.width / view.width, box.height / view.height) *
          10,
      ) / 10,
    under: [...under],
  };
};

const SCREENS = [
  ["desktop", { width: 1280, height: 900 }, false],
  ["portrait", { width: 390, height: 844 }, true],
  ["small portrait", { width: 320, height: 568 }, true],
  ["landscape", { width: 914, height: 411 }, true],
  ["small landscape", { width: 667, height: 375 }, true],
];

await check("The cell's names in the corner", async ({ open }) => {
  for (const [label, viewport, mobile] of SCREENS) {
    for (const size of [13, 53]) {
      const page = await open(`#${size}n,`, {
        viewport,
        isMobile: mobile,
        hasTouch: mobile,
        deviceScaleFactor: 2,
      });
      await page.selectOption("#mode", "inspect");
      await page
        .locator(".cells .cell")
        .nth(Math.floor((size * size) / 3))
        .click();
      const got = await page.evaluate(stands);
      console.log(
        `  ${pad(label, 16)}${pad(`${size}x${size}`, 7)}` +
          `${pad(got.corner ? "corner" : "under the board", 16)}` +
          `at ${pad(got.size, 16)}block ${pad(got.block, 9)}` +
          `cell ${pad(`${got.cell}px`, 8)}` +
          `${got.under.length ? `COVERS ${got.under.slice(0, 3).join(" ")}` : "covering nothing"}`,
      );
      if (got.under.length) {
        throw new Error(
          `${label} ${size}: the block covers ${got.under.join(", ")}`,
        );
      }
      // Every one of these has room in the corner. The board is drawn as big
      // as the screen allows, and the corner grows with it, so a screen that
      // can show the board at all can generally hold the names out there.
      if (!got.corner) throw new Error(`${label} ${size}: not in the corner`);
      await page.close();
    }
  }

  // Where it does not fit it goes back under the board: the largest board on a
  // screen with almost no height leaves a corner narrower than the names are.
  const cramped = await open("#53n,", {
    viewport: { width: 480, height: 280 },
    isMobile: true,
    hasTouch: true,
  });
  const back = await cramped.evaluate(stands);
  console.log(
    `  ${pad("cramped", 16)}${pad("53x53", 7)}` +
      `${pad(back.corner ? "corner" : "under the board", 16)}` +
      `at ${pad(back.size, 16)}block ${pad(back.block, 9)}`,
  );
  if (back.corner) throw new Error("480x280 kept 53x53's names in the corner");
  await cramped.close();

  // Out in the corner it is still the one field: the answer to a tap, and the
  // box a coordinate is typed into to be shown one.
  const page = await open("#13n,", {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await page.selectOption("#mode", "inspect");
  await page
    .locator(".cells .cell")
    .nth(3 * 13 + 3)
    .tap();
  const tapped = await page.evaluate(() => ({
    corner: document
      .querySelector("#names")
      .parentElement.classList.contains("board"),
    name: document.querySelector("#coord").value,
    others: [...document.querySelectorAll("#variants li")].map(
      (node) => node.textContent,
    ),
  }));
  await page.fill("#coord", "8'-2");
  await page.press("#coord", "Enter");
  const typed = await page.evaluate(() => ({
    name: document.querySelector("#coord").value,
    marked: document.querySelectorAll(".hex-marked").length,
  }));
  console.log(
    `  ${pad("in the corner", 16)}a tap names ${tapped.name}, also ` +
      `${tapped.others.join(" ")}; 8'-2 typed into it rings ${typed.marked} ` +
      `cell and comes back as ${typed.name}`,
  );
  if (!tapped.corner) throw new Error("the names were not in the corner");
  if (tapped.name !== "4'4") throw new Error(`a tap named ${tapped.name}`);
  if (tapped.others.length !== 3)
    throw new Error(`${tapped.others.length} other names out there`);
  // 8'2 and 62 are the same cell on this board, and 62 is the name this page
  // prefers, so that is what the field holds once the cell has been found.
  if (typed.name !== "62" || typed.marked !== 1) {
    throw new Error(`typing found ${typed.name}, ringing ${typed.marked}`);
  }
});
