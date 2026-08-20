/**
 * The board turned upright.
 *
 * Where the screen is taller than it is wide the whole drawing is turned a
 * twelfth of a turn clockwise, which stands the columns upright, leans the
 * rows down to the right, and puts the same board in the same box stood on its
 * end. The hexagons come round with it and end up on their sides.
 *
 * Which turn that is matters, and the first two measures here are what say so.
 * The columns must come out truly vertical: a rhombus fills its own box
 * exactly when a pair of its sides stands square to the screen, and the point
 * of turning is to give the board room rather than to spend it on the corners.
 * And 11 must keep the bottom left corner, with the red edge falling away from
 * it to 11' at the lowest point of all, which is what picks this turn out of
 * the two that stand the board upright.
 *
 * Then that it is the same board — a tap still lands on the cell under the
 * finger, which is the one thing the turn could break silently, the drawing
 * looking right while the board answers for the wrong cell — and that it is
 * bigger than the same board lying down on the same screen, since that is the
 * whole of why it turns.
 *
 * Then that it stays turned, or stays lying down, while the reader scrolls. A
 * phone slides its URL bar away as you scroll down and back as you scroll up,
 * and `innerHeight` follows it either way with a resize each time. Measuring
 * the room with that turned the board over mid-scroll on a screen near the
 * size where the decision is close, which is the one bug this drawing has had
 * that the reader meets by doing nothing at all.
 *
 * Then the labels, which is the part the turn genuinely disturbs. Lying down, a
 * row's labels face a vertical flank and a column's face a level row of points;
 * turned, the hexagons are on their sides and it is the other way about, so
 * every one of the four clearances is measured against a different piece of
 * the outline than it was. The text stays upright throughout, so what stands
 * off the edge is one corner of the ink, and that corner is what is measured.
 */
import { check, pad } from "./lib/browser.mjs";
import { relative } from "../mason.js";

// All four must match board.js.
const GAP = 0.55;
const BORDER = 0.3; // BORDER_WIDTH
const WOOD = 1.85;
const HALF_WIDTH = Math.sqrt(3) / 2;

// Tall enough that turning the board pays, which is what makes it happen.
const UPRIGHT = { width: 420, height: 1000 };
// The same width, too short for the turn to be worth anything.
const FLAT = { width: 420, height: 420 };

const phone = { isMobile: true, hasTouch: true };

/** Where every cell was drawn, and how big the drawing came out. */
function drawing() {
  const size = Number(document.getElementById("size").value);
  const cells = [...document.querySelectorAll(".cells .cell")].map(
    (cell, index) => {
      // Turned, a coordinate that ought to be nothing comes out as a
      // rounding error in exponent form, so the numbers here are read loosely.
      const [, x, y] = cell
        .getAttribute("transform")
        .match(/translate\(([-+\d.eE]+) ([-+\d.eE]+)\)/)
        .map(Number);
      return { col: index % size, row: Math.floor(index / size), x, y };
    },
  );
  const svg = document.querySelector(".hex-board");
  const view = svg.viewBox.baseVal;
  const box = svg.getBoundingClientRect();
  const hex = document.querySelector(".cells .hex").getBoundingClientRect();
  return {
    size,
    cells,
    orientation: svg.dataset.orientation,
    view: { width: view.width, height: view.height },
    // What the drawing came out at: it keeps its shape inside whatever box is
    // left, so the smaller of the two is the one that binds.
    scale: Math.min(box.width / view.width, box.height / view.height),
    hex: { width: hex.width, height: hex.height },
  };
}

/**
 * How far every label of the inner line stands off the edge it faces.
 *
 * Written out from the geometry rather than read back off board.js: the edge a
 * side's labels face, as its outward normal and how far past the cell centres
 * it stands. On the hexagons that is measured square on to the screen, and how
 * far a hexagon reaches each way swaps over when it goes onto its side; the
 * wooden board has real edges, which lean with it. A label's own facing edge is
 * its anchor, so the two corners to try are the top and bottom of the ink
 * there.
 */
