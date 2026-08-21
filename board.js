/**
 * A small SVG Hex board.
 *
 * Pointy-top hexagons laid out in a rhombus, in the orientation HexWiki uses:
 * red joins the top and bottom edges, blue joins the left and right ones, and
 * the bottom red edge is the one we take our bearings from.
 *
 * That rhombus comes out half again as wide as it is tall, which is the wrong
 * way round for a phone. `orientation: "tall"` turns the whole drawing a
 * twelfth of a turn, which stands the columns upright and puts the same board
 * in the same box on its end; see turned().
 */
import { column, distances } from "./mason.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const HALF_WIDTH = Math.sqrt(3) / 2;

// A hexagon of circumradius 1, starting at the upper-right vertex and going
// anticlockwise on screen. Edge k runs from vertex k to vertex k+1.
const VERTICES = [
  [HALF_WIDTH, -0.5],
  [0, -1],
  [-HALF_WIDTH, -0.5],
  [-HALF_WIDTH, 0.5],
  [0, 1],
  [HALF_WIDTH, 0.5],
];

// The neighbour that sits across edge k, as [dcol, drow].
const NEIGHBOURS = [
  [1, -1], // upper right
  [0, -1], // upper left
  [-1, 0], // left
  [-1, 1], // lower left
  [0, 1], // lower right
  [1, 0], // right
];

/**
 * A twelfth of a turn clockwise, which is the whole of the tall orientation.
 *
 * The rhombus has two sides running along the rows and two along the columns,
 * sixty degrees apart, and it fills its own box exactly when one of those
 * pairs stands square to the screen. Four turns do that; two of them leave the
 * board upright; and of those two this is the one that keeps 11 in the bottom
 * left corner, with the red edge falling away from it to 11' at the lowest
 * point of all. The columns come upright, the rows lean down to the right, and
 * the board's box is the wide one's stood on its end: no board is given away
 * for the turn, which is what the other, prettier quarter-turn of the rhombus
 * onto its long diagonal costs.
 *
 * The hexagons come round with it and stand on their sides, points left and
 * right rather than up and down. Everything else is a rotation and nothing
 * else — the same cells, the same neighbours, the same names — so the only
 * thing that has to be said twice in this file is how far a hexagon reaches,
 * which is the other way about once it is on its side.
 */
function turned(p) {
  return { x: p.x * HALF_WIDTH - p.y / 2, y: p.x / 2 + p.y * HALF_WIDTH };
}

// Every label keeps the same clear space from the board's outline, and the
// second line of labels the same clear space from the first. Where they
// actually land is worked out from the text as rendered, because the numbers
// are not all the same width and fixed offsets leave the gaps ragged.
const GAP = 0.55;
const LINE_GAP = 0.5;
const PAD = 0.15; // a little air beyond the outermost labels

const BORDER_WIDTH = 0.3;
// A band of that width mitred along the outside of a hexagon's edges is the
// hexagon grown by it: every vertex is pushed out along its own radius, which
// bisects the two edges' normals and so stands 30 degrees off each. So the
// band reaches this much further out than the hexagon in every direction.
const OUTSET = 1 + (BORDER_WIDTH * 2) / Math.sqrt(3);

// --- the go-style boards ---
// The same board drawn as the tiling's dual: the cell centres become the
// intersections of a triangular grid and a stone sits on each, on a wooden
// board. Everything below is measured out from the outermost intersections, in
// the same units as the rest of the drawing (a hexagon's circumradius is 1,
// and neighbouring intersections stand sqrt(3) apart).
const STONE = { hex: 0.78, goban: 0.8 };
const GRID_WIDTH = 0.05;
const STAR = 0.16; // the dots at the 4-4 points
// The coloured band has to clear the rim of a stone played on the edge, so it
// starts beyond STONE.goban rather than against the outermost line.
const BAND = 1.28; // middle of the band
const WOOD = 1.85; // the wooden edge of the board
const BEVEL = 0.44; // stroke that rounds the wood's corners and darkens its rim

// A column runs diagonally, gaining this much x per unit of y, so labels
// placed on the continuation of a column follow the slant of the rhombus.
const SLANT = Math.sqrt(3) / 3;

/**
 * How big each drawing comes out, keyed by everything that decides it. Shared
 * by every board on the page, since the answer is about the drawing and not
 * about the board it was asked of.
 */
const SHAPES = new Map();

export function center(col, row) {
  return { x: Math.sqrt(3) * (col + row / 2), y: 1.5 * row };
}

