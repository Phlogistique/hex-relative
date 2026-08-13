/**
 * The page on a phone. The board is a wide rhombus and the screen is narrow,
 * so what matters is that nothing overflows sideways and that the Cell panel —
 * where a tap's answer appears — is on screen without scrolling.
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
      board: Math.round(
        document.querySelector(".board").getBoundingClientRect().top,
      ),
      panel: Math.round(
        document.querySelector(".card").getBoundingClientRect().top,
      ),
      height: innerHeight,
    }));
    console.log(
      `  ${pad(label, 16)}board at ${pad(got.board, 5)} panel at ${pad(got.panel, 5)} of ${pad(got.height, 5)}` +
        `  ${got.scroll > got.client ? "OVERFLOWS" : "no sideways overflow"}`,
    );
    if (got.scroll > got.client) throw new Error(`${label} overflows sideways`);
    // Held sideways there is no room for masthead, board and panel at once —
    // 390px of height against a board capped at 78vh — so that screen scrolls,
    // and only the upright ones have to answer a tap without moving.
    if (viewport.height > viewport.width && got.panel > got.height) {
      throw new Error(`${label}: the Cell panel is below the fold`);
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
