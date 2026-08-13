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

// Labels stand off the board by the same CLEARANCE on all four sides. A
// hexagon reaches 1 above and below its centre but only HALF_WIDTH to either
// side, so the row labels have to sit nearer their centres than the column
// labels do — measuring both from the centre instead is what made the row
// numbers crowd the board.
const CLEARANCE = 1.05;
const COL_LINE_1 = 1 + CLEARANCE;
const COL_LINE_2 = COL_LINE_1 + 1.3;
const ROW_LINE_1 = HALF_WIDTH + CLEARANCE;
const ROW_LINE_2 = ROW_LINE_1 + 1.8; // digits need more room side by side

const MARGIN_X = ROW_LINE_2 - HALF_WIDTH + 0.9;
const MARGIN_Y = COL_LINE_2 - 1 + 0.55; // clears the outer column line

// The board's coloured outline. It is drawn just outside the hexagons rather
// than centred on them, so it never runs across a stone on the edge.
const BORDER_WIDTH = 0.3;

// A column runs diagonally, gaining this much x per unit of y, so labels
// placed on the continuation of a column follow the slant of the rhombus.
const SLANT = Math.sqrt(3) / 3;
const BASELINE = 0.28; // drop from a label's centre to its baseline

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
    const minX = -HALF_WIDTH - MARGIN_X;
    const maxX = Math.sqrt(3) * (last + last / 2) + HALF_WIDTH + MARGIN_X;
    const minY = -1 - MARGIN_Y;
    const maxY = 1.5 * last + 1 + MARGIN_Y;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute(
      "viewBox",
      `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
    );
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
    this.buildLabels(labelLayer);

    this.svg = svg;
    this.container.replaceChildren(svg);
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

  buildLabels(layer) {
    if (this.labels === "none") return;
    const { size } = this;
    const relative = this.labels === "relative";

    if (!relative) {
      for (let col = 0; col < size; col++) {
        text(layer, ...above(col, 0, COL_LINE_1), standard(col, 0)[0], "axis");
        text(
          layer,
          ...below(col, size - 1, COL_LINE_1),
          standard(col, 0)[0],
          "axis",
        );
      }
      for (let row = 0; row < size; row++) {
        const left = center(0, row);
        const right = center(size - 1, row);
        text(
          layer,
          left.x - ROW_LINE_1,
          left.y + BASELINE,
          `${row + 1}`,
          "axis",
        );
        text(
          layer,
          right.x + ROW_LINE_1,
          right.y + BASELINE,
          `${row + 1}`,
          "axis",
        );
      }
      return;
    }

    // Every row and column has two names, one per edge of its axis. Both go on
    // both sides: the nearer-edge one against the board, running 1 up to about
    // half the size and back down, and the other-edge one outside it, quieter.
    for (let col = 0; col < size; col++) {
      const d = distances(col, 0, size);
      const { inner, outer } = scalePair(d.blue, d.bluePrime);
      text(layer, ...above(col, 0, COL_LINE_1), inner, "axis-blue");
      text(layer, ...above(col, 0, COL_LINE_2), outer, "axis-blue axis-alt");
      text(layer, ...below(col, size - 1, COL_LINE_1), inner, "axis-blue");
      text(
        layer,
        ...below(col, size - 1, COL_LINE_2),
        outer,
        "axis-blue axis-alt",
      );
    }

    for (let row = 0; row < size; row++) {
      const left = center(0, row);
      const right = center(size - 1, row);
      const d = distances(0, row, size);
      const { inner, outer } = scalePair(d.red, d.redPrime);
      text(layer, left.x - ROW_LINE_1, left.y + BASELINE, inner, "axis-red");
      text(
        layer,
        left.x - ROW_LINE_2,
        left.y + BASELINE,
        outer,
        "axis-red axis-alt",
      );
      text(layer, right.x + ROW_LINE_1, right.y + BASELINE, inner, "axis-red");
      text(
        layer,
        right.x + ROW_LINE_2,
        right.y + BASELINE,
        outer,
        "axis-red axis-alt",
      );
    }
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
        cell.label.setAttribute("y", digitBaseline(cell.label));
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

// Half the cap height is what puts a digit's ink on the centre of a stone:
// a font's ascent and descent reserve room for accents and descenders that
// digits never use, so dominant-baseline sits a little high. CSS spells the
// right offset 0.5cap, but Chromium floors the cap unit to 1px and these
// labels are 0.72 user units tall, so the cap height is measured instead.
let capHalf = null;

function digitBaseline(label) {
  if (capHalf === null) {
    const style = getComputedStyle(label);
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = `${style.fontWeight} 1000px ${style.fontFamily}`;
    const ink = ctx.measureText("0");
    const half =
      (ink.actualBoundingBoxAscent - ink.actualBoundingBoxDescent) / 2000;
    capHalf = (half || 0.367) * parseFloat(style.fontSize);
  }
  return capHalf;
}

/**
 * A point `gap` beyond the board above column `col`, on the continuation of
 * that column, so the label lines run parallel to the sides of the rhombus.
 * Returns [x, y] ready to spread into text().
 */
function above(col, row, gap) {
  const { x, y } = center(col, row);
  return [x - gap * SLANT, y - gap + BASELINE];
}

/** The same, below the board. */
function below(col, row, gap) {
  const { x, y } = center(col, row);
  return [x + gap * SLANT, y + gap + BASELINE];
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

function text(parent, x, y, content, className) {
  const node = document.createElementNS(SVG_NS, "text");
  node.setAttribute("x", x);
  node.setAttribute("y", y);
  node.setAttribute("class", className);
  node.textContent = content;
  parent.appendChild(node);
  return node;
}