export class HexBoard {
  constructor(container, options = {}) {
    this.container = container;
    this.size = options.size ?? 13;
    this.labels = options.labels ?? "relative"; // "relative" | "standard" | "none"
    this.style = options.style ?? "hex"; // "hex" | "goban"
    this.orientation = options.orientation ?? "wide"; // "wide" | "tall"
    this.showNumbers = options.showNumbers ?? true;
    this.onHover = options.onHover ?? (() => {});
    this.onSelect = options.onSelect ?? (() => {});
    this.moves = []; // [{col, row, color}], in order
    this.cursor = 0; // how many of them are on the board right now
    this.marked = null;
    this.cells = new Map(); // "col,row" -> {hex, stone, label}
    /** A point of the drawing, turned if the board is standing up. Bound, so
        that the outline helpers can be handed it. */
    this.turn = (point) =>
      this.orientation === "tall" ? turned(point) : point;
    this.render();
  }

  key(col, row) {
    return `${col},${row}`;
  }

  /** Where a cell sits, whichever way the board is turned. */
  at(col, row) {
    return this.turn(center(col, row));
  }

  /**
   * A hexagon's corners, turned with the board. The polygon turns as one, so
   * edge k still faces NEIGHBOURS[k] whichever way round it is.
   */
  vertices() {
    return VERTICES.map(([x, y]) => {
      const { x: vx, y: vy } = this.turn({ x, y });
      return [vx, vy];
    });
  }

  /**
   * Replay the history up to the cursor into the stones now on the board.
   *
   * A swap is not a stone but a transformation of the ones already played: it
   * reflects the board across its long diagonal and changes every colour,
   * which is the pie rule as hexworld records it. So the position cannot be
   * read off the list of moves — it has to be played through.
   */
  position() {
    let stones = new Map(); // "col,row" -> { color, number }
    let last = null;
    this.moves.slice(0, this.cursor).forEach((move, index) => {
      if (move.type === "move") {
        last = this.key(move.col, move.row);
        stones.set(last, { color: move.color, number: index + 1 });
      } else if (move.type === "swap") {
        const mirrored = new Map();
        for (const [at, stone] of stones) {
          const [col, row] = at.split(",").map(Number);
          mirrored.set(this.key(row, col), {
            color: stone.color === "red" ? "blue" : "red",
            number: stone.number,
          });
        }
        stones = mirrored;
        if (last) {
          const [col, row] = last.split(",").map(Number);
          last = this.key(row, col);
        }
      }
      // a pass leaves the board alone, and only costs its turn
    });
    return { stones, last };
  }

  /** Whose turn it is after everything up to the cursor. */
  toPlay() {
    const previous = this.moves[this.cursor - 1];
    return previous && previous.color === "red" ? "blue" : "red";
  }

  stoneAt(col, row) {
    return this.position().stones.get(this.key(col, row))?.color ?? null;
  }

  /**
   * Place or remove a stone. Editing while rewound throws away the moves that
   * were ahead, which is the usual way a variation replaces a line.
   *
   * A stone of the colour that is not to move is preceded by a pass, so the
   * history always alternates and can be written in hexworld's format, where
   * the colours are inferred from the order rather than stored.
   */
  play(col, row, color) {
    const at = this.key(col, row);
    const kept = [];
    for (const move of this.moves.slice(0, this.cursor)) {
      if (move.type !== "move" || this.key(move.col, move.row) !== at) {
        kept.push(move);
      }
    }
    this.moves = kept;
    this.cursor = kept.length;
    if (color) {
      if (this.toPlay() !== color) this.add({ type: "pass" });
      this.add({ type: "move", col, row });
    }
    this.paint();
  }

  /** A turn that puts down no stone. */
  pass() {
    this.add({ type: "pass" });
    this.paint();
  }

  /**
   * Whether a swap is the move on offer. The pie rule allows it as the reply
   * to the opening move and at no other point, which is the same test
   * hexworld puts on its own swap button. The history will hold one anywhere,
   * so a link that has one elsewhere still opens.
   */
  canSwap() {
    return this.cursor === 1 && this.moves[0].type === "move";
  }

  /** The pie rule: reflect the board and change every colour. */
  swap() {
    this.add({ type: "swap" });
    this.paint();
  }

  add(move) {
    this.moves = this.moves.slice(0, this.cursor);
    this.moves.push({ ...move, color: this.toPlay() });
    this.cursor = this.moves.length;
  }

  /** Show the position after `n` moves; 0 is the empty board. */
  goto(n) {
    this.cursor = Math.max(0, Math.min(this.moves.length, n));
    this.paint();
  }

  first() {
    this.goto(0);
  }

  prev() {
    this.goto(this.cursor - 1);
  }

  next() {
    this.goto(this.cursor + 1);
  }

  last() {
    this.goto(this.moves.length);
  }

  clear() {
    this.moves = [];
    this.cursor = 0;
    this.paint();
  }

  setMoves(moves, cursor = moves.length) {
    this.moves = moves.slice();
    this.cursor = Math.max(0, Math.min(this.moves.length, cursor));
    this.paint();
  }

  setSize(size) {
    this.size = size;
    this.moves = this.moves.filter(
      (m) => m.type !== "move" || (m.col < size && m.row < size),
    );
    this.cursor = Math.min(this.cursor, this.moves.length);
    this.render();
  }

