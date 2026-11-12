/**
 * The magnifier: a finger on the board puts it up close across the screen,
 * the touched cell ringed in the middle of it; sliding moves the ring as far
 * as the finger and pans the board; lifting plays the ringed cell.
 *
 * What it promises, and so what is held down here, is that the touched cell
 * opens in the middle of the screen wherever the finger came down, corners of
 * the board and edges of the screen included; that the ring then moves as far
 * as the finger does; that the cell played is the one in the ring, the one the
 * caption names; that a ring off the board, or on a cell the edge of the
 * screen cuts into, is a cancel; and that a touch is only ever one move: no
 * click let through behind it to play again.
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
      await page.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          ),
      ); // the view follows on the next frame
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
 * What the close-up shows: which of its cells the finger is inside, whether
 * all of that cell is on the screen, how many cells the screen holds, and the
 * caption.
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
        hex ??= cell.querySelector(".hex").getBoundingClientRect();
        const d = Math.hypot(
          box.x + box.width / 2 - x,
          box.y + box.height / 2 - y,
        );
        if (!best || d < best.d) best = { d, cell, index };
      });
      // The hexagon itself, on screen: whether the finger is inside its
      // outline, and whether every corner of it is on the screen. Near the
      // edge of the board the nearest cell on it may not be the one under the
      // finger, which may be off the board.
      const polygon = best.cell.querySelector(".hex");
      const matrix = polygon.getScreenCTM();
      const corners = [...polygon.points].map((p) => p.matrixTransform(matrix));
      const inside = corners.every((a, k) => {
        const b = corners[(k + 1) % corners.length];
        const c = corners[(k + 2) % corners.length];
        const side = (p) =>
          (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        return side({ x, y }) * side(c) >= 0;
      });
      const whole = corners.every(
        (p) => p.x >= 0 && p.y >= 0 && p.x <= innerWidth && p.y <= innerHeight,
      );
      best = {
        col: best.index % size,
        row: Math.floor(best.index / size),
        inside,
        whole,
      };
      return {
        under: best.inside ? { col: best.col, row: best.row } : null,
        whole: best.whole,
        aiming:
          overlay.querySelector(".magnifier-aim").getAttribute("display") !==
          "none",
        ring: (() => {
          const box = overlay.querySelector(".magnifier-ring");
          const b = box.getBoundingClientRect();
          return {
            x: b.x + b.width / 2,
            y: b.y + b.height / 2,
            // to its corners, which is as far as a point inside it can be
            r: Math.max(b.width, b.height) / 2,
          };
        })(),
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

/**
 * The one rule about what lifting would do: a cell is offered, named and
 * ringed, exactly when the aim is on one that is on the board and wholly on
 * the screen. Anything the screen cuts into is a cancel. And where it is
 * offered, the ring is round the aim.
 */
