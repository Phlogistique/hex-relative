/**
 * The board close up, for a finger.
 *
 * A finger is wider than a cell on any board worth playing on a phone, so a
 * tap lands on whatever is under the middle of it, which is not always what
 * was aimed at. With the magnifier on, touching the board puts it up across
 * the whole screen, about a hundred cells of it, the cell that was touched in
 * the middle and ringed. Sliding moves the ring as far as the finger moves and
 * pans the board under it, and lifting plays the ringed cell and puts the page
 * back.
 *
 * Every edge of the screen is a way out: the finger run to one, or the ringed
 * cell run wholly off one, puts the page back there and then and plays
 * nothing. A cell the edge only cuts into is still in play. Lifting with the
 * ring off the board, on the screen, plays nothing too.
 *
 * The ring starts in the middle of the screen whichever part of the screen
 * the finger came down on, and not under the finger: a finger near the edge
 * of the screen would leave it no room on that side, and the cells near the
 * edge of the board are exactly the ones most often aimed at from there.
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
// How near the edge of the screen, in pixels, the finger is taken to have run
// off it: as near as a finger's reported centre reliably gets.
const EDGE = 12;
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
    this.gone = null; // a finger that has left by an edge, until it lifts
    this.frame = 0;
    // On the window, so that a second finger is seen wherever it lands — on
    // the close-up, usually, which covers the board.
    addEventListener("touchstart", (e) => this.start(e), { passive: false });
    addEventListener("touchmove", (e) => this.move(e), { passive: false });
    addEventListener("touchend", (e) => this.end(e, true));
    addEventListener("touchcancel", (e) => this.end(e, false));
  }

  start(event) {
    if (event.touches.length > 1) {
      // A second finger: take it as a change of mind.
      if (this.touch || this.gone !== null) {
        this.leave();
        event.preventDefault();
      }
      return;
    }
    // The only finger on the screen, so anything still held about an earlier
    // one is stale: its lift went astray.
    this.close();
    this.gone = null;
    // The board's container rather than the drawing, which is redrawn.
    if (!this.enabled() || !this.board.container.contains(event.target)) return;
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

    // The touched cell, which starts in the middle of the screen.
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
      finger: { x: finger.clientX, y: finger.clientY },
      // A finger that came down against an edge has not run off it, so an
      // edge only counts once the finger has been away from all of them.
      armed: !this.atEdge(finger.clientX, finger.clientY, screen),
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

  /** Whether a finger is near enough an edge of the screen to have left it. */
  atEdge(x, y, screen) {
    return (
      x - screen.left < EDGE ||
      y - screen.top < EDGE ||
      screen.right - x < EDGE ||
      screen.bottom - y < EDGE
    );
  }

  /** Whether an event is about a finger that has already left by an edge. */
  after(event) {
    for (const t of event.changedTouches) {
      if (t.identifier === this.gone) return true;
    }
    return false;
  }

  move(event) {
    if (this.after(event)) event.preventDefault();
    const finger = this.ours(event);
    if (!finger) return;
    event.preventDefault();
    this.touch.finger = { x: finger.clientX, y: finger.clientY };
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.update());
  }

  end(event, lifted) {
    if (this.after(event)) {
      event.preventDefault();
      this.gone = null;
      return;
    }
    const finger = this.ours(event);
    if (!finger) return;
    event.preventDefault();
    this.touch.finger = { x: finger.clientX, y: finger.clientY };
    this.update();
    if (!this.touch) {
      this.gone = null; // it left by an edge on the way, and has now lifted
      return;
    }
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
   * Put the page back and play nothing, and pay no more attention to this
   * finger until it lifts — except to keep it from scrolling the page or
   * clicking what it lifts over.
   */
  leave() {
    this.gone = this.touch?.id ?? this.gone;
    this.close();
  }

  /**
   * Where the aim is: the cell the finger came down on, moved on by however
   * far it has slid since, held to the board and a little beyond.
   */
  target() {
    const t = this.touch;
    const board = this.board;
    const point = {
      x: t.at.x + (t.finger.x - t.from.x) / t.gain,
      y: t.at.y + (t.finger.y - t.from.y) / t.gain,
    };
    const { col, row } = board.locate(point);
    const hold = (v) =>
      Math.max(-OVERRUN, Math.min(board.size - 1 + OVERRUN, v));
    return board.turn(center(hold(col), hold(row)));
  }

  /**
   * Where the ring is on the screen: the middle, moved as far as the finger
   * has moved. In the overlay's own coordinates.
   */
  sighted() {
    const t = this.touch;
    return {
      x: t.screen.width / 2 + t.finger.x - t.from.x,
      y: t.screen.height / 2 + t.finger.y - t.from.y,
    };
  }

  /** Put the aim under the ring, and the board around it. */
  update() {
    const t = this.touch;
    if (!t) return;
    const board = this.board;
    if (this.atEdge(t.finger.x, t.finger.y, t.screen)) {
      if (t.armed) {
        this.leave();
        return;
      }
    } else {
      t.armed = true;
    }
    const point = this.target();
    const ring = this.sighted();
    const x = ring.x - (point.x - t.origin.x) * t.zoom;
    const y = ring.y - (point.y - t.origin.y) * t.zoom;
    t.copy.style.transform = `translate(${x}px, ${y}px)`;

    // The ringed cell run wholly off the screen is the other way out; one the
    // edge only cuts into is still in play.
    const found = board.cellAt(point);
    const centre = board.at(found.col, found.row);
    const corners = board.vertices().map(([vx, vy]) => ({
      x: x + (centre.x + vx - t.origin.x) * t.zoom,
      y: y + (centre.y + vy - t.origin.y) * t.zoom,
    }));
    if (
      corners.every((c) => c.x < 0) ||
      corners.every((c) => c.y < 0) ||
      corners.every((c) => c.x > t.screen.width) ||
      corners.every((c) => c.y > t.screen.height)
    ) {
      this.leave();
      return;
    }
    const on =
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
    // Out of the ring's way: at the top, unless that is where the ring is.
    t.overlay.toggleAttribute("data-low", ring.y < t.screen.height / 3);
  }
}
