/**
 * The goban: the grid, the stones on it, the room around them, and the colours
 * the page is left with.
 *
 * Most of this is a claim the eye cannot settle. A triangular tiling drawn as
 * three families of straight lines looks plausible long before it is right, so
 * the first measure counts how many of those lines actually run through each
 * cell — three everywhere but the two acute corners, where the third family
 * has shrunk to a point. Then clearance: a stone played on the edge must not
 * touch the coloured band beyond it, and a row label must stand the same GAP
 * off the wooden edge as it does off the hexagons, which is a longer step
 * sideways because that edge is slanted and theirs is not.
 *
 * The last of them is not about position at all. This board is meant to have
 * no red and no blue anywhere on it, which is easy to say and easy to leave
 * half-done, so it is checked by reading the colours back off the page and
 * looking for the two the stylesheet says are gone.
 */
import { check } from "./lib/browser.mjs";
import { relative } from "../mason.js";

const GAP = 0.55; // GAP in board.js
const HALF_WIDTH = Math.sqrt(3) / 2;

/** Read the drawing back out of the DOM, in the SVG's own units. */
function measure() {
  const HALF_WIDTH = Math.sqrt(3) / 2;
  const size = Number(document.getElementById("size").value);
  const centre = (col, row) => ({
    x: Math.sqrt(3) * (col + row / 2),
    y: 1.5 * row,
  });
  const corners = (node) => {
    const flat = node
      .getAttribute("points")
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const out = [];
    for (let i = 0; i < flat.length; i += 2)
      out.push({ x: flat[i], y: flat[i + 1] });
    return out;
  };
  /** How near a point comes to a segment, and to a closed run of them. */
  const toEdge = (p, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)),
    );
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  const toOutline = (p, poly) =>
    Math.min(
      ...poly.map((corner, i) =>
        toEdge(p, corner, poly[(i + 1) % poly.length]),
      ),
    );

  const lines = [...document.querySelectorAll(".grid-line")].map((line) => ({
    x1: +line.getAttribute("x1"),
    y1: +line.getAttribute("y1"),
    x2: +line.getAttribute("x2"),
    y2: +line.getAttribute("y2"),
  }));

  // How many grid lines run through each cell centre, counting only the ones
  // whose segment actually reaches it.
  const through = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const p = centre(col, row);
      let count = 0;
      for (const l of lines) {
        const dx = l.x2 - l.x1;
        const dy = l.y2 - l.y1;
        const t = ((p.x - l.x1) * dx + (p.y - l.y1) * dy) / (dx * dx + dy * dy);
        if (t < -1e-9 || t > 1 + 1e-9) continue;
        if (Math.hypot(p.x - (l.x1 + t * dx), p.y - (l.y1 + t * dy)) < 1e-9)
          count++;
      }
      through.push({ col, row, count });
    }
  }

  const bands = [...document.querySelectorAll(".band")].map((band) => ({
    edge: band.getAttribute("class").split("band-")[1],
    outline: corners(band),
  }));

  // The nearest any stone's rim comes to any band.
  let clearance = { gap: Infinity };
  for (const cell of document.querySelectorAll(".cell")) {
    const stone = cell.querySelector(".stone");
    if (stone.classList.contains("hidden")) continue;
    const [, x, y] = cell
      .getAttribute("transform")
      .match(/translate\(([-\d.]+) ([-\d.]+)\)/)
      .map(Number);
    const r = +stone.getAttribute("r");
    for (const band of bands) {
      const gap = toOutline({ x, y }, band.outline) - r;
      if (gap < clearance.gap) clearance = { gap, x, y, edge: band.edge };
    }
  }

  // Where the wood is actually painted on the left flank. The polygon is drawn
  // half a bevel short of that edge and stroked back out to it, and a step
  // sideways covers less ground than a step square on, the flank being slanted.
  const wood = document.querySelector(".wood");
  const rim = corners(wood);
  const [a, b] = [rim[3], rim[0]]; // sides run top, right, bottom, left
  const painted = +wood.getAttribute("stroke-width") / 2 / HALF_WIDTH;
  const flank = (y) => a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y) - painted;

  const rows = [...document.querySelectorAll('.labels text[data-side="left"]')]
    .filter((node) => node.dataset.line === "0")
    .map((node, index) => ({
      text: node.textContent,
      // text-anchor is "end" on this side, so x is the edge facing the board.
      // The flank leans, so the sideways gap is longer than the real one.
      gap:
        (flank(centre(0, index).y) - Number(node.getAttribute("x"))) *
        HALF_WIDTH,
    }));

  const stars = [...document.querySelectorAll(".star")].map((dot) => {
    const row = Math.round(+dot.getAttribute("cy") / 1.5);
    return {
      col: Math.round(+dot.getAttribute("cx") / Math.sqrt(3) - row / 2),
      row,
    };
  });

  return { size, through, clearance, rows, stars, lines: lines.length };
}

