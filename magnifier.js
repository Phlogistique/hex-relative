/**
 * The board close up, for a finger.
 *
 * A finger is wider than a cell on any board worth playing on a phone, so a
 * tap lands on whatever is under the middle of it, which is not always what
 * was aimed at. With the magnifier on, touching the board puts it up across
 * the whole screen, about a hundred cells of it, the cell that was touched
 * under the finger. Sliding pans across it, and lifting plays the cell the
 * finger is on and puts the page back. Lifting with the finger off the board,
 * or on a cell the edge of the screen cuts into, plays nothing, which is the
 * way out of a touch that was not meant.
 *
 * The close-up is a copy of the drawing, so it is the board exactly as it
 * stands — style, labels, numbers, which way round — and moving over it is a
 * transform on that copy and nothing else. The real board keeps the touch:
 * events stay with the element a touch started on, so the copy takes none.
 *
 * Mouse and pen are left alone. This is only for touch.
 */

import { center } from "./board.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// About this many cells on screen at once: ten by ten.
const CELLS_IN_VIEW = 100;
// A hexagon of circumradius 1 covers this much of the drawing.
const CELL_AREA = (3 * Math.sqrt(3)) / 2;
// Never less close up than this against the board as the page draws it, which
// on a small board would otherwise be no closer at all.
const MIN_ZOOM = 1.6;
// How far the aim may run past the board, in cells, before it stops: far
// enough to leave the board and cancel, near enough to come straight back.
const OVERRUN = 1.5;

export class Magnifier {
  /**
   * `enabled()` says whether to act on a touch at all. `aim(cell)` says what
   * lifting there would do — a colour, "erase", or null for nothing — and
   * `name(cell)` what to call it. `play(cell, event)` is the lift.
   */
  constructor(board, { enabled, aim, name, play }) {
    this.board = board;
    this.enabled = enabled;
    this.aim = aim;
    this.name = name;
    this.play = play;
    this.touch = null;
    this.frame = 0;
    // On the board's container, which outlives every redraw of the board.
    board.container.addEventListener("touchstart", (e) => this.start(e), {
      passive: false,
    });
    addEventListener("touchmove", (e) => this.move(e), { passive: false });
    addEventListener("touchend", (e) => this.end(e, true));
    addEventListener("touchcancel", (e) => this.end(e, false));
  }

  start(event) {
    if (this.touch) {
      // A second finger: take it as a change of mind.
      this.close();
      event.preventDefault();
      return;
    }
    if (!this.enabled() || event.touches.length > 1) return;
    const svg = this.board.svg;
    if (!svg) return;
    // No scrolling, and no click once the finger lifts: the lift is ours.
    event.preventDefault();
    const finger = event.changedTouches[0];
    const toDrawing = svg.getScreenCTM().inverse();
    const at = new DOMPoint(finger.clientX, finger.clientY).matrixTransform(
      toDrawing,
    );

    const overlay = document.createElement("div");
    overlay.className = "magnifier";
    document.body.appendChild(overlay);
    const screen = overlay.getBoundingClientRect();

    // Pixels per unit of the drawing: on the page, and close up.
    const page = svg.getScreenCTM().a;
    const zoom = Math.max(
      Math.sqrt((screen.width * screen.height) / (CELLS_IN_VIEW * CELL_AREA)),
      page * MIN_ZOOM,
    );
    // How far the aim moves for a pixel of finger. At the page's own scale the
    // aim would keep pace with the board as the page draws it; on the larger
    // boards that is a cell for every few pixels and no aim at all, so it is
    // held to at least half the close-up's, a cell for every cell and a half.
    // Either way it outruns the finger, which is what makes the view pan.
    const gain = Math.max(page, zoom / 2);

    // The touched cell starts centred under the finger, so a tap plays it.
    // Where the finger came down near the screen's edge that cell is cut off
    // by the edge, which is a cell lifting will not play, so it stays the aim
    // while the finger is nudged inwards and the view pans it fully on; the
    // aim follows the finger from there.
    const touched = this.board.cellAt(at);

    const view = svg.viewBox.baseVal;
    const copy = svg.cloneNode(true);
    copy.removeAttribute("role");
    copy.setAttribute("aria-hidden", "true");
    copy.style.cssText = `width:${view.width * zoom}px;height:${
      view.height * zoom
    }px;max-height:none`;
    overlay.appendChild(copy);

    const sight = document.createElementNS(SVG_NS, "g");
    sight.setAttribute("class", "magnifier-aim");
    const ghost = document.createElementNS(SVG_NS, "circle");
    ghost.setAttribute("r", svg.querySelector(".stone")?.getAttribute("r"));
    const ring = document.createElementNS(SVG_NS, "polygon");
    ring.setAttribute(
      "points",
      this.board
        .vertices()
        .map(([x, y]) => `${x * 1.06},${y * 1.06}`)
        .join(" "),
    );
    sight.append(ghost, ring);
    copy.appendChild(sight);

    const caption = document.createElement("p");
    caption.className = "magnifier-name";
    overlay.appendChild(caption);

    this.touch = {
      id: finger.identifier,
      from: { x: finger.clientX, y: finger.clientY },
      settling: true,
      finger: { x: finger.clientX, y: finger.clientY },
      at: this.board.at(touched.col, touched.row),
      origin: { x: view.x, y: view.y },
      screen,
      zoom,
      gain,
      overlay,
      copy,
      sight,
      ghost,
      ring,
      caption,
      cell: null,
    };
    this.update();
  }

