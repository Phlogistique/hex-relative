/**
 * The answer standing in the corner of the drawing.
 *
 * A rhombus leaves two corners of its box empty, so where there is room the
 * answer to a tap goes in one of them rather than in the panel under the
 * board, and the board keeps the width the panel would have taken.
 *
 * Three things have to hold. It covers nothing: not a label, not a border, and
 * not a hexagon, which is the click target and would go dead under it. Where
 * there is no room it goes back to the panel, which is what the largest board
 * is here for — 53x53 leaves the width of two digits. And it is still the same
 * field when it is out there: a tap names a cell in it, and a name typed into
 * it still finds one.
 */
import { check, pad } from "./lib/browser.mjs";

/** Where the answer stands, how big the board came out, and what it covers. */
const stands = () => {
  const line = document.querySelector(".readout-main");
  const svg = document.querySelector(".hex-board");
  const box = svg.getBoundingClientRect();
  const view = svg.viewBox.baseVal;
  const seat = line.getBoundingClientRect();
  const covered = [
    ...svg.querySelectorAll(".labels text, .edges *, .ground *, .cells .hex"),
  ].filter((node) => {
    const ink = node.getBoundingClientRect();
    return (
      ink.width > 0 &&
      ink.left < seat.right &&
      ink.right > seat.left &&
      ink.top < seat.bottom &&
      ink.bottom > seat.top
    );
  });
  return {
    corner: line.parentElement.classList.contains("board"),
    scale: line.style.fontSize || "the panel's own",
    line: `${Math.round(seat.width)}x${Math.round(seat.height)}`,
    columns: getComputedStyle(
      document.querySelector("main"),
    ).gridTemplateColumns.split(" ").length,
    cell:
      Math.round(
        Math.sqrt(3) *
          Math.min(box.width / view.width, box.height / view.height) *
          10,
      ) / 10,
    covers: covered.map(
      (node) => node.textContent || node.getAttribute("class"),
    ),
  };
};

const SCREENS = [
  ["desktop", { width: 1280, height: 900 }, false],
  ["portrait", { width: 390, height: 844 }, true],
  ["landscape", { width: 914, height: 411 }, true],
  ["small landscape", { width: 667, height: 375 }, true],
];

await check("The answer in the corner", async ({ open }) => {
  for (const [label, viewport, mobile] of SCREENS) {
    for (const size of [13, 53]) {
      const page = await open(`#${size}n,`, {
        viewport,
        isMobile: mobile,
        hasTouch: mobile,
        deviceScaleFactor: 2,
      });
      const got = await page.evaluate(stands);
      console.log(
        `  ${pad(label, 16)}${pad(`${size}x${size}`, 7)}` +
          `${pad(got.corner ? "corner" : "panel", 8)}at ${pad(got.scale, 18)}` +
          `line ${pad(got.line, 9)}cell ${pad(`${got.cell}px`, 8)}` +
          `${got.columns} column${got.columns > 1 ? "s" : ""}` +
          `${got.covers.length ? `  COVERS ${got.covers.slice(0, 4).join(" ")}` : ""}`,
      );
      if (got.covers.length) {
        throw new Error(
          `${label} ${size}: the answer covers ${got.covers.length} things, ` +
            `the first being ${got.covers[0]}`,
        );
      }
      // The largest board prints its labels right into the corner, so there is
      // nowhere out there for the answer and it belongs in the panel.
      if (size === 53 && got.corner) {
        throw new Error(`${label}: 53x53 left room in the corner`);
      }
      await page.close();
    }
  }

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
      .querySelector(".readout-main")
      .parentElement.classList.contains("board"),
    name: document.querySelector("#coord").value,
  }));
  await page.fill("#coord", "8'-2");
  await page.press("#coord", "Enter");
  const typed = await page.evaluate(() => ({
    name: document.querySelector("#coord").value,
    marked: document.querySelectorAll(".hex-marked").length,
  }));
  console.log(
    `  ${pad("in the corner", 16)}a tap names ${tapped.name}, and 8'-2 typed into it ` +
      `rings ${typed.marked} cell and comes back as ${typed.name}`,
  );
  if (!tapped.corner) throw new Error("the answer was not in the corner");
  if (tapped.name !== "4'4") throw new Error(`a tap named ${tapped.name}`);
  // 8'2 and 62 are the same cell on this board, and 62 is the name this page
  // prefers, so that is what the field holds once the cell has been found.
  if (typed.name !== "62" || typed.marked !== 1) {
    throw new Error(`typing found ${typed.name}, ringing ${typed.marked}`);
  }
});