/**
 * Everything the board and the panels describing it are painted with, weighed
 * against what the stylesheet's red and blue come out as. Custom properties
 * have to be resolved through an element: they are names, not colours, until
 * something is painted with them.
 */
function palette() {
  const probe = document.createElement("span");
  document.body.appendChild(probe);
  const resolve = (name) => {
    probe.style.color = `var(${name})`;
    return getComputedStyle(probe).color;
  };
  const gone = new Map(
    ["--red", "--red-dark", "--blue", "--blue-dark"].map((name) => [
      resolve(name),
      name,
    ]),
  );
  probe.remove();

  const used = [];
  for (const node of document.querySelectorAll(
    ".hex-board *, #moves *, #status, #readout *",
  )) {
    const style = getComputedStyle(node);
    for (const property of [
      "color",
      "fill",
      "stroke",
      "backgroundColor",
      "boxShadow",
    ]) {
      for (const [colour, name] of gone) {
        if (!style[property].includes(colour)) continue;
        used.push({
          name,
          property,
          node: `${node.tagName.toLowerCase()}.${node.getAttribute("class") ?? ""}`,
        });
      }
    }
  }
  return { used };
}

async function goban(open, hash) {
  const page = await open(hash);
  await page.selectOption("#style", "goban");
  await page.waitForTimeout(150);
  return page;
}

await check("The grid the goban is drawn on", async ({ open }) => {
  const page = await goban(open, "#13n,d10j9d5j4c2b5b8");
  const { size, through, stars, lines } = await page.evaluate(measure);

  const acute = new Set(["0,0", `${size - 1},${size - 1}`]);
  const wanted = (c) => (acute.has(`${c.col},${c.row}`) ? 2 : 3);
  const wrong = through.filter((c) => c.count !== wanted(c));
  console.log(
    `  ${lines} lines through ${through.length} cells: three at each, but the ` +
      `two acute corners, where the third family is a single point`,
  );
  if (wrong.length) {
    throw new Error(
      "lines through a cell: " +
        wrong
          .slice(0, 6)
          .map((c) => `${c.col},${c.row} has ${c.count} not ${wanted(c)}`)
          .join("; "),
    );
  }

  // Go's star points, put on the 4-4 points, which carry those names whatever
  // the board size, and on the centre.
  const named = stars.map((s) => relative(s.col, s.row, size)).sort();
  const expected = ["44", "44'", "4'4", "4'4'", "77"].sort();
  console.log(`  star points ${named.join(" ")}`);
  if (named.join(" ") !== expected.join(" ")) {
    throw new Error(
      `star points ${named.join(" ")}, wanted ${expected.join(" ")}`,
    );
  }
});

