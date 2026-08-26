import { HexBoard } from "./board.js";
import { parse, relative, standard, variants } from "./mason.js";
import { formatHash, parseHash } from "./url.js";

const DEFAULT_SIZE = 13;
const MAX_SIZE = 53; // hexworld refuses anything larger too

// The diagram from the wiki page, so the naming can be checked at a glance.
const WIKI_EXAMPLE = "#13n,d10j9d5j4c2b5b8";

const el = (id) => document.getElementById(id);
const ui = {
  board: el("board"),
  size: el("size"),
  labels: el("labels"),
  style: el("style"),
  numbers: el("numbers"),
  mode: el("mode"),
  pass: el("pass"),
  swap: el("swap"),
  first: el("first"),
  prev: el("prev"),
  next: el("next"),
  last: el("last"),
  clear: el("clear"),
  example: el("example"),
  share: el("share"),
  coord: el("coord"),
  standard: el("standard"),
  variants: el("variants"),
  cellForm: el("cell-form"),
  names: el("names"),
  cellError: el("coord-error"),
  moves: el("moves"),
  status: el("status"),
};

const main = document.querySelector("main");

const board = new HexBoard(ui.board, {
  size: DEFAULT_SIZE,
  labels: "relative",
  onHover: (cell) => showReadout(cell ?? lastTouched),
  onSelect: (cell, event) => placeStone(cell, event),
});

let lastTouched = null;
let note = ""; // what an imported link carried that could not be shown

function nextColour(event) {
  const forced = ui.mode.value;
  if (event && (event.type === "contextmenu" || event.shiftKey)) return null; // erase
  if (forced === "erase") return null;
  if (forced !== "alternate") return forced;
  return board.toPlay();
}

function placeStone(cell, event) {
  lastTouched = cell;
  // The mark says which cell the panel below is naming, so a tap leaves one
  // whatever the tap did to the position. On a touch screen it is the only
  // thing on the board that says where the answer came from.
  board.mark(cell);
  note = "";
  // Touch devices have no hover, so "inspect" is the way to read a cell's name
  // without disturbing the position.
  if (ui.mode.value === "inspect") {
    refresh();
    return;
  }

  const colour = nextColour(event);
  const occupied = board.stoneAt(cell.col, cell.row);
  // Only erasing takes a stone off. While alternating, an occupied cell is
  // simply not playable and a click on one does nothing; with a colour forced,
  // it may be overwritten with the other colour, for setting positions up.
  const forced = ui.mode.value === "red" || ui.mode.value === "blue";
  if (colour === null) {
    if (occupied) board.play(cell.col, cell.row, null);
  } else if (!occupied || (forced && colour !== occupied)) {
    board.play(cell.col, cell.row, colour);
  }
  refresh();
}

/** Everything that has to follow a change of position or board size. */
function refresh() {
  ui.swap.disabled = !board.canSwap();
  renderMoves();
  renderStatus();
  showReadout(lastTouched);
  writeHash();
  // Last, because how much room is left for the board depends on how much of
  // the panel under it has to stay in sight.
  fitBoard();
}

/**
 * Name the cell. The field the name is printed in is also where a coordinate
 * is typed to be shown one, so it is left alone while it holds the caret: the
 * pointer crossing the board would otherwise rub out what is being typed.
 */
function showReadout(cell) {
  const known = cell && cell.col < board.size && cell.row < board.size;
  const size = board.size;
  const canonical = known ? relative(cell.col, cell.row, size) : "";
  if (document.activeElement !== ui.coord) ui.coord.value = canonical;
  ui.standard.textContent = known ? standard(cell.col, cell.row) : "";
  // The cell's other three names, this one being printed above them already.
  // What each counts from is a tooltip.
  ui.variants.innerHTML = known
    ? variants(cell.col, cell.row, size)
        .filter((v) => v.text !== canonical)
        .map(
          (v) =>
            `<li title="${v.y} from ${v.yEdge}, ${v.x} from ${v.xEdge}">${v.text}</li>`,
        )
        .join("")
    : "";
}

