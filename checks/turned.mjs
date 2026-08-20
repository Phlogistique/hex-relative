/**
 * The board stood up.
 *
 * Where the screen is taller than it is wide the rhombus is turned a sixth of
 * a turn, so that it stands on its long diagonal instead of lying on it and a
 * phone gets a board worth looking at. A hexagon is its own sixth-turn, so
 * this is meant to be the same drawing in a different place, and that is what
 * is checked here, in three parts.
 *
 * That it is the same board: the four corners still name themselves, 11 at the
 * left with the red edge falling away from it to 11' at the lowest point, and a
 * tap still lands on the cell under the finger, which is the one thing the
 * turn could break silently — the drawing would look right and the board would
 * answer for the wrong cell.
 *
 * That it is bigger, against the same board lying down on the same screen,
 * since that is the whole of why it turns.
 *
 * That the labels still stand GAP off the edge each of them faces. This is the
 * part the turn genuinely disturbs: lying down, a row's labels face a vertical
 * flank and a column's face a level row of points, and a line of upright text
 * is parallel to both. Turned, every edge of the board leans and the text does
 * not, so what stands off the edge is one corner of the ink rather than a
 * whole side of it, and that corner is what is measured.
 */
import { check, pad } from "./lib/browser.mjs";
import { relative } from "../mason.js";

// All four must match board.js.
const GAP = 0.55;
const BORDER = 0.3; // BORDER_WIDTH
const WOOD = 1.85;
const HALF_WIDTH = Math.sqrt(3) / 2;

// Tall enough that standing the board up pays, which is what makes it happen.
const UPRIGHT = { width: 420, height: 1000 };
// The same width, too short for the turn to be worth anything.
const FLAT = { width: 420, height: 420 };

const phone = { isMobile: true, hasTouch: true };

/** Where every cell was drawn, and how big a hexagon came out. */
function drawing() {
  const size = Number(document.getElementById("size").value);
  const cells = [...document.querySelectorAll(".cells .cell")].map(
    (cell, index) => {
      const [, x, y] = cell
        .getAttribute("transform")
        .match(/translate\(([-\d.]+) ([-\d.]+)\)/)
        .map(Number);
      return { col: index % size, row: Math.floor(index / size), x, y };
    },
  );
  const svg = document.querySelector(".hex-board");
  const box = svg.viewBox.baseVal;
  return {
    size,
    cells,
    orientation: svg.dataset.orientation,
    view: { width: box.width, height: box.height },
    hex: document.querySelector(".cells .hex").getBoundingClientRect().width,
  };
}

/**
 * How far every label of the inner line stands off the edge it faces.
 *
 * Written out from the geometry rather than read back off board.js: the edge a
 * side's labels face, as its outward normal and how far past the cell centres
 * it stands, turned along with the board. The label's own facing edge is its
 * anchor, so the two corners to try are the top and bottom of the ink there.
 */
function clearances() {
  const H = Math.sqrt(3) / 2;
  const [GAP, BORDER, WOOD] = [0.55, 0.3, 1.85];
  const size = Number(document.getElementById("size").value);
  const last = size - 1;
  const svg = document.querySelector(".hex-board");
  const tall = svg.dataset.orientation === "tall";
  const hex = !svg.classList.contains("dual");

  const turn = (p) =>
    tall ? { x: p.x / 2 - p.y * H, y: p.x * H + p.y / 2 } : p;
  const at = (col, row) =>
    turn({ x: Math.sqrt(3) * (col + row / 2), y: 1.5 * row });
  const back = (v) => ({ x: -v.x, y: -v.y });

  // Outward from the right-hand side of the board, and from the top of it.
  const flank = hex ? { x: 1, y: 0 } : { x: H, y: -0.5 };
  const end = { x: 0, y: -1 };
  const out = hex
    ? { flank: H + BORDER, end: 1 + BORDER }
    : { flank: WOOD, end: WOOD };
  const faces = {
    left: { normal: back(flank), out: out.flank, cell: (i) => [0, i] },
    right: { normal: flank, out: out.flank, cell: (i) => [last, i] },
    top: { normal: end, out: out.end, cell: (i) => [i, 0] },
    bottom: { normal: back(end), out: out.end, cell: (i) => [i, last] },
  };

  const inks = new Map();
  const inkHalf = (label) => {
    const style = getComputedStyle(label);
    const key = `${style.fontWeight}/${style.fontSize}/${style.fontFamily}`;
    if (!inks.has(key)) {
      const context = document.createElement("canvas").getContext("2d");
      context.font = `${style.fontWeight} 1000px ${style.fontFamily}`;
      const ink = context.measureText("0123456789");
      inks.set(
        key,
        ((ink.actualBoundingBoxAscent - ink.actualBoundingBoxDescent) / 2000) *
          parseFloat(style.fontSize),
      );
    }
    return inks.get(key);
  };

  const measured = {};
  for (const side of Object.keys(faces)) {
    const face = faces[side];
    const normal = turn(face.normal);
    const line = [
      ...document.querySelectorAll(`.labels text[data-side="${side}"]`),
    ].filter((node) => node.dataset.line === "0");
    measured[side] = line.map((node, index) => {
      const [col, row] = face.cell(index);
      const centre = at(col, row);
      const x = Number(node.getAttribute("x"));
      const baseline = Number(node.getAttribute("y"));
      // The ink stands on the baseline and runs twice its half-height up.
      const corners = [baseline, baseline - 2 * inkHalf(node)].map((y) => ({
        x: x - centre.x,
        y: y - centre.y,
      }));
      const near = Math.min(
        ...corners.map((c) => c.x * normal.x + c.y * normal.y),
      );
      return { text: node.textContent, gap: near - face.out };
    });
  }
  return measured;
}

