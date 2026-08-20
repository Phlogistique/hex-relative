/**
 * A small SVG Hex board.
 *
 * Pointy-top hexagons laid out in a rhombus, in the orientation HexWiki uses:
 * red joins the top and bottom edges, blue joins the left and right ones, and
 * the bottom red edge is the one we take our bearings from.
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

// Every label keeps the same clear space from the board's outline, and the
// second line of labels the same clear space from the first. Where they
// actually land is worked out from the text as rendered, because the numbers
// are not all the same width and fixed offsets leave the gaps ragged.
const GAP = 0.55;
const LINE_GAP = 0.5;
const PAD = 0.15; // a little air beyond the outermost labels

const BORDER_WIDTH = 0.3;

// --- the go-style boards ---
// The same board drawn as the tiling's dual: the cell centres become the
// intersections of a triangular grid and a stone sits on each. Two of them,
// differing only in what the grid is drawn on: `goban` is a wooden board,
// `diagram` is the same lines printed on the page. Everything below is
// measured out from the outermost intersections, in the same units as the rest
// of the drawing (a hexagon's circumradius is 1, and neighbouring
// intersections stand sqrt(3) apart).
const STONE = { hex: 0.78, goban: 0.8, diagram: 0.8 };
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

export function center(col, row) {
  return { x: Math.sqrt(3) * (col + row / 2), y: 1.5 * row };
}

export class HexBoard {
  constructor(container, options = {}) {
    this.container = container;
    this.size = options.size ?? 13;
    this.labels = options.labels ?? "relative"; // "relative" | "standard" | "none"
    this.style = options.style ?? "hex"; // "hex" | "goban" | "diagram"
    this.showNumbers = options.showNumbers ?? true;
    this.onHover = options.onHover ?? (() => {});
    this.onSelect = options.onSelect ?? (() => {});
    this.moves = []; // [{col, row, color}], in order
    this.cursor = 0; // how many of them are on the board right now
    this.marked = null;
    this.cells = new Map(); // "col,row" -> {hex, stone, label}
    this.render();
  }

  key(col, row) {
    return `${col},${row}`;
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
    // The board itself, outside edge of the border included.
    const board = dual
      ? boxOf(outline(size, this.edge()))
      : {
          minX: -HALF_WIDTH - BORDER_WIDTH,
          maxX: Math.sqrt(3) * (last + last / 2) + HALF_WIDTH + BORDER_WIDTH,
          minY: -1 - BORDER_WIDTH,
          maxY: 1.5 * last + 1 + BORDER_WIDTH,
        };

    const svg = document.createElementNS(SVG_NS, "svg");
    setViewBox(svg, board);
    // `dual` is what the two go-style boards share: the grid, the stones on
    // it, and the hexagons left unpainted underneath.
    svg.setAttribute(
      "class",
      `hex-board style-${this.style}${dual ? " dual" : ""}`,
    );
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
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        cellLayer.appendChild(this.buildCell(col, row));
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

  buildCell(col, row) {
    const { x, y } = center(col, row);
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "cell");
    g.setAttribute("transform", `translate(${x} ${y})`);

    const hex = document.createElementNS(SVG_NS, "polygon");
    hex.setAttribute(
      "points",
      VERTICES.map(([vx, vy]) => `${vx},${vy}`).join(" "),
    );
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

  /** Thick coloured borders: every hex edge with no neighbour behind it. */
  buildEdges(layer) {
    const { size } = this;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const { x, y } = center(col, row);
        for (let k = 0; k < 6; k++) {
          const [dc, dr] = NEIGHBOURS[k];
          const side = outsideSide(col + dc, row + dr, size);
          if (!side) continue;
          const [ax, ay] = VERTICES[k];
          const [bx, by] = VERTICES[(k + 1) % 6];
          // Shift the segment out along its own normal by half the stroke, so
          // the whole width of it lies beyond the cell.
          const mx = (ax + bx) / 2;
          const my = (ay + by) / 2;
          const out = BORDER_WIDTH / 2 / Math.hypot(mx, my);
          const line = document.createElementNS(SVG_NS, "line");
          line.setAttribute("x1", x + ax + mx * out);
          line.setAttribute("y1", y + ay + my * out);
          line.setAttribute("x2", x + bx + mx * out);
          line.setAttribute("y2", y + by + my * out);
          line.setAttribute("stroke-width", BORDER_WIDTH);
          line.setAttribute("class", `border border-${side}`);
          layer.appendChild(line);
        }
      }
    }
  }

  /**
   * The board itself: the rhombus of intersections, grown WOOD outwards on
   * every side. Drawn a half-bevel short of that and stroked back out to it,
   * so the same stroke rounds the two sharp corners and darkens the rim.
   */
  buildWood(layer) {
    const wood = document.createElementNS(SVG_NS, "polygon");
    wood.setAttribute("points", pointsOf(outline(this.size, WOOD - BEVEL / 2)));
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
      draw(center(0, i), center(last, i)); // a row, running flat
      draw(center(i, 0), center(i, last)); // a column, running down the slant
    }
    // The third family is where col + row is constant. Its two ends are the
    // acute corners of the board, where the line is a single point and there
    // is nothing to draw.
    for (let k = 1; k < 2 * last; k++) {
      const lo = Math.max(0, k - last);
      const hi = Math.min(last, k);
      draw(center(lo, k - lo), center(hi, k - hi));
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
      const { x, y } = center(col, row);
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
    for (const s of sides(this.size)) {
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
   * How far the drawing reaches past the outermost cell centres: out to the
   * side of the board a row label faces, and out to the top or bottom a column
   * label faces. Both are measured square on to the edge in question.
   *
   * A row label is then placed by stepping sideways, and `slant` is what that
   * step has to be multiplied by to cover the distance. A hexagon's flank is
   * vertical, so sideways is already square on and the factor is 1; the wooden
   * board's flank leans, so the same clearance costs a longer step.
   */
  reach() {
    return this.style === "hex"
      ? { flank: HALF_WIDTH + BORDER_WIDTH, end: 1 + BORDER_WIDTH, slant: 1 }
      : { flank: this.edge(), end: this.edge(), slant: 1 / HALF_WIDTH };
  }

  /**
   * How far past the outermost intersections the go-style drawing reaches,
   * square on to the edge: the wooden rim of a goban, and the far side of the
   * coloured band when there is no wood under it.
   */
  edge() {
    return this.style === "goban" ? WOOD : BAND + BORDER_WIDTH / 2;
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
   * Row labels are anchored by the edge facing the board, so that a wide "13'"
   * and a bare "7" stand off alike. Column labels stay centred, their
   * clearance being vertical.
   */
  layoutLabels(labels, board) {
    const bounds = { ...board };
    if (!labels.length) return grow(bounds, 0);

    for (const l of labels) {
      l.width = l.node.getComputedTextLength();
      l.ink = inkHalf(l.node);
    }
    const last = this.size - 1;
    const reach = this.reach();
    const pick = (side, line) =>
      labels.filter((l) => l.side === side && l.line === line);

    const placers = {
      left: (l, d) => spot(center(0, l.index), -d, 0, l, "end"),
      right: (l, d) => spot(center(last, l.index), d, 0, l, "start"),
      // Along the continuation of the column, so the line of labels runs
      // parallel to the sloping sides of the rhombus.
      top: (l, d) => spot(center(l.index, 0), -d * SLANT, -d, l, "middle"),
      bottom: (l, d) => spot(center(l.index, last), d * SLANT, d, l, "middle"),
    };

    for (const side of ["left", "right", "top", "bottom"]) {
      const inner = pick(side, 0);
      if (!inner.length) continue;
      const place = placers[side];
      const sideways = side === "left" || side === "right";

      // To the edge of the text for a row, to the edge of the ink for a column.
      const d = sideways
        ? (reach.flank + GAP) * reach.slant
        : reach.end + GAP + inner[0].ink;
      for (const l of inner) apply(l, place(l, d), bounds);

      const outer = pick(side, 1);
      if (!outer.length) continue;
      const step = sideways
        ? Math.max(...inner.map((l) => l.width)) + LINE_GAP
        : inner[0].ink + outer[0].ink + LINE_GAP;
      for (const l of outer) apply(l, place(l, d + step), bounds);
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

function grow(bounds, by) {
  return {
    minX: bounds.minX - by,
    maxX: bounds.maxX + by,
    minY: bounds.minY - by,
    maxY: bounds.maxY + by,
  };
}

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
 * the top, each with its own outward unit normal and its neighbours'. The edge
 * a side belongs to is named as outsideSide() names it.
 */
function sides(size) {
  const last = size - 1;
  const corners = [
    center(0, 0),
    center(last, 0),
    center(last, last),
    center(0, last),
  ];
  const normals = [
    [0, -1], // top
    [HALF_WIDTH, -0.5], // right
    [0, 1], // bottom
    [-HALF_WIDTH, 0.5], // left
  ];
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
  const k = d / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
  return { x: point.x + k * (n1[0] + n2[0]), y: point.y + k * (n1[1] + n2[1]) };
}

/** The rhombus of cell centres, grown `d` outwards on every side. */
function outline(size, d) {
  return sides(size).map((s) => pushed(s.a, s.before, s.normal, d));
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