/** The stone list doubles as the history: every row is a position to jump to. */
function renderMoves() {
  if (!board.moves.length) {
    ui.moves.innerHTML = `<p class="placeholder">—</p>`;
    return;
  }
  const row = (n, inner) =>
    `<tr class="state${n === board.cursor ? " is-current" : ""}${
      n > board.cursor ? " is-future" : ""
    }" data-n="${n}" tabindex="0">${inner}</tr>`;

  const rows = [
    row(0, `<td class="num">0</td><td></td><td colspan="2">empty board</td>`),
    ...board.moves.map((m, i) =>
      row(
        i + 1,
        `<td class="num">${i + 1}</td>
         <td><span class="dot dot-${m.color}"></span></td>` +
          (m.type === "move"
            ? `<td class="coord-small">${relative(m.col, m.row, board.size)}</td>
               <td class="standard-small">${standard(m.col, m.row)}</td>`
            : `<td colspan="2" class="turn">${m.type}</td>`),
      ),
    ),
  ].join("");

  ui.moves.innerHTML = `<table class="movelist">
    <thead><tr><th></th><th></th><th>relative</th><th>standard</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

/**
 * The two colours, in the vocabulary the board is currently drawn in. A
 * go-style board has no red or blue on it to name, so the winner is named by
 * the stones that are there and by the pair of sides they joined, and the
 * toolbar offers black and white to place.
 *
 * Only what is printed changes. The values behind the placing options stay
 * `red` and `blue`, since that is what the cells, the history and the URL call
 * them whichever way the board is drawn.
 */
const WON = {
  hex: {
    red: "Red has connected red to red'.",
    blue: "Blue has connected blue to blue'.",
  },
  stones: {
    red: "Black has connected top to bottom.",
    blue: "White has connected left to right.",
  },
};

const PLACING = {
  hex: { red: "red only", blue: "blue only" },
  stones: { red: "black only", blue: "white only" },
};

function renderStatus() {
  const path = board.winningPath();
  if (!path.length) {
    ui.status.textContent = note;
    ui.status.className = note ? "status status-note" : "status";
    return;
  }
  const colour = board.stoneAt(path[0].col, path[0].row);
  ui.status.textContent = WON[vocabulary()][colour];
  ui.status.className = `status status-${colour}`;
}

const vocabulary = () => (board.style === "hex" ? "hex" : "stones");

/**
 * Switch the drawing, and the page along with it: the toolbar, the stone list
 * and the win message say red and blue beside the hexagons, and black and
 * white beside a board that has no red or blue on it.
 */
function setStyle(mode) {
  document.body.dataset.style = mode;
  // The panels only care whether the board is go-style at all, so they hang
  // off this rather than off the name of the drawing. Naming each one in the
  // stylesheet leaves a rule to forget every time another is added.
  document.body.toggleAttribute("data-dual", mode !== "hex");
  board.setStyle(mode);
  for (const [value, text] of Object.entries(PLACING[vocabulary()])) {
    ui.mode.querySelector(`option[value="${value}"]`).textContent = text;
  }
  fitBoard();
  renderStatus();
}

// --- how much room the board has ------------------------------------------

/**
 * Fit the board, and stand the answer where the board it drew leaves room.
 *
 * The two settle each other: what has to stay under the board says how much
 * room the board has, and how big the board comes out says whether its corner
 * will hold the answer. So it is run to a standstill rather than in one go —
 * two passes in practice, the third only if a board that changed the way round
 * it lies changed its corner with it.
 */
function fitBoard() {
  for (let pass = 0; pass < 3; pass++) {
    fitOnce();
    if (!placeAnswer()) return;
  }
}

/**
 * Which way round to draw the board, and how tall it may be.
 *
 * The two drawings are the same board in the same box, lying down and stood on
 * its end, so which of them to use is not a question about the device but
 * about the space left for the board: whichever way that space leans, one of
 * them fills it and the other wastes most of it. Both are measured — the box
 * here, the drawings in `board.shape()` — because their shapes are not quite
 * each other's transposed and the answer near the turn depends on the
 * difference, which on a phone held upright is where the answer usually is.
 *
 * Where the page is one column the script says how tall the board may be, both
 * ways round, since the same measurement is what the choice was made on. Beside
 * the panel rather than under it there is nothing to measure and the cap is the
 * stylesheet's own.
 */
function fitOnce() {
  const svg = ui.board.querySelector("svg");
  if (!svg) return;
  // Measure before writing. Clearing last time's cap first is the obvious move,
  // and it makes every tap and every resize force a layout of some thousands of
  // SVG elements. It also buys nothing: the cap is a `max-height` on an SVG
  // whose width is a percentage, so it letterboxes the drawing rather than
  // narrowing it, and it moves the foot of the board and everything under it
  // together, leaving the gap `roomForBoard` measures where it was.
  const width = svg.getBoundingClientRect().width;
  const room = roomForBoard(svg);
  const cap = maxHeight(svg);
  board.fitInto(width, room ?? cap);
  if (room !== null) ui.board.style.setProperty("--board-room", `${room}px`);
}

/**
 * Where the cell's names stand: the empty corner of the drawing, or under the
 * board.
 *
 * A rhombus leaves two corners of its box with nothing in them, and what the
 * page has to say about a cell is four short names, so where there is room it
 * all goes in the top right one and nothing stands under the board at all.
 * Where there is not — a small screen and a large board — it goes back
 * underneath.
 *
 * The sizes are the size the page prints it at, three quarters of that, and
 * five eighths.
 */
const ANSWER_SIZES = [1, 0.78, 0.62];

// Daylight between the block and the drawing it stands in the corner of.
const CLEAR = 8;

/**
 * The drawing's own rectangle inside the box it was given. It keeps its shape
 * and centres itself in whatever is left, so on a board bound by its height
 * the box runs well past the ink on both sides — and the corner the block
 * stands in is the drawing's, not the box's, or it floats away from the board
 * on exactly the screens that have room to spare.
 */
function drawnBox() {
  const svg = ui.board.querySelector("svg");
  const box = svg.getBoundingClientRect();
  const view = svg.viewBox.baseVal;
  const scale = Math.min(box.width / view.width, box.height / view.height);
  const slackX = (box.width - view.width * scale) / 2;
  const slackY = (box.height - view.height * scale) / 2;
  return {
    top: box.top + slackY,
    right: box.right - slackX,
    width: box.width - 2 * slackX,
  };
}

/**
 * How far the drawing's ink keeps clear of the right edge of its box, down to
 * this depth: how wide a block may stand in that corner.
 *
 * Bounding boxes will not answer this, and believing them cost this page the
 * whole idea once. The coloured edges are one polygon per flank, running
 * diagonally, so the box of a single band covers the entire corner and reports
 * no room where there is most of it. They are measured by their own outline
 * instead. Nothing else needs it: the labels are lines of text, the wood is a
 * box of a polygon either way round, and the hexagons and the stones sit
 * inside the outline that has already been asked.
 */
function cornerRoom(depth) {
  const svg = ui.board.querySelector("svg");
  const drawn = drawnBox();
  const bottom = drawn.top + depth;
  let reach = drawn.right - drawn.width;
  for (const text of svg.querySelectorAll(".labels text")) {
    const ink = text.getBoundingClientRect();
    if (ink.top < bottom) reach = Math.max(reach, ink.right);
  }
  // The wood the goban is drawn on leans the same way the bands do, so it is
  // taken by its outline too.
  for (const outline of svg.querySelectorAll(
    "polygon.band, polygon.border, polygon.wood",
  )) {
    reach = Math.max(reach, rightmostIn(outline, drawn.top, bottom));
  }
  return drawn.right - reach;
}

/** How far right a polygon's outline reaches between two heights on screen. */
function rightmostIn(polygon, top, bottom) {
  const matrix = polygon.getScreenCTM();
  const points = [...polygon.points].map((point) =>
    point.matrixTransform(matrix),
  );
  let reach = -Infinity;
  for (const [index, from] of points.entries()) {
    const to = points[(index + 1) % points.length];
    if (from.y >= top && from.y <= bottom) reach = Math.max(reach, from.x);
    // An edge that leaves the band counts where it crosses out of it.
    for (const y of [top, bottom]) {
      if ((from.y - y) * (to.y - y) < 0) {
        reach = Math.max(
          reach,
          from.x + ((to.x - from.x) * (y - from.y)) / (to.y - from.y),
        );
      }
    }
  }
  return reach;
}

/**
 * Stand the cell's names in the corner if they fit there, and under the
 * drawing if they do not. Says whether that answer changed.
 *
 * They stay in the board's own card either way, so the fallback reads as the
 * drawing's own caption rather than as something adrift under it.
 */
function placeAnswer() {
  if (!ui.board.querySelector("svg")) return false;
  // Not while the field holds the caret: moving it in the DOM drops the focus,
  // and on a phone the keyboard with it, in the middle of typing a coordinate.
  if (document.activeElement === ui.coord) return false;
  const was = document.body.hasAttribute("data-corner");
  // Asked in the layout the corner would give, not the one it is in: standing
  // the block out there is what leaves the board the width the panel beside it
  // was taking, and a wider board has a wider corner. Asked the other way
  // round, a board that had once fallen back could never climb out again.
  document.body.toggleAttribute("data-corner", true);
  ui.names.style.cssText = "";
  ui.board.appendChild(ui.names);
  const block = ui.names.getBoundingClientRect();
  // Room for the block and the daylight round it, both ways.
  const scale = ANSWER_SIZES.find(
    (size) =>
      cornerRoom(block.height * size + CLEAR) >= block.width * size + CLEAR,
  );
  document.body.toggleAttribute("data-corner", Boolean(scale));
  if (scale) {
    ui.names.style.fontSize = `${scale}rem`;
    // Set against the drawing's own corner. A box is positioned against the
    // card's padding box, which is the border away from where the card is
    // measured from.
    const card = ui.board.getBoundingClientRect();
    const border = ui.board.clientTop;
    const drawn = drawnBox();
    ui.names.style.top = `${drawn.top - card.top - border + CLEAR}px`;
    ui.names.style.right = `${card.right - drawn.right - border + CLEAR}px`;
  }
  return Boolean(scale) !== was;
}

/** The stylesheet's cap on the board, `none` counting as no cap at all. */
function maxHeight(svg) {
  return parseFloat(getComputedStyle(svg).maxHeight) || Infinity;
}

/**
 * How tall the board may be, or null where the stylesheet's own cap stands.
 *
 * What has to fit on the screen is the board and the answer to a tap, and not
 * a pixel more: the heading and the toolbar are above the board and the reader
 * can put them off the top of the screen by scrolling, so what they take is
 * not taken from the board. So the room is the screen less what has to stay
 * under the board — which is why a phone gets a board taller than the space
 * the page happens to leave it, and is scrolled to.
 *
 * Everything between the foot of the board and the foot of that answer is laid
 * out already and does not depend on how tall the board is, so measuring it
 * settles the cap in one go. The stylesheet is asked whether the page is one
 * column or two, rather than the breakpoint being written down here as well:
 * beside the board rather than under it, the panel keeps its own place and the
 * board is left to the stylesheet.
 */
/**
 * The height of the viewport that a phone's URL bar does not move.
 *
 * `innerHeight` is not it: the bar slides away as you scroll down and comes
 * back as you scroll up, `innerHeight` follows it, and a resize fires each
 * time — which is why the board was turning over mid-scroll on a screen near
 * the size where the decision is close. The layout viewport does not move with
 * the bar, and `svh` is that viewport at its smallest, the bar showing. That is
 * the one to fit the board in: it is the screen the reader is promised whatever
 * the bar is doing, and the bar is out whenever they have just scrolled up to
 * the top.
 */
function steadyHeight() {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:100svh;visibility:hidden";
  document.body.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  // Where svh is not understood the declaration is dropped and the div has no
  // height; there `innerHeight` is the best on offer and the bar is a phone's
  // problem, not that browser's.
  return height || innerHeight;
}

function roomForBoard(svg) {
  // The answer itself, rather than the whole panel: the other names of the
  // cell sit under it and can wait for a scroll. It is also the one part whose
  // height does not depend on what has been tapped, so the board keeps still.
  const columns = getComputedStyle(main).gridTemplateColumns.split(" ").length;
  if (columns > 1) return null;
  const box = svg.getBoundingClientRect();
  // Standing in the board's own corner it is above the foot of the board and
  // takes nothing from it, and the board may have the whole screen.
  const below = Math.max(
    0,
    ui.cellForm.getBoundingClientRect().bottom - box.bottom,
  );
  const room = steadyHeight() - below;
  // A screen with no room for the answer at all leaves nothing to measure
  // against, and a cap of nothing would draw a board of nothing.
  return room > 0 ? room : null;
}

/**
 * How wide the name field stands: the longest name this board can print, in
 * digit widths. Wide enough never to clip and no wider, and the same width
 * whatever is in it, so the standard name beside it keeps still while the
 * pointer crosses the board.
 *
 * Measured off the notation rather than worked out from the size, since which
 * cell has the longest name is not obvious — on 53x53 it is 10'-26', which is
 * neither the centre nor a corner.
 */
function fitField(size) {
  let widest = 3; // the placeholder, on a board too small to need more
  for (let col = 0; col < size; col++) {
    for (let row = 0; row < size; row++) {
      widest = Math.max(widest, relative(col, row, size).length);
    }
  }
  ui.coord.style.width = `${widest}ch`;
  // The standard name beside it is held to its own longest, which is the far
  // corner: the last column is the longest word and the last row the longest
  // number. Both held, the line is the same width whatever is in it, so it
  // does not shuffle about under a moving pointer, and the corner it may be
  // asked to stand in is measured against the widest it will ever be.
  ui.standard.style.minWidth = `${standard(size - 1, size - 1).length}ch`;
}

function setSize(size) {
  const clean = Math.max(
    2,
    Math.min(MAX_SIZE, Math.round(size) || DEFAULT_SIZE),
  );
  ui.size.value = clean;
  fitField(clean);
  board.setSize(clean);
  lastTouched = null;
  note = "";
  refresh();
}

// --- URL state ------------------------------------------------------------

function writeHash() {
  history.replaceState(
    null,
    "",
    formatHash({
      size: board.size,
      moves: board.moves,
      cursor: board.cursor,
      numbers: ui.numbers.checked,
    }),
  );
}

function readHash(hash) {
  return parseHash(hash, MAX_SIZE);
}

function load(state) {
  ui.size.value = state.size;
  ui.numbers.checked = state.numbers;
  fitField(state.size);
  board.setSize(state.size);
  board.setShowNumbers(state.numbers);
  board.setMoves(state.moves, state.cursor);
  lastTouched = null;
  // Say so when a link carried something this board cannot show, rather than
  // opening a position that quietly differs from the one that was shared.
  note = state.ignored?.length
    ? `Imported without hexworld's ${list(state.ignored)}.`
    : "";
  refresh();
}

