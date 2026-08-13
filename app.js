import { HexBoard } from "./board.js";
import { parse, relative, standard, variants } from "./mason.js";

const DEFAULT_SIZE = 13;
const MAX_SIZE = 26;

// The diagram from the wiki page, so the naming can be checked at a glance.
const WIKI_EXAMPLE = {
  size: 13,
  moves: "rd10,bj9,rd5,bj4,rc2,bb5,rb8",
};

const el = (id) => document.getElementById(id);
const ui = {
  board: el("board"),
  size: el("size"),
  labels: el("labels"),
  numbers: el("numbers"),
  mode: el("mode"),
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

function nextColour(event) {
  const forced = ui.mode.value;
  if (event && (event.type === "contextmenu" || event.shiftKey)) return null; // erase
  if (forced === "erase") return null;
  if (forced !== "alternate") return forced;
  const last = board.moves[board.moves.length - 1];
  return last && last.color === "red" ? "blue" : "red";
}

function placeStone(cell, event) {
  lastTouched = cell;
  board.mark(null);
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
         <td><span class="dot dot-${m.color}"></span></td>
         <td class="coord-small">${relative(m.col, m.row, board.size)}</td>
         <td class="standard-small">${standard(m.col, m.row)}</td>`,
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
    ui.status.textContent = "";
    ui.status.className = "status";
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
  refresh();
}

// --- URL state ------------------------------------------------------------
// #13:rd10,bj9  — board size, then the stones in order, each with its colour.

function writeHash() {
  const encoded = board.moves
    .map((m) => `${m.color[0]}${standard(m.col, m.row)}`)
    .join(",");
  const rewound = board.cursor < board.moves.length ? `@${board.cursor}` : "";
  const hash = `#${board.size}${encoded ? ":" + encoded : ""}${rewound}`;
  history.replaceState(null, "", hash);
}

function readHash(hash) {
  const text = decodeURIComponent(hash.replace(/^#/, ""));
  if (!text) return null;
  const [position, cursorText] = text.split("@");
  const [sizeText, movesText = ""] = position.split(":");
  const size = Number(sizeText);
  if (!Number.isInteger(size) || size < 2 || size > MAX_SIZE) return null;
  const moves = [];
  for (const token of movesText.split(",").filter(Boolean)) {
    const color = token[0] === "b" ? "blue" : "red";
    const cell = parse(token.slice(1), size);
    if (!cell) return null;
    moves.push({ ...cell, color });
  }
  const cursor = cursorText === undefined ? moves.length : Number(cursorText);
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > moves.length) {
    return null;
  }
  return { size, moves, cursor };
}

function load(state) {
  ui.size.value = state.size;
  board.setSize(state.size);
  board.setMoves(state.moves, state.cursor);
  lastTouched = null;
  refresh();
}

// --- wiring ---------------------------------------------------------------

ui.size.addEventListener("change", () => setSize(Number(ui.size.value)));
ui.labels.addEventListener("change", () => board.setLabels(ui.labels.value));
ui.numbers.addEventListener("change", () =>
  board.setShowNumbers(ui.numbers.checked),
);
const step = (method) => () => {
  board[method]();
  refresh();
};
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
  refresh();
});
ui.example.addEventListener("click", () =>
  load(readHash(`#${WIKI_EXAMPLE.size}:${WIKI_EXAMPLE.moves}`)),
);

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

window.addEventListener("hashchange", () => {
  const state = readHash(location.hash);
  if (state) load(state);
});

const initial = readHash(location.hash);
load(initial ?? { size: DEFAULT_SIZE, moves: [] });