await check("The board stood up", async ({ open }) => {
  const page = await open("#13n,d10j9d5j4c2b5b8", {
    viewport: UPRIGHT,
    ...phone,
  });
  const { size, cells, orientation, view, hex } = await page.evaluate(drawing);

  const corner = (pick) => {
    const found = cells.reduce((best, cell) =>
      pick(cell, best) ? cell : best,
    );
    return relative(found.col, found.row, size);
  };
  const named = {
    left: corner((c, best) => c.x < best.x),
    bottom: corner((c, best) => c.y > best.y),
    right: corner((c, best) => c.x > best.x),
    top: corner((c, best) => c.y < best.y),
  };
  console.log(
    `  ${orientation}: ${named.left} at the left, ${named.bottom} at the bottom point, ` +
      `${named.top} at the top, ${named.right} at the right`,
  );
  const wanted = { left: "11", bottom: "11'", top: "1'1", right: "1'1'" };
  for (const [where, name] of Object.entries(wanted)) {
    if (named[where] !== name) {
      throw new Error(`${named[where]} at the ${where}, wanted ${name}`);
    }
  }
  if (orientation !== "tall") throw new Error("the board did not stand up");
  if (view.height <= view.width) {
    throw new Error(
      `drawing ${view.width} by ${view.height}, wanting it taller`,
    );
  }

  // The bottom point, which is the cell furthest from where it lies when the
  // board lies down: if the click went by the drawing rather than by the cell
  // it would answer for something else entirely.
  const lowest = cells.reduce((best, c) => (c.y > best.y ? c : best));
  await page.selectOption("#mode", "inspect");
  await page
    .locator(".cells .cell")
    .nth(lowest.row * size + lowest.col)
    .tap();
  await page.waitForTimeout(60);
  const answer = await page.textContent(".readout-main .coord");
  console.log(`  a tap on the lowest cell names ${answer}`);
  if (answer !== "11'") throw new Error(`the lowest cell named ${answer}`);
  await page.close();

  const flat = await open("#13n,d10j9d5j4c2b5b8", { viewport: FLAT, ...phone });
  const lying = await flat.evaluate(drawing);
  const bigger = hex / lying.hex - 1;
  console.log(
    `  ${view.width.toFixed(1)} by ${view.height.toFixed(1)} against ` +
      `${lying.view.width.toFixed(1)} by ${lying.view.height.toFixed(1)} lying down, ` +
      `on ${UPRIGHT.width}px of screen: a hexagon ${hex.toFixed(1)}px against ` +
      `${lying.hex.toFixed(1)}px, ${(bigger * 100).toFixed(0)}% bigger`,
  );
  if (lying.orientation !== "wide") {
    throw new Error("the short screen stood the board up as well");
  }
  if (bigger <= 0.1) {
    throw new Error(
      `standing the board up gained only ${(bigger * 100).toFixed(0)}%`,
    );
  }
});

await check("Labels on the board stood up", async ({ open }) => {
  for (const style of ["hex", "goban"]) {
    const page = await open("#13", { viewport: UPRIGHT, ...phone });
    if (style !== "hex") {
      await page.selectOption("#style", style);
      await page.waitForTimeout(150);
    }
    const measured = await page.evaluate(clearances);
    for (const [side, labels] of Object.entries(measured)) {
      const gaps = labels.map((l) => l.gap);
      const low = Math.min(...gaps);
      const high = Math.max(...gaps);
      console.log(
        `  ${pad(style, 6)} ${pad(side, 7)} the nearest corner of the ink faces ` +
          `the board at ${low.toFixed(2)}..${high.toFixed(2)}`,
      );
      if (Math.abs(low - GAP) > 0.02 || Math.abs(high - GAP) > 0.02) {
        throw new Error(
          `${style} ${side}: faces the board at ${low}..${high}, wanted ${GAP}`,
        );
      }
    }
    await page.close();
  }
  console.log(
    `  (GAP ${GAP}, border ${BORDER}, wood ${WOOD}, half-width ${HALF_WIDTH.toFixed(3)})`,
  );
});
