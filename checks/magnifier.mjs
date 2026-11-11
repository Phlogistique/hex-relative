/**
 * The magnifier: a finger on the board puts it up close across the screen,
 * sliding pans, and lifting plays the cell under the finger.
 *
 * What it promises, and so what is held down here, is that the cell played is
 * the one the finger is on in the close-up, the one the caption names, and on
 * a tap that has not moved the one that was touched on the page — and that a
 * touch is only ever one move: no click let through behind it to play again.
 *
 * Touches are sent through the DevTools protocol, which is the only way to
 * have a finger slide in Playwright; its own touchscreen only taps.
 */
import { check, pad } from "./lib/browser.mjs";
import { standard } from "../mason.js";

const PHONE = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
};

async function finger(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, points) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  return {
    down: (x, y) => send("touchStart", [{ x, y, id: 1 }]),
    move: async (x, y) => {
      await send("touchMove", [{ x, y, id: 1 }]);
      await page.waitForTimeout(40); // a frame, for the view to follow
    },
    up: () => send("touchEnd", []),
    second: (x1, y1, x2, y2) =>
      send("touchStart", [
        { x: x1, y: y1, id: 1 },
        { x: x2, y: y2, id: 2 },
      ]),
  };
}

/** Where a cell of the page's board is on screen. */
const onPage = (page, col, row) =>
  page.evaluate(
    ([col, row]) => {
      const size = Number(document.querySelector("#size").value);
      const cell = document.querySelectorAll("#board .cell")[row * size + col];
      const box = cell.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    },
    [col, row],
  );

/**
 * What the close-up shows: which of its cells the finger is on, by the
 * nearest centre, how many cells the screen holds, and the caption.
 */
const closeUp = (page, x, y) =>
  page.evaluate(
    ([x, y]) => {
      const overlay = document.querySelector(".magnifier");
      if (!overlay) return null;
      const size = Number(document.querySelector("#size").value);
      let best = null;
      let hex = null;
      [...overlay.querySelectorAll(".cell")].forEach((cell, index) => {
        const box = cell.getBoundingClientRect();
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        hex ??= cell.querySelector(".hex").getBoundingClientRect();
        const d = Math.hypot(cx - x, cy - y);
        if (!best || d < best.d)
          best = {
            d,
            col: index % size,
            row: Math.floor(index / size),
            r: box.width / 2,
          };
      });
      return {
        under: best.d < best.r ? { col: best.col, row: best.row } : null,
        // How many cells the screen holds, from the size of one: a hexagon
        // covers three quarters of its bounding box.
        shown: Math.round(
          (innerWidth * innerHeight) / (0.75 * hex.width * hex.height),
        ),
        caption: overlay.querySelector(".magnifier-name").textContent,
      };
    },
    [x, y],
  );

const played = (page) =>
  page.evaluate(() => ({
    hash: location.hash,
    last:
      document.querySelector(".movelist tbody tr:last-child .standard-small")
        ?.textContent ?? null,
    overlay: Boolean(document.querySelector(".magnifier")),
  }));

const name = (c) => (c ? standard(c.col, c.row) : "nothing");

await check("The magnifier", async ({ open }) => {
  for (const [hash, style] of [
    ["#13", "hex"],
    ["#19", "goban"],
    ["#53", "hex"],
  ]) {
    const page = await open(hash, PHONE);
    await page.selectOption("#style", style);
    const size = Number(hash.slice(1));
    const touch = await finger(page);
    const label = `${size}x${size} ${style}`;

    // A tap that does not move plays what it touched.
    const aimed = { col: Math.floor(size / 2), row: Math.floor(size / 3) };
    const at = await onPage(page, aimed.col, aimed.row);
    await touch.down(at.x, at.y);
    await page.waitForTimeout(40);
    const first = await closeUp(page, at.x, at.y);
    if (!first) throw new Error(`${label}: no close-up on touching the board`);
    console.log(
      `  ${pad(label, 14)}${pad(`${first.shown} cells to a screen`, 22)}touched ${name(aimed)}, under the finger ${name(first.under)}, caption ${first.caption}`,
    );
    if (first.shown < 60 || first.shown > 160)
      throw new Error(
        `${label}: ${first.shown} cells in view, wanted about 100`,
      );
    if (name(first.under) !== name(aimed))
      throw new Error(
        `${label}: the close-up put the wrong cell under the finger`,
      );
    if (!first.caption.endsWith(name(aimed)))
      throw new Error(`${label}: the caption says ${first.caption}`);
    await touch.up();
    await page.waitForTimeout(60);
    let after = await played(page);
    if (after.overlay) throw new Error(`${label}: the close-up stayed up`);
    if (after.last !== name(aimed))
      throw new Error(`${label}: a tap played ${after.last}`);
    const once = after.hash;

    // Sliding pans, and the lift plays whatever the finger is on by then.
    await touch.down(at.x, at.y);
    let path = [];
    for (const [dx, dy] of [
      [20, 0],
      [45, 15],
      [70, 40],
      [70, 90],
    ]) {
      await touch.move(at.x + dx, at.y + dy);
      path.push(await closeUp(page, at.x + dx, at.y + dy));
    }
    const end = path.at(-1);
    await touch.up();
    await page.waitForTimeout(60);
    after = await played(page);
    console.log(
      `  ${pad("", 14)}slid over ${path.map((p) => name(p.under)).join(" ")}, played ${after.last}`,
    );
    if (new Set(path.map((p) => name(p.under))).size < 3)
      throw new Error(`${label}: sliding did not move the aim`);
    if (after.last !== name(end.under) || !end.caption.endsWith(after.last))
      throw new Error(
        `${label}: lifted on ${name(end.under)}, played ${after.last}`,
      );
    if (after.hash.length <= once.length)
      throw new Error(`${label}: the slide played nothing`);
    const twice = after.hash;

    // Off the board, nothing.
    await touch.down(at.x, at.y);
    await touch.move(at.x, at.y - 2000);
    const off = await closeUp(page, at.x, at.y - 2000);
    await touch.up();
    await page.waitForTimeout(60);
    after = await played(page);
    if (off.under || after.hash !== twice)
      throw new Error(`${label}: lifting off the board played ${after.hash}`);

    // A second finger is a change of mind.
    await touch.down(at.x, at.y);
    await touch.second(at.x, at.y, at.x + 50, at.y + 50);
    await touch.up();
    await page.waitForTimeout(60);
    after = await played(page);
    if (after.overlay || after.hash !== twice)
      throw new Error(`${label}: a second finger left ${after.hash}`);
    console.log(`  ${pad("", 14)}off the board and a second finger: nothing`);
    await page.close();
  }

  // A tap through Playwright's own touchscreen — the one with a click behind
  // it — plays one stone with the magnifier on, and one with it off.
  for (const on of [true, false]) {
    const page = await open("#13", PHONE);
    await page.setChecked("#magnify", on);
    const at = await onPage(page, 3, 3);
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(80);
    const { hash } = await played(page);
    console.log(`  tap, magnifier ${on ? "on " : "off"} -> ${hash}`);
    if (hash !== "#13,d4") throw new Error(`tap played ${hash}`);
    await page.close();
  }
});
