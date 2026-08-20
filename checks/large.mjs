/**
 * The largest board the page will draw, 53x53, which is where hexworld stops
 * too. Two things go wrong at that size and nowhere else:
 *
 *  - columns run past the alphabet, so a1 .. z53 is followed by aa1 .. ba53,
 *    in hexworld's spelling (bijective base 26) rather than a repeated letter;
 *  - 53 cells across a screen is 2809 hexagons in a rhombus half again as wide
 *    as it is tall, which must still come out inside its box.
 *
 * What the numbers printed here are for: a cell is about 10px across and the
 * labels around 5px on a 1280-wide screen, which is small but drawn correctly
 * and legible on a retina display. They are worth watching for a change that
 * makes the board smaller still.
 */
import { check, pad } from "./lib/browser.mjs";

const SIZE = 53;
const LAST = "ba53"; // the far corner: column 53 is "ba", not "z1" or "a"

/** What the board comes to on screen, in CSS pixels. */
const measure = () => {
  const svg = document.querySelector(".hex-board");
  const box = svg.getBoundingClientRect();
  const viewBox = svg.getAttribute("viewBox").split(" ").map(Number);
  const scale = box.width / viewBox[2];
  const root = document.documentElement;
  return {
    cells: document.querySelectorAll(".cells .cell").length,
    width: Math.round(box.width),
    height: Math.round(box.height),
    cell: Math.round(Math.sqrt(3) * scale * 10) / 10,
    label: Math.round(0.88 * scale * 10) / 10,
    card: Math.round(document.querySelector(".board").clientWidth),
    cap: Math.round(0.78 * innerHeight),
    overflows: root.scrollWidth > root.clientWidth,
    // Labels carry the side they belong to; the top edge, left to right, is
    // the line of column names.
    columns: [
      ...document.querySelectorAll(
        '.labels text[data-side="top"][data-line="0"]',
      ),
    ].map((t) => t.textContent),
  };
};

await check("The largest board", async ({ open }) => {
  const page = await open(`#${SIZE}n,${LAST}aa27a1`);
  const got = await page.evaluate(measure);
  console.log(
    `  ${pad(`${SIZE}x${SIZE}`, 8)}${got.cells} cells   ${got.width}x${got.height} in a ` +
      `${got.card} box   cell ${got.cell}px   label ${got.label}px   ` +
      (got.overflows ? "OVERFLOWS" : "no sideways overflow"),
  );

  if (got.cells !== SIZE * SIZE) throw new Error(`${got.cells} cells drawn`);
  if (got.overflows) throw new Error("the page overflows sideways");
  if (got.width > got.card) throw new Error("the board is wider than its box");
  if (got.height > got.cap) throw new Error("the board is taller than 78vh");

  // The last stone played was in the far corner, so the stone list is where to
  // read whether the board and the notation agree about which cell that is.
  const named = await page.evaluate(() => ({
    standard: document.querySelector(".movelist .standard-small").textContent,
    relative: document.querySelector(".movelist .coord-small").textContent,
    stones: document.querySelectorAll(".stone:not(.hidden)").length,
  }));
  console.log(
    `  ${pad("corner", 8)}${named.standard} is ${named.relative}   ${named.stones} stones on the board`,
  );
  if (named.standard !== LAST)
    throw new Error(`corner named ${named.standard}`);
  if (named.relative !== "11'") throw new Error(`corner is ${named.relative}`);
  if (named.stones !== 3) throw new Error(`${named.stones} stones drawn`);

  // The columns are lettered a..z aa..ba, on all four sides of the board.
  await page.selectOption("#labels", "standard");
  await page.waitForTimeout(150);
  const columns = (await page.evaluate(measure)).columns;
  const across = columns; // the top edge, left to right
  console.log(
    `  ${pad("columns", 8)}${across.slice(24, 29).join(" ")} ... ${across.at(-1)}`,
  );
  if (across.at(0) !== "a" || across.at(25) !== "z" || across.at(26) !== "aa") {
    throw new Error(`columns run ${across.slice(24, 28).join(" ")}`);
  }
  if (across.at(-1) !== "ba")
    throw new Error(`last column is ${across.at(-1)}`);
  if (new Set(across).size !== SIZE)
    throw new Error("two columns share a name");
  await page.close();

  // A phone cannot show 53 rows usefully, but it must not break the page.
  const phone = await open(`#${SIZE}n,${LAST}`, {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const small = await phone.evaluate(measure);
  console.log(
    `  ${pad("phone", 8)}${small.width}x${small.height}   cell ${small.cell}px   ` +
      (small.overflows ? "OVERFLOWS" : "no sideways overflow"),
  );
  if (small.overflows) throw new Error("the phone page overflows sideways");
  await phone.close();
});