function clearances() {
  const H = Math.sqrt(3) / 2;
  const [BORDER, WOOD] = [0.3, 1.85];
  const size = Number(document.getElementById("size").value);
  const last = size - 1;
  const svg = document.querySelector(".hex-board");
  const tall = svg.dataset.orientation === "tall";
  const hex = !svg.classList.contains("dual");

  const turn = (p) =>
    tall ? { x: p.x * H - p.y / 2, y: p.x / 2 + p.y * H } : p;
  const at = (col, row) =>
    turn({ x: Math.sqrt(3) * (col + row / 2), y: 1.5 * row });
  const back = (v) => ({ x: -v.x, y: -v.y });

  const flank = {
    normal: hex ? { x: 1, y: 0 } : turn({ x: H, y: -0.5 }),
    out: hex ? (tall ? 1 : H) + BORDER : WOOD,
  };
  const end = {
    normal: hex ? { x: 0, y: -1 } : turn({ x: 0, y: -1 }),
    out: hex ? (tall ? H : 1) + BORDER : WOOD,
  };
  const faces = {
    left: { ...flank, normal: back(flank.normal), cell: (i) => [0, i] },
    right: { ...flank, cell: (i) => [last, i] },
    top: { ...end, cell: (i) => [i, 0] },
    bottom: { ...end, normal: back(end.normal), cell: (i) => [i, last] },
  };

  // Half the digits' ink, worked out exactly as board.js does it, since
  // trimming the em box by eye does not recover the same edge.
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
  for (const [side, face] of Object.entries(faces)) {
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
        ...corners.map((c) => c.x * face.normal.x + c.y * face.normal.y),
      );
      return { text: node.textContent, gap: near - face.out };
    });
  }
  return measured;
}

await check("The board turned upright", async ({ open }) => {
  const page = await open("#13n,d10j9d5j4c2b5b8", {
    viewport: UPRIGHT,
    ...phone,
  });
  const { size, cells, orientation, view, scale, hex } =
    await page.evaluate(drawing);
  const last = size - 1;

  if (orientation !== "tall") throw new Error("the board did not turn");

  // The blue edges are the columns, and upright is what the turn is for: a
  // rhombus fills its own box exactly when a pair of its sides stands square
  // to the screen, and any other angle spends board on the corners.
  const spread = (col) => {
    const xs = cells.filter((c) => c.col === col).map((c) => c.x);
    return Math.max(...xs) - Math.min(...xs);
  };
  const lean = Math.max(spread(0), spread(last));
  console.log(
    `  the blue edges stand upright to within ${lean.toFixed(4)}, and the ` +
      `drawing is ${view.width.toFixed(1)} by ${view.height.toFixed(1)}`,
  );
  if (lean > 1e-9) throw new Error(`a blue edge leans by ${lean}`);
  if (view.height <= view.width) {
    throw new Error(
      `drawing ${view.width} by ${view.height}, wanting it taller`,
    );
  }

  // Which of the two upright turns this is. A whole column stands at the same
  // x, so a corner on a flank is the end of that column rather than the one
  // cell furthest over — and at the same x only to within the rounding error
  // the turn leaves where it should leave nothing.
  const most = (of, among = cells) =>
    among.reduce((best, cell) => (of(cell) > of(best) ? cell : best));
  const flank = (of) => {
    const edge = of(most(of));
    return cells.filter((cell) => Math.abs(of(cell) - edge) < 0.001);
  };
  const name = (cell) => relative(cell.col, cell.row, size);
  const named = {
    "bottom left": name(
      most(
        (c) => c.y,
        flank((c) => -c.x),
      ),
    ),
    bottom: name(most((c) => c.y)),
    top: name(most((c) => -c.y)),
    "top right": name(
      most(
        (c) => -c.y,
        flank((c) => c.x),
      ),
    ),
  };
  console.log(
    "  " +
      Object.entries(named)
        .map(([where, called]) => `${called} at the ${where}`)
        .join(", "),
  );
  const wanted = {
    "bottom left": "11",
    bottom: "11'",
    top: "1'1",
    "top right": "1'1'",
  };
  for (const [where, name] of Object.entries(wanted)) {
    if (named[where] !== name) {
      throw new Error(`${named[where]} at the ${where}, wanted ${name}`);
    }
  }

  // The lowest cell, which is the one furthest from where it sits when the
  // board lies down: if a click went by the drawing rather than by the cell it
  // was drawn for, it would answer for something else entirely.
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
  const bigger = scale / lying.scale - 1;
  console.log(
    `  on ${UPRIGHT.width}px of screen it is drawn at ${scale.toFixed(1)}px to ` +
      `the unit against ${lying.scale.toFixed(1)} lying down, ` +
      `${(bigger * 100).toFixed(0)}% bigger: a hexagon ${hex.width.toFixed(0)} ` +
      `by ${hex.height.toFixed(0)}px on its side, against ` +
      `${lying.hex.width.toFixed(0)} by ${lying.hex.height.toFixed(0)}`,
  );
  if (lying.orientation !== "wide") {
    throw new Error("the short screen turned the board as well");
  }
  if (bigger <= 0.1) {
    throw new Error(`turning the board gained ${(bigger * 100).toFixed(0)}%`);
  }
});