  setLabels(mode) {
    this.labels = mode;
    this.render();
  }

  /** How the board is drawn: hexagons, or a grid with stones on it. */
  setStyle(mode) {
    this.style = mode;
    this.render();
  }

  /**
   * Which way the rhombus lies. Redrawn only when it actually changes, since
   * the caller works this out from the room on screen and so asks on every
   * resize.
   */
  setOrientation(mode) {
    if (mode === this.orientation) return;
    this.orientation = mode;
    this.render();
  }

  /**
   * How big the drawing comes out, in its own units, drawn the given way
   * round.
   *
   * The two are not each other transposed, which is the whole reason this is
   * measured rather than worked out: the hexagons come round with the board
   * but the labels do not, and a printed number is wider than it is tall, so
   * standing the rhombus up does not stand its labels up with it. On 13x13 the
   * upright drawing comes out a thirtieth wider against its own height than
   * turning the lying one on its side would say — which is enough to settle a
   * screen whose room and width are within a few percent of each other, and a
   * phone held upright usually is.
   *
   * The way round that is not on screen has to be drawn to be measured, since
   * where the labels land is read off the text as rendered. It is drawn once
   * out of sight and the answer kept: it depends on the size, the style and
   * which labels are printed, and on nothing that a resize touches.
   */
  shape(orientation = this.orientation) {
    if (orientation === this.orientation && this.svg) {
      const { width, height } = this.svg.viewBox.baseVal;
      return { width, height };
    }
    const key = `${this.size}|${this.style}|${this.labels}|${orientation}`;
    if (!SHAPES.has(key)) {
      const host = document.createElement("div");
      // Out of the way rather than hidden: `display: none` leaves the labels
      // unrendered, and getBBox on those measures nothing.
      host.style.cssText =
        "position:absolute;left:-10000px;top:0;width:400px;visibility:hidden";
      document.body.appendChild(host);
      const probe = new HexBoard(host, {
        size: this.size,
        labels: this.labels,
        style: this.style,
        orientation,
      });
      const { width, height } = probe.svg.viewBox.baseVal;
      SHAPES.set(key, { width, height });
      host.remove();
    }
    return SHAPES.get(key);
  }

  /**
   * Lie the rhombus down or stand it up, whichever draws the bigger board in a
   * box this size. Answers with the way it went.
   *
   * How big the board comes out is how big one cell comes out, and that is the
   * drawing scaled to fit the box each way round: the smaller of what the
   * width allows and what the height does.
   */
  fitInto(width, height) {
    const cell = (orientation) => {
      const shape = this.shape(orientation);
      return Math.min(width / shape.width, height / shape.height);
    };
    this.setOrientation(cell("tall") > cell("wide") ? "tall" : "wide");
    return this.orientation;
  }

  setShowNumbers(on) {
    this.showNumbers = on;
    this.paint();
  }

  /** Ring a single cell, to point out a coordinate someone typed in. */
  mark(cell) {
    this.marked = cell;
    this.paint();
  }

