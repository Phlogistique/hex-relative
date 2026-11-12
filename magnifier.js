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
 * Lifting plays nothing — and the caption says × beforehand, the ring gone —
 * wherever there is no cell to play: the ring off the board, the ringed cell
 * more than half off the screen, or the finger run to an edge of the screen.
 * None of them closes anything by itself: move back and the ring is back, and
 * one rule covers them all, that a × means lifting there plays nothing. A
 * cell the edge only cuts a little of is still in play.
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
// How near each edge of the screen, in pixels, the finger is taken to be on its
// way off it. A finger slid off the side of a phone is last reported well short of
// the glass's edge — the centre of its contact never gets there, and a quick
// swipe is last sampled further in still — so the sides take a wide margin.
// The top and bottom are left narrow.
const EDGE = { left: 32, right: 32, top: 12, bottom: 12 };
// A finger that comes down inside one of those margins is pressing a cell
// near that edge, not leaving by it: that edge gives no × until the finger has
// been out of its margin and come back. And it moves nothing, towards that
// edge or away from it, until it is this many pixels clear of the margin, so
// that a press that wobbles, or eases off the edge, keeps the cell it pressed.
const DEAD = 16;
// How far past the outermost cells, in pixels on the page, a press still
// counts as one on the board: about the coloured edge and the first line of
// labels. Further out the drawing's corners are empty, and a touch there is
// the page's — to scroll with, say.
const REACH = 20;
// How much further out than the finger a press near an edge of the board
// counts as, in pixels on the page, at the outermost cells.
const OUTWARD = 20;
// How long a close-up lifted on a × takes to go, in milliseconds, and the
// stylesheet's fade is timed to end within it.
const FADE = 400;
// How much of the ringed cell's area has to stay on the screen for it to be in
// play: about where the cell's centre crosses the edge.
const KEEP = 0.5;
// How far the aim may run past the board, in cells, before it stops: far
// enough to leave the board, near enough to come straight back.
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
    this.fading = null; // a cancelled close-up on its way out
    this.frame = 0;
    // On the window, so that a second finger is seen wherever it lands — on
    // the close-up, usually, which covers the board — and ignored.
    addEventListener("touchstart", (e) => this.start(e), { passive: false });
    addEventListener("touchmove", (e) => this.move(e), { passive: false });
    addEventListener("touchend", (e) => this.end(e, true));
    addEventListener("touchcancel", (e) => this.end(e, false));
  }

  start(event) {
    if (event.touches.length > 1) {
      // A second finger changes nothing; it only must not zoom the page.
      if (this.touch) event.preventDefault();
      return;
    }
    // The only finger on the screen, so anything still held about an earlier
    // one is stale: its lift went astray.
    this.close();
    this.fading?.remove();
    this.fading = null;
    // On the drawing itself: not the names standing in its corner, which are
    // a field to type in, nor the card's padding around it.
    const svg = this.board.svg;
    if (!this.enabled() || !svg?.contains(event.target)) return;
    const finger = event.changedTouches[0];
    const toDrawing = svg.getScreenCTM().inverse();
    const at = new DOMPoint(finger.clientX, finger.clientY).matrixTransform(
      toDrawing,
    );
    // Held to the board: a press just past the last row or column, on the
    // coloured edge or the labels, is a press for the cell nearest it.
    const board = this.board;
    const last = board.size - 1;
    const hold = ({ col, row }) => ({
      col: Math.max(0, Math.min(last, col)),
      row: Math.max(0, Math.min(last, row)),
    });
    // Further out than that, in the empty corners of the drawing, it is not a
    // press on the board at all, and the page keeps the touch.
    const page = svg.getScreenCTM().a;
    const nearest = hold(board.cellAt(at));
    const centre = board.at(nearest.col, nearest.row);
    if ((Math.hypot(at.x - centre.x, at.y - centre.y) - 1) * page > REACH)
      return;
    // The cell pressed is read off a board a little smaller than the one
    // drawn: the press is stretched out from the board's middle, so that one
    // near an edge counts as nearer it than the finger is, by OUTWARD pixels
    // at the outermost cells and by nothing in the middle. A finger that comes
    // down a cell short of the edge it means then has the edge cell already,
    // and anything else is a slide inwards — not towards the edge of the
    // screen, which is where a slide outwards would have taken it.
    const middle = last / 2;
    const stretch =
      1 + Math.min(0.3, OUTWARD / (page * Math.sqrt(3)) / Math.max(1, middle));
    const { col, row } = board.locate(at);
    const touched = hold(
      board.cellAt(
        board.turn(
          center(
            middle + (col - middle) * stretch,
            middle + (row - middle) * stretch,
          ),
        ),
      ),
    );
    const pressed = board.at(touched.col, touched.row);
    // No scrolling, and no click once the finger lifts: the lift is ours.
    event.preventDefault();

    const overlay = document.createElement("div");
    overlay.className = "magnifier";
    document.body.appendChild(overlay);
    const screen = overlay.getBoundingClientRect();

    // Pixels per unit of the drawing, close up; `page` is the same on the page.
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
      from: still(finger.clientX, finger.clientY, screen),
      finger: { x: finger.clientX, y: finger.clientY },
      // Which edges give a × when the finger is in their margin: not one it
      // came down in, until it has been out.
      armed: Object.fromEntries(
        Object.entries(gaps(finger.clientX, finger.clientY, screen)).map(
          ([side, gap]) => [side, gap >= EDGE[side]],
        ),
      ),
      at: pressed, // which starts in the middle of the screen
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

  /** Whether the finger is near enough an edge of the screen to be leaving. */
  atEdge(t) {
    const gap = gaps(t.finger.x, t.finger.y, t.screen);
    let leaving = false;
    for (const side of Object.keys(gap)) {
      if (gap[side] >= EDGE[side]) t.armed[side] = true;
      else if (t.armed[side]) leaving = true;
    }
    return leaving;
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
    const played = lifted && cell;
    this.close(!played);
    if (played) this.play(cell, event);
  }

  /**
   * Take the close-up down. A play is answered by the stone on the board, so
   * it goes at once; a lift that plays nothing leaves the × it was showing up
   * a moment, fading, so that the lift is seen to have done nothing.
   */
  close(cancelled = false) {
    cancelAnimationFrame(this.frame);
    const t = this.touch;
    this.touch = null;
    if (!t) return;
    if (!cancelled) {
      t.overlay.remove();
      return;
    }
    t.caption.textContent = "×";
    t.sight.setAttribute("display", "none");
    t.overlay.toggleAttribute("data-off", true);
    t.overlay.toggleAttribute("data-cancelled", true);
    this.fading?.remove();
    this.fading = t.overlay;
    // A frame at full strength first, so the × is seen before it fades.
    requestAnimationFrame(() =>
      t.overlay.toggleAttribute("data-closing", true),
    );
    setTimeout(() => {
      t.overlay.remove();
      if (this.fading === t.overlay) this.fading = null;
    }, FADE);
  }

  /**
   * Where the aim is: the cell the finger came down on, moved on by however
   * far it has slid since — not counting a slide out of the margin it came
   * down in — held to the board and a little beyond.
   */
  target() {
    const t = this.touch;
    const board = this.board;
    const point = {
      x: t.at.x + slid(t.finger.x, t.from.x) / t.gain,
      y: t.at.y + slid(t.finger.y, t.from.y) / t.gain,
    };
    const { col, row } = board.locate(point);
    const hold = (v) =>
      Math.max(-OVERRUN, Math.min(board.size - 1 + OVERRUN, v));
    return board.turn(center(hold(col), hold(row)));
  }

  /**
   * Where the ring is on the screen: the middle, moved as far as the finger
   * has slid, counted the same way. In the overlay's own coordinates.
   */
  sighted() {
    const t = this.touch;
    return {
      x: t.screen.width / 2 + slid(t.finger.x, t.from.x),
      y: t.screen.height / 2 + slid(t.finger.y, t.from.y),
    };
  }

  /** Put the aim under the ring, and the board around it. */
  update() {
    const t = this.touch;
    if (!t) return;
    const board = this.board;
    const point = this.target();
    const ring = this.sighted();
    const x = ring.x - (point.x - t.origin.x) * t.zoom;
    const y = ring.y - (point.y - t.origin.y) * t.zoom;
    t.copy.style.transform = `translate(${x}px, ${y}px)`;

    // Nothing to play with the ring off the board, the ringed cell more than
    // half off the screen, or the finger on its way off it; a cell the edge
    // only cuts a little of is still in play.
    const found = board.cellAt(point);
    const centre = board.at(found.col, found.row);
    const corners = board.vertices().map(([vx, vy]) => ({
      x: x + (centre.x + vx - t.origin.x) * t.zoom,
      y: y + (centre.y + vy - t.origin.y) * t.zoom,
    }));
    const shown = area(clip(corners, t.screen.width, t.screen.height));
    const on =
      !this.atEdge(t) &&
      shown >= KEEP * area(corners) &&
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

/**
 * Where a finger came down, as a span along each axis that it can slide
 * across for nothing: the point itself, or for a finger that came down in an
 * edge's margin, everything from that edge to `DEAD` clear of the margin —
 * pressed harder into the edge or eased off it, it is still pressing the cell
 * it came down on.
 */
function still(x, y, screen) {
  const gap = gaps(x, y, screen);
  const span = (v, low, high, lowSide, highSide) => {
    if (gap[lowSide] < EDGE[lowSide])
      return [-Infinity, low + EDGE[lowSide] + DEAD];
    if (gap[highSide] < EDGE[highSide])
      return [high - EDGE[highSide] - DEAD, Infinity];
    return [v, v];
  };
  return {
    x: span(x, screen.left, screen.right, "left", "right"),
    y: span(y, screen.top, screen.bottom, "top", "bottom"),
  };
}

/** How far a finger has slid along one axis, past the span it may cross for
    nothing. */
function slid(v, [lo, hi]) {
  return v < lo ? v - lo : v > hi ? v - hi : 0;
}

/** How far a point is from each edge of the screen. */
function gaps(x, y, screen) {
  return {
    left: x - screen.left,
    right: screen.right - x,
    top: y - screen.top,
    bottom: screen.bottom - y,
  };
}

/** The area of a polygon, by the shoelace. */
function area(points) {
  let twice = 0;
  points.forEach((a, k) => {
    const b = points[(k + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  });
  return Math.abs(twice) / 2;
}

/**
 * The part of a convex polygon inside the box from 0,0 to width,height:
 * clipped against each of the box's four sides in turn.
 */
function clip(points, width, height) {
  const sides = [
    [(p) => p.x >= 0, (a, b) => cross(a, b, "x", 0)],
    [(p) => p.y >= 0, (a, b) => cross(a, b, "y", 0)],
    [(p) => p.x <= width, (a, b) => cross(a, b, "x", width)],
    [(p) => p.y <= height, (a, b) => cross(a, b, "y", height)],
  ];
  for (const [inside, meet] of sides) {
    const kept = [];
    points.forEach((a, k) => {
      const b = points[(k + 1) % points.length];
      if (inside(a)) kept.push(a);
      if (inside(a) !== inside(b)) kept.push(meet(a, b));
    });
    points = kept;
    if (!points.length) break;
  }
  return points;
}

/** Where the segment from a to b crosses the line where `axis` is `at`. */
function cross(a, b, axis, at) {
  const t = (at - a[axis]) / (b[axis] - a[axis]);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