await check("Labels on the board turned upright", async ({ open }) => {
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

// What a URL bar actually does: `innerHeight` follows it and a resize fires,
// while the layout viewport — what `svh` and `vh` resolve against — stays put.
// `setViewportSize` moves both, so it cannot show this; redefining innerHeight
// can, and does exactly what the bar does.
const BAR = 96;

// 390 by 690 is a phone near enough to the size where the board is in two
// minds; the bar is worth more than the margin there, which is why it showed.
const CLOSE = { width: 390, height: 690 };

await check(
  "A URL bar sliding away does not turn the board",
  async ({ open }) => {
    for (const style of ["hex", "goban"]) {
      const page = await open("#13n,d10j9d5j4c2b5b8", {
        viewport: CLOSE,
        ...phone,
      });
      if (style !== "hex") {
        await page.selectOption("#style", style);
        await page.waitForTimeout(150);
      }
      const read = () =>
        page.evaluate(() => {
          const probe = document.createElement("div");
          probe.style.cssText =
            "position:fixed;height:100svh;width:0;visibility:hidden";
          document.body.appendChild(probe);
          const svh = probe.getBoundingClientRect().height;
          probe.remove();
          return {
            way: document.querySelector("svg").dataset.orientation,
            inner: innerHeight,
            svh,
          };
        });

      const before = await read();
      await page.evaluate((bar) => {
        Object.defineProperty(window, "innerHeight", {
          value: innerHeight + bar,
          configurable: true,
        });
        dispatchEvent(new Event("resize"));
      }, BAR);
      await page.waitForTimeout(200);
      const after = await read();

      console.log(
        `  ${pad(style, 6)} bar out: innerHeight ${before.inner} to ${after.inner}, ` +
          `svh ${before.svh} to ${after.svh}, board ${before.way} to ${after.way}`,
      );
      if (before.svh !== after.svh) {
        throw new Error("svh moved with the bar, so this proves nothing");
      }
      if (before.way !== after.way) {
        throw new Error(
          `the board went ${before.way} to ${after.way} on the bar alone`,
        );
      }
      await page.close();
    }
  },
);

/**
 * Which way round draws the bigger board is not the same question as which way
 * round the box leans, and this is the difference.
 *
 * The two drawings would be each other's transposed if the board were all
 * there is to them, and then a box taller than it is wide would want the
 * upright one and there would be nothing to measure. The labels are what
 * spoils it: they come round with neither the board nor the reader's head, so
 * a printed number stands the same way up in both drawings and takes its width
 * out of the upright one's width, where lying down it took the same width out
 * of a side with room to spare. The upright drawing therefore comes out
 * slightly stouter than the lying one turned on its side, and that leaves a
 * band of screens — a few percent wide, and a phone held upright is often in
 * it — where the box is wider than it is tall and standing the board up still
 * draws it bigger.
 *
 * The band is worked out here from the two drawings, a screen is built to land
 * in the middle of it, and the page has to stand the board up there and draw
 * it bigger for having done so.
 */
await check(
  "Turning pays before the box is taller than it is wide",
  async ({ open }) => {
    // Narrow enough that the chrome above the board leaves a box near enough
    // square for the band to be reachable at all.
    const WIDTH = 360;

    for (const style of ["hex", "goban"]) {
      const page = await open("#13n,d10j9d5j4c2b5b8", {
        viewport: { width: WIDTH, height: 700 },
        ...phone,
      });
      if (style !== "hex") {
        await page.selectOption("#style", style);
        await page.waitForTimeout(150);
      }

      // What the page needs to know about itself: how wide the board's box is,
      // what stands above and below it, and how big the drawing comes out each
      // way round. The shapes are asked of the board itself, which draws the way
      // round it is not showing out of sight to answer; they are checked against
      // a real drawing of that orientation, since a hidden drawing that measured
      // nothing would look like a very stout board and turn every screen.
      const found = await page.evaluate(async () => {
        const { HexBoard } = await import("./board.js");
        const svg = document.querySelector(".hex-board");
        const size = Number(document.getElementById("size").value);
        const style = svg.classList.contains("style-goban") ? "goban" : "hex";
        const host = document.createElement("div");
        host.style.width = "400px";
        document.body.appendChild(host);
        const asked = {};
        const drawn = {};
        for (const orientation of ["wide", "tall"]) {
          const real = new HexBoard(host, {
            size,
            labels: "relative",
            style,
            orientation,
          });
          const view = real.svg.viewBox.baseVal;
          drawn[orientation] = { width: view.width, height: view.height };
          // The other way round, which it has to draw out of sight to answer.
          asked[orientation === "tall" ? "wide" : "tall"] = {
            ...real.shape(orientation === "tall" ? "wide" : "tall"),
          };
        }
        host.remove();

        const box = svg.getBoundingClientRect();
        const answer = document.querySelector(".side .card .readout-main");
        return {
          drawn,
          asked,
          width: box.width,
          // Everything the board is not allowed to take: what stands above it,
          // and what has to stay on screen under it.
          above: box.top + scrollY,
          below: answer.getBoundingClientRect().bottom - box.bottom,
        };
      });
      await page.close();

      for (const orientation of ["wide", "tall"]) {
        const one = found.drawn[orientation];
        const other = found.asked[orientation];
        const off = Math.max(
          Math.abs(one.width - other.width),
          Math.abs(one.height - other.height),
        );
        if (off > 1e-6) {
          throw new Error(
            `${style} ${orientation}: drawn ${one.width}x${one.height}, ` +
              `answered ${other.width}x${other.height}`,
          );
        }
      }

      // Where turning starts to pay: the upright drawing is bound by its height
      // and the lying one by its width, so the room has to reach this much of
      // the width rather than all of it.
      const { wide, tall } = found.drawn;
      const pays = tall.height / wide.width;
      const middle = (pays + 1) / 2; // halfway into the band
      const room = found.width * middle;
      const height = Math.round(found.above + room + found.below);

      const at = await open("#13n,d10j9d5j4c2b5b8", {
        viewport: { width: WIDTH, height },
        ...phone,
      });
      if (style !== "hex") {
        await at.selectOption("#style", style);
        await at.waitForTimeout(150);
      }
      const got = await at.evaluate(drawing);
      const cell = (shape) =>
        Math.sqrt(3) * Math.min(found.width / shape.width, room / shape.height);
      console.log(
        `  ${pad(style, 6)} upright is ${((1 / pays - 1) * 100).toFixed(1)}% stouter ` +
          `than lying down on its side, so on ${WIDTH}x${height} a box ` +
          `${found.width.toFixed(0)} by ${room.toFixed(0)} — wider than it is tall — ` +
          `is drawn ${got.orientation}, at ${cell(tall).toFixed(1)}px to the cell ` +
          `against ${cell(wide).toFixed(1)} lying down`,
      );
      if (room >= found.width) {
        throw new Error(
          `the box is ${found.width} by ${room}, wanted it wider`,
        );
      }
      if (cell(tall) <= cell(wide)) {
        throw new Error(
          `upright draws ${cell(tall)}, lying down ${cell(wide)}`,
        );
      }
      if (got.orientation !== "tall") {
        throw new Error(`drawn ${got.orientation} where upright draws bigger`);
      }
      await at.close();
    }
  },
);