function list(items) {
  return items.length < 2
    ? items[0]
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// --- wiring ---------------------------------------------------------------

ui.size.addEventListener("change", () => setSize(Number(ui.size.value)));
ui.labels.addEventListener("change", () => board.setLabels(ui.labels.value));
ui.style.addEventListener("change", () => setStyle(ui.style.value));
ui.numbers.addEventListener("change", () => {
  board.setShowNumbers(ui.numbers.checked);
  writeHash();
});
const step = (method) => () => {
  board[method]();
  refresh();
};
const act = (method) => () => {
  board[method]();
  note = "";
  refresh();
};
ui.pass.addEventListener("click", act("pass"));
ui.swap.addEventListener("click", act("swap"));
ui.first.addEventListener("click", step("first"));
ui.prev.addEventListener("click", step("prev"));
ui.next.addEventListener("click", step("next"));
ui.last.addEventListener("click", step("last"));

ui.moves.addEventListener("click", (event) => {
  const row = event.target.closest("tr.state");
  if (!row) return;
  board.goto(Number(row.dataset.n));
  refresh();
});
ui.clear.addEventListener("click", () => {
  board.clear();
  lastTouched = null;
  note = "";
  refresh();
});
ui.example.addEventListener("click", () => load(readHash(WIKI_EXAMPLE)));

ui.share.addEventListener("click", async () => {
  writeHash();
  try {
    await navigator.clipboard.writeText(location.href);
    ui.share.textContent = "Link copied";
  } catch {
    ui.share.textContent = "Copy from the address bar";
  }
  setTimeout(() => (ui.share.textContent = "Copy link"), 1800);
});

ui.cellForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const cell = parse(ui.coord.value, board.size);
  if (!cell) {
    ui.cellError.textContent = `Not a coordinate on a ${board.size}x${board.size} board.`;
    board.mark(null);
    return;
  }
  ui.cellError.textContent = "";
  board.mark(cell);
  lastTouched = cell;
  // On a phone the keyboard is standing on the board that is about to be
  // pointed at, and the answer is behind it.
  ui.coord.blur();
  showReadout(cell);
});

