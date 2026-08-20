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

  const phone = await open("#13n,d10j9d5j4c2b5b8", {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await phone.screenshot({ path: here("phone.png"), fullPage: true });
  console.log("  phone.png");
});
