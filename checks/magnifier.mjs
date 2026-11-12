/**
 * The magnifier: a finger on the board puts it up close across the screen,
 * the touched cell ringed in the middle of it; sliding moves the ring as far
 * as the finger and pans the board; lifting plays the ringed cell.
 *
 * What it promises, and so what is held down here, is that the touched cell
 * opens in the middle of the screen wherever the finger came down, corners of
 * the board and edges of the screen included; that the ring then moves as far
 * as the finger does; that the cell played is the one in the ring, the one the
 * caption names, even where the edge of the screen cuts into it; that the
 * ring off the board, the ringed cell less than half on the screen, and the
 * finger at an edge of the screen all show a × and play nothing on lifting,
 * without closing anything until then, so that moving back resumes; that a
 * second finger changes nothing; and that a touch is only ever one move: no
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
      const overlay = document.querySelector(
        ".magnifier:not([data-cancelled])",
      );
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
      // How far inside the outline the point is, in pixels: the least of
      // its distances to the six sides, negative outside.
      const margin = Math.min(
        ...corners.map((a, k) => {
          const b = corners[(k + 1) % corners.length];
          const c = corners[(k + 2) % corners.length];
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          const side = (p) =>
            ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len;
          return side({ x, y }) * Math.sign(side(c));
        }),
      );
      const inside = margin >= 0;
      const whole = corners.every(
        (p) => p.x >= 0 && p.y >= 0 && p.x <= innerWidth && p.y <= innerHeight,
      );
      // How much of its area is on the screen: sampled on a fine grid over
      // its box, which is a different way of asking from the page's own, so
      // that the two can be held against each other.
      const xs = corners.map((p) => p.x);
      const ys = corners.map((p) => p.y);
      const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
      const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
      const within = (p) =>
        corners.every((a, k) => {
          const b = corners[(k + 1) % corners.length];
          const c = corners[(k + 2) % corners.length];
          const side = (q) =>
            (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
          return side(p) * side(c) >= 0;
        });
      let all = 0;
      let seen = 0;
      const N = 60;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const p = {
            x: x0 + ((i + 0.5) * (x1 - x0)) / N,
            y: y0 + ((j + 0.5) * (y1 - y0)) / N,
          };
          if (!within(p)) continue;
          all++;
          if (p.x >= 0 && p.y >= 0 && p.x <= innerWidth && p.y <= innerHeight)
            seen++;
        }
      }
      const onScreen = seen / all;
      best = {
        col: best.index % size,
        row: Math.floor(best.index / size),
        inside,
        whole,
        onScreen,
        margin,
      };
      return {
        under: best.inside ? { col: best.col, row: best.row } : null,
        whole: best.whole,
        onScreen: best.onScreen,
        // Within a pixel or two of a side, the page and this check can each
        // round the aim into a different one of the two cells either side.
        clear: Math.abs(best.margin) > 2,
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
    overlay: Boolean(
      document.querySelector(".magnifier:not([data-cancelled])"),
    ),
  }));

const name = (c) => (c ? standard(c.col, c.row) : "nothing");

/**
 * A lift on a × plays nothing, and is seen to: the close-up stays up a moment
 * with the × still in it, fading, and then goes. Asked right after the lift.
 */
async function liftsOnX(label, page, what) {
  const shown = await page.evaluate(() => {
    const overlay = document.querySelector(".magnifier[data-cancelled]");
    return (
      overlay && {
        caption: overlay.querySelector(".magnifier-name").textContent,
        ring:
          overlay.querySelector(".magnifier-aim").getAttribute("display") !==
          "none",
      }
    );
  });
  if (!shown || shown.caption !== "×" || shown.ring)
    throw new Error(
      `${label}: lifted ${what} without a × to say so (${JSON.stringify(shown)})`,
    );
  await page.waitForTimeout(450);
  if (await page.$(".magnifier"))
    throw new Error(`${label}: lifted ${what}: the close-up is still there`);
}