  render() {
    const { size } = this;
    const last = size - 1;
    const dual = this.style !== "hex";
    const hexagon = this.vertices();
    // The board itself, outside edge of the border included: the corners of
    // the rhombus of centres, grown by however far a hexagon reaches each way
    // — which is not the same each way, and swaps over when the board turns.
    const corners = [
      [0, 0],
      [last, 0],
      [last, last],
      [0, last],
    ].map(([col, row]) => this.at(col, row));
    const reach = (pick) =>
      OUTSET * Math.max(...hexagon.map((v) => Math.abs(pick(v))));
    const board = dual
      ? boxOf(outline(size, WOOD, this.turn))
      : stretch(
          boxOf(corners),
          reach((v) => v[0]),
          reach((v) => v[1]),
        );

    const svg = document.createElementNS(SVG_NS, "svg");
    setViewBox(svg, board);
    // `dual` is what the two go-style boards share: the grid, the stones on
    // it, and the hexagons left unpainted underneath.
    svg.setAttribute(
      "class",
      `hex-board style-${this.style}${dual ? " dual" : ""}`,
    );
    svg.dataset.orientation = this.orientation;
    svg.setAttribute("role", "grid");
    svg.setAttribute("aria-label", `Hex board, ${size} by ${size}`);

    if (dual) svg.appendChild(stoneShading());
    const groundLayer = group(svg, "ground");
    const cellLayer = group(svg, "cells");
    const edgeLayer = group(svg, "edges");
    const labelLayer = group(svg, "labels");

    if (dual) {
      if (this.style === "goban") this.buildWood(groundLayer);
      this.buildGrid(groundLayer);
      this.buildStars(groundLayer);
    }

    this.cells = new Map();
    const points = hexagon.map(([x, y]) => `${x},${y}`).join(" ");
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        cellLayer.appendChild(this.buildCell(col, row, points));
      }
    }
    if (dual) this.buildBands(edgeLayer);
    else this.buildEdges(edgeLayer);
    const labels = this.buildLabels(labelLayer);

    this.svg = svg;
    // Labels can only be measured once they are being rendered, so they go in
    // unplaced, get positioned, and only then does the viewBox close in.
    this.container.replaceChildren(svg);
    setViewBox(svg, this.layoutLabels(labels, board));
    this.paint();
  }

  buildCell(col, row, points) {
    const { x, y } = this.at(col, row);
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "cell");
    g.setAttribute("transform", `translate(${x} ${y})`);

    const hex = document.createElementNS(SVG_NS, "polygon");
    hex.setAttribute("points", points);
    hex.setAttribute("class", "hex");
    g.appendChild(hex);

    const stone = document.createElementNS(SVG_NS, "circle");
    stone.setAttribute("r", STONE[this.style]);
    stone.setAttribute("class", "stone hidden");
    g.appendChild(stone);

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("class", "stone-label");
    g.appendChild(label);

    g.addEventListener("mouseenter", () => this.onHover({ col, row }));
    g.addEventListener("mouseleave", () => this.onHover(null));
    g.addEventListener("click", (event) => {
      event.preventDefault();
      this.onSelect({ col, row }, event);
    });
    g.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.onSelect({ col, row }, event);
    });

    this.cells.set(this.key(col, row), { group: g, hex, stone, label });
    return g;
  }

  /**
   * The board's outline as one cycle of hexagon edges chained end to end:
   * every edge with no cell behind it, in the order they run round the board.
   */
  outlineCycle() {
    const { size } = this;
    const hexagon = this.vertices();
    const key = (p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
    const from = new Map(); // where an edge starts -> that edge
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const { x, y } = this.at(col, row);
        const corner = (k) => ({ x: x + hexagon[k][0], y: y + hexagon[k][1] });
        for (let k = 0; k < 6; k++) {
          const [dc, dr] = NEIGHBOURS[k];
          if (outsideSide(col + dc, row + dr, size))
            from.set(key(corner(k)), { a: corner(k), b: corner((k + 1) % 6) });
        }
      }
    }
    const start = from.values().next().value;
    const cycle = [start];
    for (
      let at = from.get(key(start.b));
      at !== start;
      at = from.get(key(at.b))
    )
      cycle.push(at);
    return cycle;
  }

  /**
   * The coloured edges: four bands running along the board's own zigzag
   * outline, each one polygon rather than a segment per hexagon edge, so that
   * the joins between segments are joins.
   *
   * A band stops where the outline reaches furthest along its corner's
   * bisector. At a sharp corner that is one vertex; at a blunt one an edge
   * stands square to the bisector, both its ends reach as far, and the two
   * colours halve it. Either way both bands stop on the same point and are
   * cut along the same line, so neither overruns the other.
   */
  buildEdges(layer) {
    const cycle = this.outlineCycle();
    const all = sides(this.size, this.turn);
    const corners = all.map((s, k) => {
      const next = all[(k + 1) % 4];
      const bx = s.normal.x + next.normal.x;
      const by = s.normal.y + next.normal.y;
      const reach = cycle.map((e) => e.a.x * bx + e.a.y * by);
      const furthest = Math.max(...reach);
      // Which edge of the cycle the corner falls on, and whether in its middle.
      const [first, second] = reach.flatMap((r, i) =>
        r > furthest - 1e-9 ? [i] : [],
      );
      const halved = second !== undefined;
      return {
        edges: [s.edge, next.edge],
        at: !halved || second - first === 1 ? first : second,
        halved,
      };
    });

    // Halve the edges a blunt corner falls in the middle of, so that every
    // colour change lands on a vertex the two bands can share.
    const pieces = [];
    cycle.forEach((edge, i) => {
      const corner = corners.find((c) => c.at === i);
      const mid = corner?.halved && {
        x: (edge.a.x + edge.b.x) / 2,
        y: (edge.a.y + edge.b.y) / 2,
      };
      if (mid) pieces.push({ a: edge.a, b: mid });
      if (corner) corner.from = pieces.length;
      pieces.push(mid ? { a: mid, b: edge.b } : edge);
    });

    const count = pieces.length;
    const normals = pieces.map(({ a, b }) => {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
    });
    // Where a piece's start ends up once the outline is pushed `d` outwards.
    const grown = (i, d) =>
      pushed(
        pieces[i % count].a,
        normals[(i + count - 1) % count],
        normals[i % count],
        d,
      );

    const order = [...corners].sort((p, q) => p.from - q.from);
    for (const [k, corner] of order.entries()) {
      const next = order[(k + 1) % order.length];
      const stop = next.from > corner.from ? next.from : next.from + count;
      const inner = [];
      const outer = [];
      for (let i = corner.from; i <= stop; i++) {
        inner.push(grown(i, 0));
        outer.push(grown(i, BORDER_WIDTH));
      }
      const band = document.createElementNS(SVG_NS, "polygon");
      band.setAttribute("points", pointsOf(inner.concat(outer.reverse())));
      // The side the run belongs to is the one its two corners have in common.
      const edge = corner.edges.find((e) => next.edges.includes(e));
      band.setAttribute("class", `border border-${edge}`);
      layer.appendChild(band);
    }
  }

  /**
   * The board itself: the rhombus of intersections, grown WOOD outwards on
   * every side. Drawn a half-bevel short of that and stroked back out to it,
   * so the same stroke rounds the two sharp corners and darkens the rim.
   */
  buildWood(layer) {
    const wood = document.createElementNS(SVG_NS, "polygon");
    wood.setAttribute(
      "points",
      pointsOf(outline(this.size, WOOD - BEVEL / 2, this.turn)),
    );
    wood.setAttribute("stroke-width", BEVEL);
    wood.setAttribute("class", "wood");
    layer.appendChild(wood);
  }

  /**
   * The triangular tiling, as the three families of straight lines running
   * through the cell centres: the rows, the columns, and the short diagonals
   * across them. Every intersection is a cell, and every cell an intersection.
   */
  buildGrid(layer) {
    const { size } = this;
    const last = size - 1;
    const draw = (a, b) => {
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", a.x);
      line.setAttribute("y1", a.y);
      line.setAttribute("x2", b.x);
      line.setAttribute("y2", b.y);
      line.setAttribute("stroke-width", GRID_WIDTH);
      line.setAttribute("class", "grid-line");
      layer.appendChild(line);
    };
    for (let i = 0; i < size; i++) {
      draw(this.at(0, i), this.at(last, i)); // a row
      draw(this.at(i, 0), this.at(i, last)); // a column
    }
    // The third family is where col + row is constant. Its two ends are the
    // acute corners of the board, where the line is a single point and there
    // is nothing to draw.
    for (let k = 1; k < 2 * last; k++) {
      const lo = Math.max(0, k - last);
      const hi = Math.min(last, k);
      draw(this.at(lo, k - lo), this.at(hi, k - hi));
    }
  }

  /**
   * Go's star points, put where they mean something on this board: the 4-4
   * point of each corner — 44, 44', 4'4 and 4'4', which are those names on
   * every board size — and the centre, when a single cell sits at it. Small
   * boards where the four would collide with each other get the centre alone.
   */
  buildStars(layer) {
    const { size } = this;
    const at = new Set();
    if (size >= 9) {
      for (const col of [3, size - 4]) {
        for (const row of [3, size - 4]) at.add(this.key(col, row));
      }
    }
    if (size >= 5 && size % 2) at.add(this.key((size - 1) / 2, (size - 1) / 2));
    for (const cell of at) {
      const [col, row] = cell.split(",").map(Number);
      const { x, y } = this.at(col, row);
      const dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("cx", x);
      dot.setAttribute("cy", y);
      dot.setAttribute("r", STAR);
      dot.setAttribute("class", "star");
      layer.appendChild(dot);
    }
  }

  /**
   * The coloured edges, as four bands beyond the outermost intersections, far
   * enough out to clear the rim of a stone played on one. They are mitred
   * where they meet: each end is cut along the corner's bisector, so red's
   * band and blue's divide the corner between them and neither overruns.
   */
  buildBands(layer) {
    const inner = BAND - BORDER_WIDTH / 2;
    const outer = BAND + BORDER_WIDTH / 2;
    for (const s of sides(this.size, this.turn)) {
      const band = document.createElementNS(SVG_NS, "polygon");
      band.setAttribute(
        "points",
        pointsOf([
          pushed(s.a, s.before, s.normal, inner),
          pushed(s.b, s.normal, s.after, inner),
          pushed(s.b, s.normal, s.after, outer),
          pushed(s.a, s.before, s.normal, outer),
        ]),
      );
      band.setAttribute("class", `band band-${s.edge}`);
      layer.appendChild(band);
    }
  }

  /**
   * Create the labels without placing them: their positions depend on how wide
   * they turn out to be, which is only knowable once they are rendered.
   */
  buildLabels(layer) {
    if (this.labels === "none") return [];
    const { size } = this;
    const relative = this.labels === "relative";
    const out = [];
    const add = (side, line, index, content, className) => {
      const node = text(layer, content, className);
      node.dataset.side = side;
      node.dataset.line = line;
      out.push({ node, side, line, index });
    };

    for (let col = 0; col < size; col++) {
      if (!relative) {
        const letter = column(col);
        add("top", 0, col, letter, "axis");
        add("bottom", 0, col, letter, "axis");
        continue;
      }
      // Every column has two names, one per blue edge. The nearer-edge one
      // goes against the board, the other outside it, quieter.
      const d = distances(col, 0, size);
      const { inner, outer } = scalePair(d.blue, d.bluePrime);
      add("top", 0, col, inner, "axis-blue");
      add("top", 1, col, outer, "axis-blue axis-alt");
      add("bottom", 0, col, inner, "axis-blue");
      add("bottom", 1, col, outer, "axis-blue axis-alt");
    }

    for (let row = 0; row < size; row++) {
      if (!relative) {
        add("left", 0, row, `${row + 1}`, "axis");
        add("right", 0, row, `${row + 1}`, "axis");
        continue;
      }
      const d = distances(0, row, size);
      const { inner, outer } = scalePair(d.red, d.redPrime);
      add("left", 0, row, inner, "axis-red");
      add("left", 1, row, outer, "axis-red axis-alt");
      add("right", 0, row, inner, "axis-red");
      add("right", 1, row, outer, "axis-red axis-alt");
    }
    return out;
  }

  /**
   * What each of the four lines of labels is placed against: the edge that
   * side's labels face, as its outward normal and how far past the outermost
   * cell centres it stands, and the step out of the board the line follows.
   *
   * Neither of the two is what the other suggests. A line of labels sits on
   * the continuation of its own row or column, so its step is that row's or
   * that column's own direction, sloping or not. What it faces is the outline:
   * on the hexagons that is how far the outermost cells reach, measured square
   * on to the screen, the outline being a zigzag whose points are what a label
   * has to clear; on the wooden board it is a real edge, which leans as the
   * board does. What a step buys in clearance is then the one projected on the
   * other, and both are already turned.
   */
  faces() {
    const hex = this.style === "hex";
    const tall = this.orientation === "tall";
    // A pointy-top hexagon reaches HALF_WIDTH sideways and 1 up and down; the
    // turn stands it on its side and it reaches the other way about.
    const flank = {
      normal: hex ? { x: 1, y: 0 } : this.turn({ x: HALF_WIDTH, y: -0.5 }),
      out: hex ? (tall ? 1 : HALF_WIDTH) * OUTSET : WOOD,
    };
    const end = {
      normal: hex ? { x: 0, y: -1 } : this.turn({ x: 0, y: -1 }),
      out: hex ? (tall ? HALF_WIDTH : 1) * OUTSET : WOOD,
    };
    const row = this.turn({ x: 1, y: 0 }); // along a row, to the right
    const column = this.turn({ x: SLANT, y: 1 }); // down a column
    return {
      left: { ...flank, normal: back(flank.normal), step: back(row) },
      right: { ...flank, step: row },
      top: { ...end, step: back(column) },
      bottom: { ...end, normal: back(end.normal), step: column },
    };
  }

  /**
   * Place the labels GAP clear of the board, the second line LINE_GAP clear of
   * the first, then report what the drawing spans.
   *
   * The clearance is measured to the edge the label faces — the side of the
   * board for a row, the points of the zigzag for a column — rather than to
   * the nearest piece of outline. Those are not the same: a row label sits in
   * a notch of the staircase, and the step above it, receding diagonally,
   * always comes nearer than the edge alongside. Holding that at arm's length
   * pushes the numbers out from the board for no reason the eye can see.
   *
   * It is measured from the corner of the label's ink nearest that edge, and
   * the label is anchored by the side facing it, so that a wide "13'" and a
   * bare "7" stand off alike. Where the edge is above or below rather than
   * beside, there is no side facing it and the text is centred instead.
   *
   * Text stays upright whichever way the board is turned, so on a turned board
   * every edge leans away from its labels and the nearest corner is no longer
   * the whole facing side of the box. That is the only thing the turn changes
   * here: the ink's half-height, counted against the lean of the edge.
   */
  layoutLabels(labels, board) {
    const bounds = { ...board };
    if (!labels.length) return grow(bounds, 0);

    for (const l of labels) {
      l.width = l.node.getComputedTextLength();
      l.ink = inkHalf(l.node);
    }
    const last = this.size - 1;
    const faces = this.faces();
    const pick = (side, line) =>
      labels.filter((l) => l.side === side && l.line === line);
    // The cell each label is placed against: the near end of its own row or
    // column, so that a line of labels runs parallel to the side it names.
    const against = {
      left: (index) => [0, index],
      right: (index) => [last, index],
      top: (index) => [index, 0],
      bottom: (index) => [index, last],
    };

    for (const side of ["left", "right", "top", "bottom"]) {
      const inner = pick(side, 0);
      if (!inner.length) continue;
      const face = faces[side];
      const { normal, step } = face;
      const per = step.x * normal.x + step.y * normal.y; // clearance per step
      const anchor =
        normal.x < -1e-9 ? "end" : normal.x > 1e-9 ? "start" : "middle";
      const place = (l, d) => {
        const [col, row] = against[side](l.index);
        return spot(this.at(col, row), step.x * d, step.y * d, l, anchor);
      };

      const d = (face.out + GAP + inner[0].ink * Math.abs(normal.y)) / per;
      for (const l of inner) apply(l, place(l, d), bounds);

      const outer = pick(side, 1);
      if (!outer.length) continue;
      // The second line gets past the first the cheap way: round its ends
      // where the step runs sideways, over its top where the step climbs.
      const clear =
        Math.abs(step.y) >= Math.abs(step.x)
          ? (inner[0].ink + outer[0].ink + LINE_GAP) / Math.abs(step.y)
          : (Math.max(...inner.map((l) => l.width)) + LINE_GAP) /
            Math.abs(step.x);
      for (const l of outer) apply(l, place(l, d + clear), bounds);
    }
    return grow(bounds, PAD);
  }

  /** Repaint stones, move numbers and highlights without rebuilding the SVG. */
  paint() {
    for (const { hex, stone, label } of this.cells.values()) {
      stone.setAttribute("class", "stone hidden");
      label.textContent = "";
      hex.setAttribute("class", "hex");
    }

    const { stones, last } = this.position();
    for (const [at, stone] of stones) {
      const cell = this.cells.get(at);
      if (!cell) continue;
      cell.stone.setAttribute(
        "class",
        `stone stone-${stone.color}${at === last ? " stone-last" : ""}`,
      );
      if (this.showNumbers) {
        cell.label.setAttribute("y", inkHalf(cell.label));
        cell.label.textContent = String(stone.number);
        cell.label.setAttribute("class", `stone-label on-${stone.color}`);
      }
    }

    if (this.marked) {
      const cell = this.cells.get(this.key(this.marked.col, this.marked.row));
      if (cell) cell.hex.setAttribute("class", "hex hex-marked");
    }

    for (const cell of this.winningPath()) {
      const found = this.cells.get(this.key(cell.col, cell.row));
      if (found) found.stone.classList.add("stone-winning");
    }
  }

  /** Cells of a completed connection, or [] while the game is unfinished. */
  winningPath() {
    for (const color of ["red", "blue"]) {
      const path = this.connection(color);
      if (path.length) return path;
    }
    return [];
  }

  /**
   * Breadth-first search from one of a colour's edges to the other: red joins
   * top to bottom, blue joins left to right.
   */
  connection(color) {
    const { size } = this;
    const owner = this.position().stones;
    const start = [];
    for (let i = 0; i < size; i++) {
      const cell = color === "red" ? { col: i, row: 0 } : { col: 0, row: i };
      if (owner.get(this.key(cell.col, cell.row))?.color === color)
        start.push(cell);
    }

    const from = new Map();
    const queue = [];
    for (const cell of start) {
      from.set(this.key(cell.col, cell.row), null);
      queue.push(cell);
    }

    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head];
      const done =
        color === "red" ? cell.row === size - 1 : cell.col === size - 1;
      if (done) {
        const path = [];
        for (let at = cell; at; at = from.get(this.key(at.col, at.row)))
          path.push(at);
        return path;
      }
      for (const [dc, dr] of NEIGHBOURS) {
        const next = { col: cell.col + dc, row: cell.row + dr };
        const key = this.key(next.col, next.row);
        if (outsideSide(next.col, next.row, size)) continue;
        if (from.has(key) || owner.get(key)?.color !== color) continue;
        from.set(key, cell);
        queue.push(next);
      }
    }
    return [];
  }
}

