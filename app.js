import { HexBoard } from "./board.js";
import { parse, relative, standard, variants } from "./mason.js";
import { formatHash, parseHash } from "./url.js";

const DEFAULT_SIZE = 13;
const MAX_SIZE = 26;

// The diagram from the wiki page, so the naming can be checked at a glance.
const WIKI_EXAMPLE = "#13n,d10j9d5j4c2b5b8";

const el = (id) => document.getElementById(id);
const ui = {
  board: el("board"),
  size: el("size"),
  labels: el("labels"),
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
}

function showReadout(cell) {
  if (!cell || cell.col >= board.size || cell.row >= board.size) {
    ui.readout.innerHTML = `<p class="placeholder">—</p>`;
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

function renderStatus() {
  const path = board.winningPath();
  if (!path.length) {
    ui.status.textContent = note;
    ui.status.className = note ? "status status-note" : "status";
    return;
  }
  const colour = board.stoneAt(path[0].col, path[0].row);
  ui.status.textContent =
    colour === "red"
      ? "Red has connected red to red'."
      : "Blue has connected blue to blue'.";
  ui.status.className = `status status-${colour}`;
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

if (location.hash) {
  open(location.hash);
} else {
  load({ size: DEFAULT_SIZE, moves: [], cursor: 0, numbers: true });
}