// The page's margins along each edge for a finger on its way off the screen.
const EDGE = { left: 32, right: 32, top: 12, bottom: 12 };
const NEARER = 8;

/** Whether a finger at `to`, come down at `from`, is on its way off. */
function leaving(from, to, width, height) {
  const gaps = (p) => ({
    left: p.x,
    right: width - p.x,
    top: p.y,
    bottom: height - p.y,
  });
  const start = gaps(from);
  const now = gaps(to);
  return Object.keys(EDGE).some(
    (side) => now[side] < Math.min(EDGE[side], start[side] - NEARER),
  );
}

/**
 * The one rule about what lifting would do: a cell is offered — named,
 * ringed — exactly when the aim is on a cell of the board, that cell is at
 * least half on the screen, and the finger is not on its way off the screen.
 * Anything else is a ×. And where a cell is offered, the ring is round the aim.
 */
function holds(label, state, want, out) {
  // The ring goes round the whole cell, so it is the cell's centre that it
  // stands on: the aim has to be inside it, not at its middle.
  const off = Math.hypot(state.ring.x - want.x, state.ring.y - want.y);
  if (state.aiming && off > state.ring.r)
    throw new Error(
      `${label}: the ring is ${Math.round(off)}px from the aim, which is outside it`,
    );
  const says = state.caption !== "×";
  if (says !== state.aiming)
    throw new Error(
      `${label}: caption ${state.caption}, ring ${state.aiming ? "shown" : "hidden"}`,
    );
  // Too near a side to say which cell the aim is in, or too near half on the
  // screen to say which side of the line it is, the rest is moot.
  if (!state.clear) return;
  if (says && !state.caption.endsWith(name(state.under)))
    throw new Error(
      `${label}: the aim is on ${name(state.under)}, the caption says ${state.caption}`,
    );
  if (state.under && Math.abs(state.onScreen - 0.5) < 0.04) return;
  const offered = Boolean(state.under) && state.onScreen > 0.5 && !out;
  if (offered !== says)
    throw new Error(
      `${label}: on ${name(state.under)}, ${Math.round((state.onScreen ?? 0) * 100)}% on the screen, ` +
        `the finger ${out ? "on its way off" : "inside"}: caption ${state.caption}`,
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
      holds(label, state, want, leaving(from, to, width, height));
      return state;
    };
    const lift = async () => {
      await touch.up();
      await page.waitForTimeout(60);
      return played(page);
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
    if (!after.last || !end.caption.endsWith(after.last))
      throw new Error(
        `${label}: lifted on ${name(end.under)}, played ${after.last}`,
      );
    if (after.hash.length <= once.length)
      throw new Error(`${label}: the slide played nothing`);
    const twice = after.hash;

    // Somewhere to start that leaves the ring room to reach the right edge
    // with the board still under it: a cell a fifth of the way across the
    // board as the page draws it, half way down.
    const start = await page.evaluate(() => {
      const box = document.querySelector("#board svg").getBoundingClientRect();
      const x = box.left + box.width * 0.2;
      const y = box.top + box.height / 2;
      const hit = document.elementFromPoint(x, y)?.closest(".cell");
      return hit && { x, y };
    });
    if (!start) throw new Error(`${label}: no cell to start from`);

    // The ring slid towards the right edge, the finger staying well inside
    // the screen: a cell the edge cuts a little of is still in play, and one
    // less than half on the screen is a ×, with the close-up still up. Back a
    // little, and the ring is back; lift there and it plays.
    const sweep = async () => {
      await touch.down(start.x, start.y);
      const seen = { cut: null, x: null };
      for (let d = 0; d < width; d += 4) {
        const to = { x: start.x + d, y: start.y };
        if (to.x > width - 40) break; // short of the finger's own margin
        await touch.move(to.x, to.y);
        const state = await look(start, to);
        if (
          state.under &&
          state.clear &&
          state.onScreen < 0.9 &&
          state.caption !== "×"
        )
          seen.cut = state;
        if (seen.cut && state.caption === "×") {
          seen.x = { state, to };
          break;
        }
      }
      return seen;
    };
    let seen = await sweep();
    if (!seen.cut)
      throw new Error(`${label}: never saw a cell the edge cuts still in play`);
    if (!seen.x)
      throw new Error(`${label}: the ring went off the screen without a ×`);
    if (!(await page.$(".magnifier:not([data-cancelled])")))
      throw new Error(`${label}: the × closed the close-up`);
    const back = { x: seen.x.to.x - 40, y: start.y };
    await touch.move(back.x, back.y);
    const resumed = await look(start, back);
    after = await lift();
    if (resumed.caption === "×")
      throw new Error(`${label}: moving back did not bring the ring back`);
    if (
      !after.last ||
      !resumed.caption.endsWith(after.last) ||
      after.hash === twice
    )
      throw new Error(
        `${label}: lifted on ${resumed.caption}, played ${after.last}`,
      );
    console.log(
      `  ${pad("", 14)}${name(seen.cut.under)} ${Math.round(seen.cut.onScreen * 100)}% on the screen in play; ` +
        `× once it was less than half on the screen, the close-up still up; back, and ${after.last} played`,
    );
    let base = after.hash;

    // Lifted on that ×: nothing.
    seen = await sweep();
    after = await lift();
    await liftsOnX(label, page, "with the ringed cell off the screen");
    if (after.hash !== base)
      throw new Error(`${label}: lifting on the × played ${after.hash}`);

    // The finger run to any edge of the screen: a ×, the close-up still up;
    // back, and the ring is back; to the edge again and lift: nothing.
    const middle = { x: width / 2, y: height / 2 };
    for (const [edge, end] of [
      // The sides well short of the glass's edge, which a finger slid off
      // the side of a phone is last reported at.
      ["left", { x: 25, y: start.y }],
      ["right", { x: width - 25, y: start.y }],
      ["top", { x: start.x, y: 3 }],
      ["bottom", { x: start.x, y: height - 3 }],
    ]) {
      await touch.down(start.x, start.y);
      await touch.move(end.x, end.y);
      const there = await look(start, end);
      const up = Boolean(await page.$(".magnifier:not([data-cancelled])"));
      if (there.caption !== "×" || !up)
        throw new Error(
          `${label}: the finger at the ${edge} edge: caption ${there.caption}, close-up ${up ? "up" : "gone"}`,
        );
      // Back to the middle of where it can go: the ring is back over the
      // board. Except where the edge is near the start, in which case half
      // way back is enough.
      const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      await touch.move(mid.x, mid.y);
      const again = await look(start, mid);
      if (again.caption === "×" && again.under && again.onScreen > 0.6)
        throw new Error(`${label}: back from the ${edge} edge, still a ×`);
      await touch.move(end.x, end.y);
      after = await lift();
      await liftsOnX(label, page, `at the ${edge} edge`);
      if (after.hash !== base)
        throw new Error(
          `${label}: lifting at the ${edge} edge played ${after.hash}`,
        );
    }
    void middle;
    console.log(
      `  ${pad("", 14)}the finger at any edge: ×, the close-up still up, back resumes, lifting plays nothing`,
    );

    // The ring off the board, on the screen: nothing on lifting. From a
    // corner, slid outwards until the board is left behind — outwards along
    // the diagonal, straight up or down, or straight across, whichever leaves
    // the board before the finger comes too near the edge of the screen.
    {
      const centre = await onPage(
        page,
        Math.floor(size / 2),
        Math.floor(size / 2),
      );
      let found = null;
      search: for (const corner of [
        { col: 0, row: 0 },
        { col: size - 1, row: 0 },
        { col: 0, row: size - 1 },
        { col: size - 1, row: size - 1 },
      ]) {
        const p = await onPage(page, corner.col, corner.row);
        const dx = p.x - centre.x;
        const dy = p.y - centre.y;
        const len = Math.hypot(dx, dy);
        for (const [ux, uy] of [
          [dx / len, dy / len],
          [0, Math.sign(dy)],
          [Math.sign(dx), 0],
        ]) {
          await touch.down(p.x, p.y);
          let state = null;
          let f = p;
          for (let step = 3; step < 200; step += 3) {
            f = { x: p.x + ux * step, y: p.y + uy * step };
            await touch.move(f.x, f.y);
            state = await look(p, f);
            if (!state.under || leaving(p, f, width, height)) break;
          }
          const off = state && !state.under && !leaving(p, f, width, height);
          // Not that way: lift on a × at the edge rather than on a cell.
          if (!off) await touch.move(1, p.y);
          after = await lift();
          await liftsOnX(label, page, "off the board");
          if (after.hash !== base)
            throw new Error(
              `${label}: lifting off the board played ${after.hash}`,
            );
          if (off) {
            found = name(corner);
            break search;
          }
        }
      }
      if (!found) throw new Error(`${label}: never saw the ring off the board`);
      console.log(`  ${pad("", 14)}off the board from ${found}: ×, nothing`);
    }

    // A second finger changes nothing: the close-up stays, and the lift
    // plays the ringed cell.
    await touch.down(start.x, start.y);
    const before = await look(start, start);
    await touch.second(start.x, start.y, start.x + 50, start.y + 50);
    await page.waitForTimeout(40);
    const still = Boolean(await page.$(".magnifier:not([data-cancelled])"));
    after = await lift();
    if (!still)
      throw new Error(`${label}: a second finger closed the close-up`);
    if (
      before.caption !== "×" &&
      after.last &&
      !before.caption.endsWith(after.last)
    )
      throw new Error(`${label}: with a second finger, played ${after.last}`);
    console.log(
      `  ${pad("", 14)}a second finger: nothing changes, ${after.hash !== base ? after.last : "nothing"} played`,
    );

    // Every corner of the board opens in the middle of the screen however
    // near the screen's edge it is, and a tap plays it — on 53x53 one is close
    // enough that the finger comes down against the edge, which is not
    // leaving by it.
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
    // A corner inside the sides' margin: the finger came down there, so a
    // little nearer the edge is still a cell, and a little more is a ×.
    const inside = [];
    for (const corner of [
      { col: 0, row: 0 },
      { col: size - 1, row: 0 },
      { col: 0, row: size - 1 },
      { col: size - 1, row: size - 1 },
    ]) {
      const p = await onPage(page, corner.col, corner.row);
      const side = p.x < width / 2 ? -1 : 1;
      const gap = side < 0 ? p.x : width - p.x;
      if (gap >= 32 || gap < 14) continue;
      await touch.down(p.x, p.y);
      const nearer = (d) => ({ x: p.x + side * d, y: p.y });
      await touch.move(nearer(4).x, p.y);
      const stays = (await look(p, nearer(4))).caption !== "×";
      await touch.move(nearer(12).x, p.y);
      const goes = (await look(p, nearer(12))).caption === "×";
      const before = (await played(page)).hash;
      after = await lift();
      if (goes) await liftsOnX(label, page, "from the margin");
      if (!stays || !goes || after.hash !== before)
        throw new Error(
          `${label}: ${name(corner)}, ${Math.round(gap)}px from the edge: ` +
            `4px nearer ${stays ? "in play" : "×"}, 12px nearer ${goes ? "×" : "in play"}`,
        );
      inside.push(`${name(corner)} (${Math.round(gap)}px)`);
    }
    if (inside.length)
      console.log(
        `  ${pad("", 14)}came down in the margin at ${inside.join(", ")}: 4px nearer in play, 12px nearer ×`,
      );
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