/** Where a label sits, and the box its ink occupies there. */
function spot(centre, dx, dy, l, anchor) {
  const x = centre.x + dx;
  const y = centre.y + dy;
  const from =
    anchor === "end" ? x - l.width : anchor === "start" ? x : x - l.width / 2;
  return {
    x,
    y: y + l.ink,
    anchor,
    box: [from, y - l.ink, from + l.width, y + l.ink],
  };
}

function apply(l, at, bounds) {
  l.node.setAttribute("x", at.x);
  l.node.setAttribute("y", at.y);
  // Inline, because the stylesheet's `text { text-anchor: middle }` outranks
  // a presentation attribute.
  l.node.style.textAnchor = at.anchor;
  bounds.minX = Math.min(bounds.minX, at.box[0]);
  bounds.minY = Math.min(bounds.minY, at.box[1]);
  bounds.maxX = Math.max(bounds.maxX, at.box[2]);
  bounds.maxY = Math.max(bounds.maxY, at.box[3]);
}

/** Half the height of the digits' ink, in the font this label is drawn in. */
const inkHeights = new Map();

function inkHalf(node) {
  const style = getComputedStyle(node);
  const key = `${style.fontWeight}/${style.fontSize}/${style.fontFamily}`;
  if (!inkHeights.has(key)) {
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = `${style.fontWeight} 1000px ${style.fontFamily}`;
    const ink = ctx.measureText("0123456789");
    const half =
      (ink.actualBoundingBoxAscent - ink.actualBoundingBoxDescent) / 2000;
    inkHeights.set(key, half * parseFloat(style.fontSize));
  }
  return inkHeights.get(key);
}

