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
  readout: el("readout"),
  goto: el("goto"),
  gotoForm: el("goto-form"),
  gotoError: el("goto-error"),
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
  board.mark(null);
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

function showReadout(cell) {
  if (!cell || cell.col >= board.size || cell.row >= board.size) {
    // Holding the answer's own line, rather than a shorter one: on a phone the
    // board is given the room this panel does not need, and a panel that grows
    // when tapped would take it back from under the board it was tapped on.
    ui.readout.innerHTML = `<div class="readout-main">
      <span class="coord placeholder">—</span>
    </div>`;
    return;
  }
  const { col, row } = cell;
  const size = board.size;
  const canonical = relative(col, row, size);

  // The four names go in a row; what each one counts from is a tooltip.
  ui.readout.innerHTML = `
    <div class="readout-main">
      <span class="coord">${canonical}</span>
      <span class="standard">${standard(col, row)}</span>
    </div>
    <ul class="variants">
      ${variants(col, row, size)
        .map(
          (v) => `<li class="${v.text === canonical ? "is-canonical" : ""}"
            title="${v.y} from ${v.yEdge}, ${v.x} from ${v.xEdge}">${v.text}</li>`,
        )
        .join("")}
    </ul>`;
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
 * Which way round to draw the board, and how tall it may be.
 *
 * The two drawings are the same board in the same box, lying down and stood on
 * its end, so their shapes are each other's transposed: three to two against
 * two to three. Which of them to use is therefore not a question about the
 * device but about the space left for the board — whichever way that space
 * leans, one of them fills it and the other wastes most of it — so it is
 * measured rather than asked.
 *
 * Nothing changes unless the board actually stands up: the cap is the
 * stylesheet's own until then.
 */
function fitBoard() {
  const svg = ui.board.querySelector("svg");
  if (!svg) return;
  ui.board.style.removeProperty("--board-room");
  const width = svg.getBoundingClientRect().width;
  const room = roomForBoard(svg);
  if (room > width) {
    ui.board.style.setProperty("--board-room", `${room}px`);
    board.setOrientation("tall");
  } else {
    board.setOrientation("wide");
  }
}

/**
 * How tall the board may be. Beside the Cell panel that is whatever the
 * stylesheet allows; under it — which is where a phone puts it — the board may
 * have the rest of the screen but not the panel's own place on it, since the
 * panel is where a tap's answer appears and a tap that scrolls its own answer
 * out of sight is no use.
 *
 * Everything between the foot of the board and the foot of the panel is laid
 * out already and does not depend on how tall the board is, so measuring it
 * settles the cap in one go. The stylesheet is asked whether the page is one
 * column or two, rather than the breakpoint being written down here as well.
 */
/**
 * The height of the viewport that a phone's URL bar does not move.
 *
 * `innerHeight` is not it: the bar slides away as you scroll down and comes
 * back as you scroll up, `innerHeight` follows it, and a resize fires each
 * time — which is why the board was turning over mid-scroll on a screen near
 * the size where the decision is close. The layout viewport does not move with
 * the bar, and `svh` is that viewport at its smallest, the bar showing. That
 * is also the one the Cell panel has to fit in, since the page is at the top
 * and the bar is out when a tap has to be answered without scrolling.
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
  // `none`, should the stylesheet ever stop capping it, is no cap at all.
  const cap = parseFloat(getComputedStyle(svg).maxHeight) || Infinity;
  // The answer itself, rather than the whole panel: the other names of the
  // cell sit under it and can wait for a scroll. It is also the one part whose
  // height does not depend on what has been tapped, so the board keeps still.
  const answer = document.querySelector(".side .card .readout-main");
  const columns = getComputedStyle(main).gridTemplateColumns.split(" ").length;
  if (columns > 1 || !answer) return cap;
  const box = svg.getBoundingClientRect();
  const below = answer.getBoundingClientRect().bottom - box.bottom;
  return Math.min(cap, steadyHeight() - (box.top + scrollY) - below);
}

function setSize(size) {
  const clean = Math.max(
    2,
    Math.min(MAX_SIZE, Math.round(size) || DEFAULT_SIZE),
  );
  ui.size.value = clean;
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

ui.gotoForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const cell = parse(ui.goto.value, board.size);
  if (!cell) {
    ui.gotoError.textContent = `Not a coordinate on a ${board.size}x${board.size} board.`;
    board.mark(null);
    return;
  }
  ui.gotoError.textContent = "";
  board.mark(cell);
  lastTouched = cell;
  showReadout(cell);
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