function holds(label, state, want) {
  // The ring goes round the whole cell, so it is the cell's centre that it
  // stands on: the aim has to be inside it, not at its middle.
  const off = Math.hypot(state.ring.x - want.x, state.ring.y - want.y);
  if (state.aiming && off > state.ring.r)
    throw new Error(
      `${label}: the ring is ${Math.round(off)}px from the aim, which is outside it`,
    );
  const offered = Boolean(state.under && state.whole);
  const says = state.caption !== "×";
  if (offered !== says || offered !== state.aiming)
    throw new Error(
      `${label}: on ${name(state.under)}, ${state.whole ? "whole" : "cut"}, ` +
        `caption ${state.caption}, ring ${state.aiming ? "shown" : "hidden"}`,
    );
}

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
    const { width, height } = page.viewportSize();
    // Where the ring should be: the middle of the screen, moved as far as the
    // finger has moved since it came down.
    const ringFor = (from, to) => ({
      x: width / 2 + to.x - from.x,
      y: height / 2 + to.y - from.y,
    });
    const look = async (from, to) => {
      const want = ringFor(from, to);
      const state = await closeUp(page, want.x, want.y);
      if (!state) throw new Error(`${label}: no close-up`);
      holds(label, state, want);
      return state;
    };

    // A tap that does not move plays what it touched, which opened in the
    // middle of the screen.
    const aimed = { col: Math.floor(size / 2), row: Math.floor(size / 3) };
    const at = await onPage(page, aimed.col, aimed.row);
    await touch.down(at.x, at.y);
    await page.waitForTimeout(40);
    const first = await look(at, at);
    console.log(
      `  ${pad(label, 14)}${pad(`${first.shown} cells to a screen`, 22)}touched ${name(aimed)}, in the middle ${name(first.under)}, caption ${first.caption}`,
    );
    if (first.shown < 60 || first.shown > 160)
      throw new Error(
        `${label}: ${first.shown} cells in view, wanted about 100`,
      );
    if (
      name(first.under) !== name(aimed) ||
      !first.caption.endsWith(name(aimed))
    )
      throw new Error(
        `${label}: opened on ${name(first.under)}, ${first.caption}`,
      );
    await touch.up();
    await page.waitForTimeout(60);
    let after = await played(page);
    if (after.overlay) throw new Error(`${label}: the close-up stayed up`);
    if (after.last !== name(aimed))
      throw new Error(`${label}: a tap played ${after.last}`);
    const once = after.hash;

    // Sliding moves the ring and pans the board, and the lift plays whatever
    // the ring is on by then.
    await touch.down(at.x, at.y);
    const path = [];
    for (const [dx, dy] of [
      [20, 0],
      [45, 15],
      [70, 40],
      [70, 90],
    ]) {
      const to = { x: at.x + dx, y: at.y + dy };
      await touch.move(to.x, to.y);
      path.push(await look(at, to));
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

    // The ring run off the board, or off any edge of the screen: nothing.
    for (const [dx, dy, where] of [
      [0, -2000, "off the board"],
      [-(width / 2 - 4), 0, "to the left edge"],
      [width / 2 - 4, 0, "to the right edge"],
      [0, -(height / 2 - 4), "to the top"],
      [0, height / 2 - 4, "to the bottom"],
    ]) {
      // From the middle of the screen, so that the finger can go that far.
      const from = { x: width / 2, y: height / 2 };
      const cell = await page.evaluate(
        ({ x, y }) =>
          Boolean(document.elementFromPoint(x, y)?.closest(".cell")),
        from,
      );
      if (!cell) throw new Error(`${label}: no cell in the middle of the page`);
      const to = { x: from.x + dx, y: from.y + dy };
      await touch.down(from.x, from.y);
      await touch.move(to.x, to.y);
      const state = await look(from, to);
      await touch.up();
      await page.waitForTimeout(60);
      after = await played(page);
      if (state.caption !== "×" || after.hash !== twice)
        throw new Error(`${label}: lifting ${where} played ${after.hash}`);
    }
    console.log(
      `  ${pad("", 14)}off the board, or to any edge of the screen: nothing`,
    );

    // A second finger is a change of mind.
    await touch.down(at.x, at.y);
    await touch.second(at.x, at.y, at.x + 50, at.y + 50);
    await touch.up();
    await page.waitForTimeout(60);
    after = await played(page);
    if (after.overlay || after.hash !== twice)
      throw new Error(`${label}: a second finger left ${after.hash}`);
    console.log(`  ${pad("", 14)}a second finger: nothing`);

    // Every corner of the board opens in the middle of the screen however
    // near the screen's edge it is, and a tap plays it.
    const corners = [];
    for (const corner of [
      { col: 0, row: 0 },
      { col: size - 1, row: 0 },
      { col: 0, row: size - 1 },
      { col: size - 1, row: size - 1 },
    ]) {
      const p = await onPage(page, corner.col, corner.row);
      await touch.down(p.x, p.y);
      await page.waitForTimeout(40);
      const state = await look(p, p);
      const before = (await played(page)).hash;
      await touch.up();
      await page.waitForTimeout(60);
      after = await played(page);
      const edge = Math.round(Math.min(p.x, p.y, width - p.x, height - p.y));
      corners.push(`${name(corner)} (${edge}px from the edge)`);
      if (name(state.under) !== name(corner))
        throw new Error(
          `${label}: ${name(corner)} opened on ${name(state.under)}`,
        );
      if (after.last !== name(corner) || after.hash === before)
        throw new Error(
          `${label}: tapped ${name(corner)}, played ${after.last}`,
        );
    }
    console.log(`  ${pad("", 14)}corners: ${corners.join(", ")}`);
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