function stretch(box, x, y) {
  return {
    minX: box.minX - x,
    maxX: box.maxX + x,
    minY: box.minY - y,
    maxY: box.maxY + y,
  };
}

const grow = (box, by) => stretch(box, by, by);

/** The other way round. */
const back = (v) => ({ x: -v.x, y: -v.y });

function setViewBox(svg, b) {
  svg.setAttribute(
    "viewBox",
    `${b.minX} ${b.minY} ${b.maxX - b.minX} ${b.maxY - b.minY}`,
  );
}

/**
 * Order a row or column's two names: the one measured from the nearer edge
 * first. `near` is the unprimed distance and `far` the primed one, and the
 * unprimed name wins a tie, exactly as in mason.relative().
 */
function scalePair(near, far) {
  return far < near
    ? { inner: `${far}'`, outer: `${near}` }
    : { inner: `${near}`, outer: `${far}'` };
}

/** Which edge a cell falls off, or null if it is on the board. */
function outsideSide(col, row, size) {
  if (row < 0) return "redp"; // above the top red' edge
  if (row >= size) return "red"; // below the bottom red edge
  if (col < 0) return "blue"; // left of the blue edge
  if (col >= size) return "bluep"; // right of the blue' edge
  return null;
}

/**
 * The four sides of the rhombus the cell centres describe, going round from
 * the red' one, each with its own outward unit normal and its neighbours'. The
 * edge a side belongs to is named as outsideSide() names it. `turn` is how the
 * board is standing: it moves the corners and the normals alike, so the four
 * come back in the same order, pointing the same way relative to the board.
 */
