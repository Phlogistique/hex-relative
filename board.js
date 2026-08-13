/**
 * A small SVG Hex board.
 *
 * Pointy-top hexagons laid out in a rhombus, in the orientation HexWiki uses:
 * red joins the top and bottom edges, blue joins the left and right ones, and
 * the bottom red edge is the one we take our bearings from.
 */
import { distances, standard } from "./mason.js";

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

  /** The moves actually on the board: everything up to the cursor. */
  visible() {
    return this.moves.slice(0, this.cursor);
  }

  stoneAt(col, row) {
    const move = this.visible().find((m) => m.col === col && m.row === row);
    return move ? move.color : null;
  }

  /**
   * Place or remove a stone. Editing while rewound throws away the moves that
   * were ahead, which is the usual way a variation replaces a line.
   */
  play(col, row, color) {
    this.moves = this.visible().filter(
      (m) => !(m.col === col && m.row === row),
    );
    if (color) this.moves.push({ col, row, color });
    this.cursor = this.moves.length;
    this.paint();
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
    this.moves = this.moves.filter((m) => m.col < size && m.row < size);
    this.cursor = Math.min(this.cursor, this.moves.length);
    this.render();
  }

  setLabels(mode) {
    this.labels = mode;
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
    // The board itself, outside edge of the border included.
    const board = {
      minX: -HALF_WIDTH - BORDER_WIDTH,
      maxX: Math.sqrt(3) * (last + last / 2) + HALF_WIDTH + BORDER_WIDTH,
      minY: -1 - BORDER_WIDTH,
      maxY: 1.5 * last + 1 + BORDER_WIDTH,
    };

    const svg = document.createElementNS(SVG_NS, "svg");
    setViewBox(svg, board);
    svg.setAttribute("class", "hex-board");
    svg.setAttribute("role", "grid");
    svg.setAttribute("aria-label", `Hex board, ${size} by ${size}`);

    const cellLayer = group(svg, "cells");
    const edgeLayer = group(svg, "edges");
    const labelLayer = group(svg, "labels");

    this.cells = new Map();
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        cellLayer.appendChild(this.buildCell(col, row));
      }
    }
    this.buildEdges(edgeLayer);
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
    stone.setAttribute("r", 0.78);
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
    this.outline = [];
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
          this.outline.push({
            x1: x + ax + mx * out,
            y1: y + ay + my * out,
            x2: x + bx + mx * out,
            y2: y + by + my * out,
            half: BORDER_WIDTH / 2,
          });
        }
      }
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
        const letter = standard(col, 0)[0];
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
   * Place the labels a measured GAP clear of the board's outline, the second
   * line LINE_GAP clear of the first, then report what the drawing spans.
   *
   * A fixed offset will not do it. Row labels are anchored by the edge facing
   * the board so a wide "13'" and a bare "7" stand off alike, but the sides of
   * the board are a staircase and the top and bottom a zigzag, so the nearest
   * piece of outline is often not the one directly opposite — it is the step
   * above, or a point the label happens to reach over. So the offset for each
   * line is solved for: place, measure the worst clearance in the line, move
   * out by the shortfall, repeat. It settles in a couple of rounds.
   */
  layoutLabels(labels, board) {
    const bounds = { ...board };
    if (!labels.length) return grow(bounds, 0);

    for (const l of labels) {
      l.width = l.node.getComputedTextLength();
      l.ink = inkHalf(l.node);
    }
    const last = this.size - 1;
    const pick = (side, line) =>
      labels.filter((l) => l.side === side && l.line === line);

    // Where a label lands for a given offset, and the box its ink occupies.
    const placers = {
      left: (l, d) => {
        const c = center(0, l.index);
        return spot(c.x - d, c.y, l, "end");
      },
      right: (l, d) => {
        const c = center(last, l.index);
        return spot(c.x + d, c.y, l, "start");
      },
      top: (l, d) => {
        const c = center(l.index, 0);
        return spot(c.x - d * SLANT, c.y - d, l, "middle");
      },
      bottom: (l, d) => {
        const c = center(l.index, last);
        return spot(c.x + d * SLANT, c.y + d, l, "middle");
      },
    };

    for (const side of ["left", "right", "top", "bottom"]) {
      const inner = pick(side, 0);
      if (!inner.length) continue;
      const place = placers[side];

      let d = HALF_WIDTH + BORDER_WIDTH + GAP;
      for (let round = 0; round < 5; round++) {
        const worst = Math.min(
          ...inner.map((l) => this.clearance(place(l, d).box)),
        );
        d += GAP - worst;
      }
      for (const l of inner) apply(l, place(l, d), bounds);

      const outer = pick(side, 1);
      if (!outer.length) continue;
      // Sideways for the rows, since they are anchored edge to edge; upwards
      // for the columns, which are centred and stack.
      const step =
        side === "left" || side === "right"
          ? Math.max(...inner.map((l) => l.width)) + LINE_GAP
          : inner[0].ink + outer[0].ink + LINE_GAP;
      for (const l of outer) apply(l, place(l, d + step), bounds);
    }
    return grow(bounds, PAD);
  }

  /** How far a box is from the nearest piece of the board's outline. */
  clearance(box) {
    let least = Infinity;
    for (const seg of this.outline) {
      least = Math.min(least, boxToSegment(box, seg) - seg.half);
    }
    return least;
  }

  /** Repaint stones, move numbers and highlights without rebuilding the SVG. */
  paint() {
    for (const { hex, stone, label } of this.cells.values()) {
      stone.setAttribute("class", "stone hidden");
      label.textContent = "";
      hex.setAttribute("class", "hex");
    }

    this.visible().forEach((move, index) => {
      const cell = this.cells.get(this.key(move.col, move.row));
      if (!cell) return;
      const isLast = index === this.cursor - 1;
      cell.stone.setAttribute(
        "class",
        `stone stone-${move.color}${isLast ? " stone-last" : ""}`,
      );
      if (this.showNumbers) {
        cell.label.setAttribute("y", inkHalf(cell.label));
        cell.label.textContent = String(index + 1);
        cell.label.setAttribute("class", `stone-label on-${move.color}`);
      }
    });

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
    const owner = new Map(
      this.visible().map((m) => [this.key(m.col, m.row), m.color]),
    );
    const start = [];
    for (let i = 0; i < size; i++) {
      const cell = color === "red" ? { col: i, row: 0 } : { col: 0, row: i };
      if (owner.get(this.key(cell.col, cell.row)) === color) start.push(cell);
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
        if (from.has(key) || owner.get(key) !== color) continue;
        from.set(key, cell);
        queue.push(next);
      }
    }
    return [];
  }
}

/** Where a label sits, and the box its ink occupies there. */
function spot(x, centreY, l, anchor) {
  const from =
    anchor === "end" ? x - l.width : anchor === "start" ? x : x - l.width / 2;
  return {
    x,
    y: centreY + l.ink,
    anchor,
    box: [from, centreY - l.ink, from + l.width, centreY + l.ink],
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

/** Distance between an axis-aligned box and a line segment, 0 if they meet. */
function boxToSegment([x0, y0, x1, y1], seg) {
  const corners = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  let least = Infinity;
  for (const [px, py] of corners) {
    least = Math.min(least, pointToSegment(px, py, seg));
  }
  for (const [px, py] of [
    [seg.x1, seg.y1],
    [seg.x2, seg.y2],
  ]) {
    const dx = Math.max(x0 - px, 0, px - x1);
    const dy = Math.max(y0 - py, 0, py - y1);
    least = Math.min(least, Math.hypot(dx, dy));
  }
  return least;
}

function pointToSegment(px, py, { x1, y1, x2, y2 }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len
    ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len))
    : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
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
