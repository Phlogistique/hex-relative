/**
 * The four coloured edges of the hexagon board, as geometry rather than by eye.
 *
 * They used to be drawn a segment at a time, each shifted out along its own
 * normal and capped round, which left a knob at every point of the zigzag and
 * a notch in every valley, and let whichever colour happened to be drawn last
 * overrun the other at the corners. They are four bands now, and what says so
 * is that the outline they describe closes: each band's ends land exactly on
 * its neighbours', and every corner of the outer face stands exactly
 * BORDER_WIDTH off both of the edges meeting there — a knob is ink further out
 * than that, a notch is ink not as far.
 *
 * The last measure is the one the eye complained about first: red and blue
 * take the same length of outline, which is only true if every corner of the
 * board is halved between them.
 */
import { check, pad } from "./lib/browser.mjs";

const BORDER = 0.3; // BORDER_WIDTH in board.js
// An SVG point list comes back single precision, so these are exact numbers
// that have been through a float on the way; nothing here is a near miss.
const SLOP = 1e-4;

/** What the four bands come out at, read off the drawing. */
function bands() {
  // A band is its outer face followed by its inner one, walked back.
  const bands = [...document.querySelectorAll(".border")].map((band) => {
    const points = [...band.points].map((p) => ({ x: p.x, y: p.y }));
    const half = points.length / 2;
    return {
      edge: band.getAttribute("class").replace("border border-", ""),
      outer: points.slice(0, half),
      inner: points.slice(half).reverse(),
    };
  });

  const apart = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // How far the bands are from joining up: every end against its neighbour's.
  let gap = 0;
  bands.forEach((band, i) => {
    const next = bands[(i + 1) % bands.length];
    const end = (chain) => chain[chain.length - 1];
    gap = Math.max(gap, apart(end(band.outer), next.outer[0]));
    gap = Math.max(gap, apart(end(band.inner), next.inner[0]));
  });

  // The one outline the four of them describe, each join counted once.
  const ring = (pick) => bands.flatMap((b) => pick(b).slice(0, -1));
  const inner = ring((b) => b.inner);
  const outer = ring((b) => b.outer);
  // What each corner of the outer face stands off the edges meeting there.
  const stands = [];
  for (let i = 0; i < inner.length; i++) {
    for (const [a, b] of [
      [inner[(i + inner.length - 1) % inner.length], inner[i]],
      [inner[i], inner[(i + 1) % inner.length]],
    ]) {
      const [dx, dy] = [b.x - a.x, b.y - a.y];
      const len = Math.hypot(dx, dy);
      // Walked clockwise, so the outward normal is the direction turned left.
      stands.push(((outer[i].x - a.x) * dy - (outer[i].y - a.y) * dx) / len);
    }
  }

  const length = (chain) =>
    chain.slice(1).reduce((sum, p, i) => sum + apart(p, chain[i]), 0);
  const owns = {};
  for (const band of bands) {
    const colour = band.edge.startsWith("red") ? "red" : "blue";
    owns[colour] = (owns[colour] ?? 0) + length(band.inner);
  }
  return {
    lying: document.querySelector(".hex-board").dataset.orientation === "wide",
    gap,
    low: Math.min(...stands),
    high: Math.max(...stands),
    owns,
  };
}

// The smallest board there is, one the reader might meet, and one on a phone,
// where the turn moves every point of this. At size 2 the board is nothing but
// its corners.
const BOARDS = [
  ["2", "#2n", {}],
  ["9", "#9n,a1i1a9i9e1e9a5i5c1g9", {}],
  ["13", "#13n,d10j9d5", { viewport: { width: 390, height: 844 } }],
];

await check("The coloured edges", async ({ open }) => {
  for (const [name, hash, options] of BOARDS) {
    const page = await open(hash, options);
    const { lying, gap, low, high, owns } = await page.evaluate(bands);
    console.log(
      `  ${pad(name, 6)} ${pad(lying ? "lying down" : "upright", 11)}` +
        `   join up to within ${gap.toFixed(4)}` +
        `   outer face stands off ${low.toFixed(4)}..${high.toFixed(4)}` +
        `   red takes ${owns.red.toFixed(3)} of outline, blue ${owns.blue.toFixed(3)}`,
    );
    await page.close();

    if (gap > SLOP) throw new Error(`${name}: the bands leave a gap of ${gap}`);
    if (Math.abs(low - BORDER) > SLOP || Math.abs(high - BORDER) > SLOP) {
      throw new Error(
        `${name}: the outer face stands off ${low}..${high}, wanted ${BORDER}`,
      );
    }
    if (Math.abs(owns.red - owns.blue) > SLOP) {
      throw new Error(
        `${name}: red takes ${owns.red} of outline against blue's ${owns.blue}`,
      );
    }
  }
});
