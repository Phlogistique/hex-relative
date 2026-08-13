/**
 * Reading and writing the URL fragment.
 *
 * The format is hexworld.org's, so that a board can be carried between the two
 * by editing the host and nothing else:
 *
 *   #<size>[flags],<moves played>,<moves still ahead>
 *
 * Moves run together — `d10j9d5` — since a letter-then-digits coordinate ends
 * where the next one starts. The comma between the two move lists is where the
 * history cursor sits, so `#13,d10j9,d5` is three moves seen from the second.
 * Flags are `n` for move numbers, and `r<n>`, `m`, `c<n>` for hexworld's
 * rotation, mirroring and colour scheme, which this board does not have and
 * reads past.
 *
 * A pass, `:p`, and a swap, `:s`, are moves like any other and keep their
 * place in the history. Passes are also what let a position that does not
 * alternate be written down at all, since the format infers the colours from
 * the order rather than storing them: two red stones running are `a1:pb1`.
 * hexworld's `:S` swap-sides only relabels colours on screen, and `:rb :rw
 * :fb :fw` end the game without touching the board, so those are read past.
 *
 * As an addition, a move may also be written as a relative coordinate, if it
 * is separated by a full stop from its neighbours, since `44` and `54'` do not
 * end where the next one starts: `#13,44.54'.5'4`.
 */
import { parse as parseCoord, standard } from "./mason.js";

const HEAD = /^(\d+)(?:x(\d+))?((?:r\d+|m|n|c\d+)*)$/;
const TOKEN = /^([a-z]+[1-9]\d*|:s|:S|:p|:rb|:rw|:fb|:fw)/;
const LEGACY = /^(\d+):/;

const colour = (red) => (red ? "red" : "blue");

/**
 * Read a fragment. Returns {size, moves, cursor, numbers, ignored} or null if
 * it is not a position this board can show. `ignored` lists the hexworld
 * features that were read past, for the caller to mention.
 */
export function parseHash(hash, maxSize) {
  let text = String(hash).replace(/^#/, "");
  try {
    text = decodeURIComponent(text);
  } catch {
    // a stray % is not worth failing over
  }
  text = text.replace(/[\\ ]/g, "");
  if (!text) return null;
  return LEGACY.test(text)
    ? parseLegacy(text, maxSize)
    : parseHexworld(text, maxSize);
}

function parseHexworld(text, maxSize) {
  const [head = "", played = "", ahead = "", ...extra] = text.split(",");
  if (extra.length) return null;

  const parts = HEAD.exec(head);
  if (!parts) return null;
  const size = Number(parts[1]);
  // hexworld boards can be oblong; this one cannot.
  if (parts[2] && Number(parts[2]) !== size) return null;
  if (size < 2 || size > maxSize) return null;

  const ignored = new Set();
  for (const flag of parts[3].match(/r\d+|m|c\d+/g) ?? []) {
    ignored.add(
      flag[0] === "r" ? "rotation" : flag === "m" ? "mirroring" : "colours",
    );
  }

  const moves = [];
  let red = true; // hexworld's first player is the one joining top to bottom
  let cursor = null;

  for (const token of tokenise(played, ahead)) {
    if (token === CURSOR) {
      cursor = moves.length;
      continue;
    }
    if (token === ":S") {
      ignored.add("swap-sides");
      continue;
    }
    if (token[0] === ":" && token.length === 3) {
      ignored.add("resignation");
      continue;
    }
    if (token === ":p" || token === ":s") {
      moves.push({
        type: token === ":p" ? "pass" : "swap",
        color: colour(red),
      });
      red = !red;
      continue;
    }
    const cell = parseCoord(token, size);
    if (!cell) return null;
    moves.push({ type: "move", ...cell, color: colour(red) });
    red = !red;
  }

  return {
    size,
    moves,
    cursor: cursor ?? moves.length,
    numbers: parts[3].includes("n"),
    ignored: [...ignored],
  };
}

const CURSOR = Symbol("cursor");

/** Split the two move lists into coordinates and hexworld's colon tokens. */
function* tokenise(played, ahead) {
  yield* tokens(played);
  yield CURSOR;
  yield* tokens(ahead);
}

function* tokens(text) {
  // A relative coordinate does not end where the next one starts, so those
  // have to be written one to a full stop; ordinary ones may run together.
  for (const chunk of text.split(".")) {
    let rest = chunk;
    while (rest) {
      const token = TOKEN.exec(rest);
      if (token) {
        yield token[1];
        rest = rest.slice(token[1].length);
      } else {
        yield rest;
        rest = "";
      }
    }
  }
}

/** The fragment this board used to write, kept so old links still open. */
function parseLegacy(text, maxSize) {
  const [position, cursorText] = text.split("@");
  const [sizeText, movesText = ""] = position.split(":");
  const size = Number(sizeText);
  if (!Number.isInteger(size) || size < 2 || size > maxSize) return null;

  const placed = [];
  for (const token of movesText.split(",").filter(Boolean)) {
    const cell = parseCoord(token.slice(1), size);
    if (!cell) return null;
    placed.push({ ...cell, color: token[0] === "b" ? "blue" : "red" });
  }
  let cursor = cursorText === undefined ? placed.length : Number(cursorText);
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > placed.length) {
    return null;
  }

  // That spelling stored the colours, where this one infers them, so a pass
  // goes in wherever the sequence does not alternate.
  const moves = [];
  let red = true;
  placed.forEach((move, index) => {
    if (colour(red) !== move.color) {
      moves.push({ type: "pass", color: colour(red) });
      if (index < cursor) cursor += 1;
      red = !red;
    }
    moves.push({ type: "move", ...move });
    red = !red;
  });
  return { size, moves, cursor, numbers: true, ignored: [] };
}

/**
 * Write a fragment, always in hexworld's format. The history alternates by
 * construction — a stone of the colour not to move is preceded by a pass — so
 * the colours come back out of the order alone.
 */
export function formatHash({ size, moves, cursor, numbers }) {
  const written = moves.map(token);
  const played = written.slice(0, cursor).join("");
  const ahead = written.slice(cursor).join("");
  const body = ahead ? `,${played},${ahead}` : `,${played}`;
  return `#${size}${numbers ? "n" : ""}${body}`.replace(/,+$/, "");
}

function token(move) {
  if (move.type === "pass") return ":p";
  if (move.type === "swap") return ":s";
  return standard(move.col, move.row);
}