  /** The finger this is following, among a touch event's changed ones. */
  ours(event) {
    if (!this.touch) return null;
    for (const t of event.changedTouches) {
      if (t.identifier === this.touch.id) return t;
    }
    return null;
  }

  move(event) {
    const finger = this.ours(event);
    if (!finger) return;
    event.preventDefault();
    this.touch.finger = { x: finger.clientX, y: finger.clientY };
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.update());
  }

  end(event, lifted) {
    const finger = this.ours(event);
    if (!finger) return;
    event.preventDefault();
    this.touch.finger = { x: finger.clientX, y: finger.clientY };
    this.update();
    const { cell } = this.touch;
    this.close();
    if (lifted && cell) this.play(cell, event);
  }

  close() {
    cancelAnimationFrame(this.frame);
    this.touch?.overlay.remove();
    this.touch = null;
  }

  /**
   * Where the aim is: the cell the finger came down on, moved on by however
   * far it has slid since that cell was wholly on the screen, held to the
   * board and a little beyond.
   */
  target() {
    const t = this.touch;
    const board = this.board;
    if (t.settling) return t.at;
    const point = {
      x: t.at.x + (t.finger.x - t.from.x) / t.gain,
      y: t.at.y + (t.finger.y - t.from.y) / t.gain,
    };
    const { col, row } = board.locate(point);
    const hold = (v) =>
      Math.max(-OVERRUN, Math.min(board.size - 1 + OVERRUN, v));
    return board.turn(center(hold(col), hold(row)));
  }

  /** Put the aim under the finger, and the board around it. */
  update() {
    const t = this.touch;
    if (!t) return;
    const board = this.board;
    const point = this.target();
    const x = t.finger.x - t.screen.left - (point.x - t.origin.x) * t.zoom;
    const y = t.finger.y - t.screen.top - (point.y - t.origin.y) * t.zoom;
    t.copy.style.transform = `translate(${x}px, ${y}px)`;

    // A cell counts only while it is on the board and wholly on the screen:
    // one the screen cuts into is one the finger has run off the edge for,
    // and lifting there plays nothing.
    const found = board.cellAt(point);
    const centre = board.at(found.col, found.row);
    const whole = board.vertices().every(([vx, vy]) => {
      const sx = x + (centre.x + vx - t.origin.x) * t.zoom;
      const sy = y + (centre.y + vy - t.origin.y) * t.zoom;
      return (
        sx >= 0 && sy >= 0 && sx <= t.screen.width && sy <= t.screen.height
      );
    });
    if (t.settling && whole) {
      t.settling = false;
      t.from = { ...t.finger };
    }
    const on =
      whole &&
      found.col >= 0 &&
      found.row >= 0 &&
      found.col < board.size &&
      found.row < board.size;
    t.cell = on ? found : null;
    t.overlay.toggleAttribute("data-off", !on);
    t.sight.setAttribute("display", on ? "inline" : "none");
    if (on) {
      t.sight.setAttribute("transform", `translate(${centre.x} ${centre.y})`);
      const what = this.aim(found);
      const stone = what === "red" || what === "blue";
      t.ghost.setAttribute("class", `stone stone-${what} magnifier-ghost`);
      t.ghost.setAttribute("visibility", stone ? "visible" : "hidden");
      t.ring.setAttribute(
        "class",
        `magnifier-ring${what === "erase" ? " magnifier-erase" : ""}`,
      );
      t.caption.textContent = this.name(found);
    } else {
      t.caption.textContent = "×";
    }
    // Out of the finger's way: at the top, unless that is where the finger is.
    t.overlay.toggleAttribute(
      "data-low",
      t.finger.y - t.screen.top < t.screen.height / 3,
    );
  }
}