await check("What the goban leaves clear", async ({ open }) => {
  // A stone in every corner and along every edge, which is the only place the
  // coloured band has a chance to foul one.
  const page = await goban(open, "#9n,a1i1a9i9e1e9a5i5c1g9");
  const { clearance, rows } = await page.evaluate(measure);
  const gaps = rows.map((r) => r.gap);

  console.log(
    `  nearest a stone comes to a band: ${clearance.gap.toFixed(3)}, ` +
      `at ${clearance.x.toFixed(2)},${clearance.y.toFixed(2)} ` +
      `(the ${clearance.edge} one)`,
  );
  if (clearance.gap < 0.15) {
    throw new Error(
      `a stone comes within ${clearance.gap} of the ${clearance.edge} band`,
    );
  }

  console.log(
    `  row labels face the wooden edge at ${Math.min(...gaps).toFixed(3)}..` +
      `${Math.max(...gaps).toFixed(3)}, wanting ${GAP}`,
  );
  for (const r of rows) {
    if (Math.abs(r.gap - GAP) > 0.02) {
      throw new Error(
        `label ${r.text} stands ${r.gap} off the wood, wanted ${GAP}`,
      );
    }
  }
  console.log(
    `  which is a sideways step of ${(GAP / HALF_WIDTH).toFixed(3)}, ` +
      `the flank leaning`,
  );
});

await check("No red and no blue on the goban", async ({ open }) => {
  // The hexagons first, to prove the reading finds those colours when they are
  // there. Without it the check would pass just as well on a blank page.
  const hexes = await open("#9n,a1i1e5,c3");
  const { used: before } = await hexes.evaluate(palette);
  console.log(`  hexes  ${before.length} things painted red or blue`);
  if (!before.length) {
    throw new Error("found none beside the hexagons, so the reading is blind");
  }
  await hexes.close();

  const page = await goban(open, "#9n,a1i1e5,c3");
  const { used } = await page.evaluate(palette);
  console.log(
    `  goban  ${used.length} things painted red or blue` +
      (used.length
        ? ": " + used.map((u) => `${u.node} ${u.property} ${u.name}`).join(", ")
        : ""),
  );
  if (used.length) {
    throw new Error(
      `${used[0].name} still on ${used[0].node} (${used[0].property})`,
    );
  }
});

await check("What the toolbar calls the two colours", async ({ open }) => {
  // The board has no red or blue on it, so nothing that names a player beside
  // it should either. The values behind the options do not move: the cells,
  // the history and the URL call them red and blue whichever way the board is
  // drawn, and only what is printed changes.
  const page = await open("#9");
  const read = () =>
    page.$$eval("#mode option", (options) =>
      options.map((o) => `${o.value}=${o.textContent}`).join("  "),
    );

  const hexes = await read();
  await page.selectOption("#style", "goban");
  await page.waitForTimeout(120);
  const goban = await read();
  console.log(`  hexes  ${hexes}`);
  console.log(`  goban  ${goban}`);

  for (const [where, got, wanted] of [
    ["hexes", hexes, "red=red only  blue=blue only"],
    ["goban", goban, "red=black only  blue=white only"],
  ]) {
    if (!got.includes(wanted)) {
      throw new Error(`${where}: placing reads "${got}", wanted "${wanted}"`);
    }
  }

  // And back again, since a one-way switch would pass everything above.
  await page.selectOption("#style", "hex");
  await page.waitForTimeout(120);
  const back = await read();
  if (back !== hexes) {
    throw new Error(`switching back left placing reading "${back}"`);
  }
  console.log("  and back to red and blue on returning to the hexagons");
});

await check("Placing on the goban", async ({ open }) => {
  // Nothing is painted under a stone here: the hexagons are still there as the
  // click target, but transparent. A fill of `none` would stop taking clicks,
  // and the whole board would go dead without looking any different, so the
  // one thing worth proving is that a click still lands.
  const page = await goban(open, "#9");
  const at = await page.evaluate(() => {
    const cells = [...document.querySelectorAll(".cell")];
    const box = cells[4 * 9 + 4].getBoundingClientRect(); // e5, the centre
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(60);

  const played = await page.textContent(".movelist .coord-small");
  const hash = new URL(page.url()).hash;
  console.log(`  a click on the middle of the board plays ${played} (${hash})`);
  if (played !== "55" || !hash.includes("e5")) {
    throw new Error(`clicking the centre of a 9x9 gave ${played}, ${hash}`);
  }
});
