/**
 * The page on a phone. The screen is narrow and the board wants to be big, so
 * what matters is that nothing overflows sideways and that the board, with the
 * answer to a tap under it, fits on the screen.
 *
 * Fits on the screen, not fits under the toolbar: what stands above the board
 * the reader can scroll off the top, so it is not taken from the board, and on
 * a phone the board is deliberately drawn taller than the room the page
 * happens to leave it at rest. What may not go off the bottom is the answer,
 * since a tap that scrolls its own answer out of sight is no use — so the
 * board and that answer together are what has to fit, and that is measured
 * here against `svh`, the screen a phone promises whatever its URL bar is
 * doing.
 *
 * Which way round each of these screens drew the board is printed;
 * checks/turned.mjs is where the turn itself is held down.
 *
 * Touch has no hover, so the `nothing (just name cells)` mode is the only way
 * to name a cell without disturbing the position; that is checked here too.
 */
import { check, pad } from "./lib/browser.mjs";

const SCREENS = [
  ["portrait", { width: 390, height: 844 }],
  ["small portrait", { width: 320, height: 568 }],
  ["landscape", { width: 844, height: 390 }],
];

await check("On a phone", async ({ open }) => {
  for (const [label, viewport] of SCREENS) {
    const page = await open("#13n,d10j9d5j4c2b5b8", {
      viewport,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const got = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      drawn: document.querySelector(".hex-board").dataset.orientation,
      // How much of the width the drawing leaves unused. It keeps its shape
      // inside the box, so where the height is what binds — which is the usual
      // way round for an upright phone — this is the room a shorter chrome
      // above the board would turn into board.
      slack: (() => {
        const svg = document.querySelector(".hex-board");
        const box = svg.getBoundingClientRect();
        const view = svg.viewBox.baseVal;
        const scale = Math.min(
          box.width / view.width,
          box.height / view.height,
        );
        return Math.round(box.width - view.width * scale);
      })(),
      // Centre to centre, which is the one measure of how big the board came
      // out that means the same thing whichever way up the hexagons are.
      cell: (() => {
        const svg = document.querySelector(".hex-board");
        const box = svg.getBoundingClientRect();
        const view = svg.viewBox.baseVal;
        const scale = Math.min(
          box.width / view.width,
          box.height / view.height,
        );
        return Math.round(Math.sqrt(3) * scale);
      })(),
      board: Math.round(
        document.querySelector(".board").getBoundingClientRect().top,
      ),
      // The board and what has to stay under it, against the screen they have
      // to fit in: the bottom of the answer to a tap, measured from the top of
      // the board rather than from the top of the page, since everything above
      // the board scrolls away.
      needs: (() => {
        const box = document
          .querySelector(".hex-board")
          .getBoundingClientRect();
        const answer = document.querySelector(".readout-main");
        return Math.round(answer.getBoundingClientRect().bottom - box.top);
      })(),
      screen: (() => {
        const probe = document.createElement("div");
        probe.style.cssText =
          "position:fixed;top:0;left:0;width:0;height:100svh;visibility:hidden";
        document.body.appendChild(probe);
        const height = probe.getBoundingClientRect().height;
        probe.remove();
        return Math.round(height);
      })(),
      height: innerHeight,
    }));
    console.log(
      `  ${pad(label, 16)}board at ${pad(got.board, 5)}, and board plus answer ` +
        `${pad(got.needs, 5)} of ${pad(got.screen, 5)}` +
        `  ${pad(got.drawn, 5)} ${pad(`cell ${got.cell}px`, 12)}` +
        `${pad(`${got.slack}px of width to spare`, 24)}` +
        `  ${got.scroll > got.client ? "OVERFLOWS" : "no sideways overflow"}`,
    );
    if (got.scroll > got.client) throw new Error(`${label} overflows sideways`);
    // A pixel of slack: the room is measured in floats and written back as a
    // px cap, and the answer's own height is not a whole number of them.
    if (got.needs > got.screen + 1) {
      throw new Error(
        `${label}: board and answer want ${got.needs}px of ${got.screen}`,
      );
    }
    await page.close();
  }

  const page = await open("#13", {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await page.selectOption("#mode", "inspect");
  await page
    .locator(".cells .cell")
    .nth(3 * 13 + 3)
    .tap();
  const named = await page.evaluate(() => ({
    readout: document
      .querySelector(".readout-main")
      ?.textContent.replace(/\s+/g, " ")
      .trim(),
    hash: location.hash,
  }));
  console.log(
    `  ${pad("tap while inspecting", 16)}names ${named.readout}, board untouched (${named.hash})`,
  );
  if (named.hash !== "#13")
    throw new Error("inspecting should not place a stone");
});