function sides(size, turn = (p) => p) {
  const last = size - 1;
  const corners = [
    center(0, 0),
    center(last, 0),
    center(last, last),
    center(0, last),
  ].map(turn);
  const normals = [
    { x: 0, y: -1 }, // top
    { x: HALF_WIDTH, y: -0.5 }, // right
    { x: 0, y: 1 }, // bottom
    { x: -HALF_WIDTH, y: 0.5 }, // left
  ].map(turn);
  const edges = ["redp", "bluep", "red", "blue"];
  return normals.map((normal, k) => ({
    a: corners[k],
    b: corners[(k + 1) % 4],
    normal,
    before: normals[(k + 3) % 4],
    after: normals[(k + 1) % 4],
    edge: edges[k],
  }));
}

/**
 * Where a corner ends up when both of the sides meeting there are pushed `d`
 * outwards: the one point that stands `d` off each of them, which is `d` along
 * both normals at once and so lies on the corner's bisector.
 */
function pushed(point, n1, n2, d) {
  const k = d / (1 + n1.x * n2.x + n1.y * n2.y);
  return { x: point.x + k * (n1.x + n2.x), y: point.y + k * (n1.y + n2.y) };
}

/** The rhombus of cell centres, grown `d` outwards on every side. */
function outline(size, d, turn) {
  return sides(size, turn).map((s) => pushed(s.a, s.before, s.normal, d));
}

