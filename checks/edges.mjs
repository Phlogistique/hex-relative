/**
 * The four coloured edges of the hexagon board, as geometry rather than by eye.
 *
 * They were drawn a segment at a time once, each shifted out along its own
 * normal and capped round, which left a knob at every point of the zigzag and
 * a notch in every valley, and let whichever colour happened to be drawn last
 * overrun the other at the corners. They are four bands now, and what says so
 * is that the outline they describe closes: each band's ends land exactly on
 * another band's, and every corner of the outer face stands exactly
 * BORDER_WIDTH off both of the edges meeting there — a knob is ink further out
 * than that, a notch is ink not as far.
 *
 * The last measure is the one the eye complained about first: red and blue
 * take the same length of outline, which is only true if every corner of the
 * board is halved between them.
 *
 * Nothing here is told which way round a band was written down, or which of
 * its two chains is the outer one; both are read off the drawing. What is
 * measured is the shape, not the order the points happen to be in.
 */
import { check, pad } from "./lib/browser.mjs";

const BORDER = 0.3; // BORDER_WIDTH in board.js
// An SVG point list comes back single precision, so these are exact numbers
// that have been through a float on the way; nothing here is a near miss.
const SLOP = 1e-4;

/** What the four bands come out at, read off the drawing. */
function bands() {
  const apart = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const all = [...document.querySelectorAll(".border")].map((band) => ({
    edge: band.getAttribute("class").replace("border border-", ""),
    points: [...band.points].map((p) => ({ x: p.x, y: p.y })),
  }));

  // A band is two chains of equal length, one laid back along the other; the
  // one further from the middle of the board is the outer face.
  const every = all.flatMap((b) => b.points);
  const middle = {
    x: every.reduce((sum, p) => sum + p.x, 0) / every.length,
    y: every.reduce((sum, p) => sum + p.y, 0) / every.length,
  };
  const outward = (chain) =>
    chain.reduce((sum, p) => sum + apart(p, middle), 0) / chain.length;
  for (const band of all) {
    const half = band.points.length / 2;
    const chains = [band.points.slice(0, half), band.points.slice(half)];
    if (outward(chains[0]) > outward(chains[1])) chains.reverse();
    [band.inner, band.outer] = [chains[0], chains[1].reverse()];
  }

  // Every end of every band has to land on another band's, in both its faces.
  const ends = all.flatMap((band, i) =>
    [0, band.inner.length - 1].map((at) => ({
      i,
      inner: band.inner[at],
      outer: band.outer[at],
    })),
  );
  const gap = Math.max(
    ...ends.map((end) =>
      Math.min(
        ...ends
          .filter((other) => other.i !== end.i)
          .map((other) =>
            Math.max(
              apart(end.inner, other.inner),
              apart(end.outer, other.outer),
            ),
          ),
      ),
    ),
  );

  // What each corner of the outer face stands off the edges meeting there. The
  // pair a band lacks at either end is the neighbouring band's to measure.
  const stands = [];
  for (const band of all) {
    band.inner.forEach((_, i) => {
      for (const [a, b] of [
        [band.inner[i - 1], band.inner[i]],
        [band.inner[i], band.inner[i + 1]],
      ]) {
        if (!a || !b) continue;
        const [dx, dy] = [b.x - a.x, b.y - a.y];
        const across =
          (band.outer[i].x - a.x) * dy - (band.outer[i].y - a.y) * dx;
        stands.push(Math.abs(across) / Math.hypot(dx, dy));
      }
    });
  }

  const length = (chain) =>
    chain.slice(1).reduce((sum, p, i) => sum + apart(p, chain[i]), 0);
  const owns = {};
  for (const band of all) {
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
