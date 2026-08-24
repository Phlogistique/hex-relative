/**
 * Pictures to look at, since some of this can only be judged by eye. Writes
 * PNGs next to this file; they are not committed.
 *
 *   node checks/screenshots.mjs
 */
import { check } from "./lib/browser.mjs";
import { fileURLToPath } from "node:url";

const here = (name) => fileURLToPath(new URL(name, import.meta.url));

const SHOTS = [
  ["board-13.png", "#13n,d10j9d5j4c2b5b8", {}],
  ["board-5.png", "#5n,c3b4d2", {}],
  ["board-19.png", "#19n,j10d4", {}],
  // the largest board there is, where the labels are at their smallest
  ["board-53.png", "#53n,ba53aa27a1", {}],
  ["board-53-standard.png", "#53n,ba53aa27a1", { labels: "standard" }],
  ["board-standard.png", "#11n,f6e5", { labels: "standard" }],
  // stones on every edge and corner, where the border used to cut across them
  ["edges.png", "#9n,a1i1a9i9e1e9a5i5c1g9", {}],
  // the same, drawn on the tiling's dual: stones on the intersections
  ["goban-13.png", "#13n,d10j9d5j4c2b5b8", { style: "goban" }],
  ["goban-9-edges.png", "#9n,a1i1a9i9e1e9a5i5c1g9", { style: "goban" }],
  ["goban-5.png", "#5n,c3b4d2", { style: "goban" }],
  ["goban-53.png", "#53n,ba53aa27a1", { style: "goban" }],
  ["goban-19.png", "#19n,j10d4p16", { style: "goban" }],
];

await check("Screenshots", async ({ open }) => {
  for (const [name, hash, options] of SHOTS) {
    const page = await open(hash, { deviceScaleFactor: 2 });
    if (options.labels) await page.selectOption("#labels", options.labels);
    if (options.style) await page.selectOption("#style", options.style);
    await page.waitForTimeout(150);
    await page.locator(".board").screenshot({ path: here(name) });
    console.log(`  ${name}`);
    await page.close();
  }

  const full = await open("#13n,d10j9d5j4c2b5b8");
  await full.screenshot({ path: here("page.png") });
  console.log("  page.png");

  // The whole page on the goban, with a game already won: the stone list and
  // the win message change vocabulary along with the drawing, and there is
  // nowhere else to see that.
  const won = await open("#5n,c1:pc2:pc3:pc4:pc5");
  await won.selectOption("#style", "goban");
  await won.waitForTimeout(150);
  await won.screenshot({ path: here("page-goban.png") });
  console.log("  page-goban.png");

  // Upright, where the rhombus is turned to stand on its long diagonal: the
  // labels are the thing to look at, every one of them now standing off an
  // edge that leans, in two lines that run diagonally away from the board.
  for (const [name, style, viewport] of [
    ["phone.png", "hex", { width: 390, height: 844 }],
    ["phone-goban.png", "goban", { width: 390, height: 844 }],
    // and held sideways, where the board lies down again and the answer to a
    // tap stands beside it rather than under it
    ["sideways.png", "hex", { width: 852, height: 393 }],
    ["sideways-goban.png", "goban", { width: 852, height: 393 }],
  ]) {
    const phone = await open("#13n,d10j9d5j4c2b5b8", {
      viewport,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    if (style !== "hex") {
      await phone.selectOption("#style", style);
      await phone.waitForTimeout(150);
    }
    await phone.screenshot({ path: here(name), fullPage: true });
    console.log(`  ${name}`);
    await phone.close();
  }
});