const pointsOf = (points) => points.map((p) => `${p.x},${p.y}`).join(" ");

function boxOf(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/**
 * The shading the pieces are drawn with: two stones lit from the upper left,
 * and the timber that may go under them. The stops carry classes rather than
 * colours, so the stylesheet keeps them and can flatten the stones out for the
 * printed-diagram board or follow the colour scheme for the wood.
 */
function stoneShading() {
  const defs = document.createElementNS(SVG_NS, "defs");
  const stops = (node, list) => {
    for (const [offset, className] of list) {
      const stop = document.createElementNS(SVG_NS, "stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("class", className);
      node.appendChild(stop);
    }
    defs.appendChild(node);
    return node;
  };

  for (const color of ["black", "white"]) {
    const stone = document.createElementNS(SVG_NS, "radialGradient");
    stone.setAttribute("id", `stone-${color}`);
    stone.setAttribute("cx", "0.36");
    stone.setAttribute("cy", "0.30");
    stone.setAttribute("r", "0.78");
    stops(stone, [
      ["0%", `sheen-${color}`],
      ["45%", `body-${color}`],
      ["100%", `rim-${color}`],
    ]);
  }

  const wood = document.createElementNS(SVG_NS, "linearGradient");
  wood.setAttribute("id", "goban-wood");
  wood.setAttribute("x1", "0.1");
  wood.setAttribute("y1", "0");
  wood.setAttribute("x2", "0.6");
  wood.setAttribute("y2", "1");
  stops(wood, [
    ["0%", "wood-light"],
    ["100%", "wood-deep"],
  ]);
  return defs;
}

function group(parent, className) {
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("class", className);
  parent.appendChild(g);
  return g;
}

function text(parent, content, className) {
  const node = document.createElementNS(SVG_NS, "text");
  node.setAttribute("class", className);
  node.textContent = content;
  parent.appendChild(node);
  return node;
}