// Whatever was left in the field, the cell the board is showing is the answer.
ui.coord.addEventListener("blur", () => {
  ui.cellError.textContent = "";
  showReadout(lastTouched);
});

const KEYS = {
  ArrowLeft: "prev",
  ArrowRight: "next",
  Home: "first",
  End: "last",
};

document.addEventListener("keydown", (event) => {
  if (event.target.matches("input, select, textarea")) return;
  const method = KEYS[event.key];
  if (!method) return;
  event.preventDefault();
  board[method]();
  refresh();
});

// The room left for the board changes with the window, and on a phone with
// the address bar sliding in and out, so this runs often; it is a measurement
// and two style reads unless the answer has actually changed.
let fitting = null;
window.addEventListener("resize", () => {
  cancelAnimationFrame(fitting);
  fitting = requestAnimationFrame(fitBoard);
});

window.addEventListener("hashchange", () => open(location.hash));

/**
 * Show whatever a fragment describes. An unreadable one leaves the board as
 * it is and says so, rather than quietly showing something else.
 */
function open(hash) {
  const state = readHash(hash);
  if (state) {
    load(state);
    return;
  }
  note = "That link could not be read.";
  refresh();
}

setStyle(ui.style.value);

if (location.hash) {
  open(location.hash);
} else {
  load({ size: DEFAULT_SIZE, moves: [], cursor: 0, numbers: true });
}
