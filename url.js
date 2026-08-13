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
 * reads past. The tokens `:s :S :p :rb :rw :fb :fw` are hexworld's swap, pass,
 * resignation and forfeit; only pass has a meaning here, as a change of turn.
 *
 * As an addition, a move may also be written as a relative coordinate, if it
 * is separated by a full stop from its neighbours, since `44` and `54'` do not
 * end where the next one starts: `#13,44.54'.5'4`.
 */
import { parse as parseCoord, standard } from "./mason.js";

const HEAD = /^(\d+)(?:x(\d+))?((?:r\d+|m|n|c\d+)*)$/;
const TOKEN = /^([a-z]+[1-9]\d*|:s|:S|:p|:rb|:rw|:fb|:fw)/;
const LEGACY = /^(\d+):/;

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
    ignored.add(flag[0] === "r" ? "rotation" : flag === "m" ? "mirroring" : "colours");
  }

  const moves = [];
  let red = true; // hexworld's first player is the one joining top to bottom
  for (const token of tokenise(played + "," + ahead)) {
    if (token === ",") continue;
    if (token[0] === ":") {
      if (token === ":p") red = !red;
      else if (token === ":s" || token === ":S") ignored.add("swap");
      else ignored.add("resignation");
      continue;
    }
    const cell = parseCoord(token, size);
    if (!cell) return null;
    moves.push({ ...cell, color: red ? "red" : "blue" });
    red = !red;
  }

  // The cursor is however many moves fell before the separating comma.
  const beforeCursor = [...tokenise(played)].filter(
    (t) => t !== "," && t[0] !== ":",
  ).length;

  return {
    size,
    moves,
    cursor: text.includes(",") ? beforeCursor : moves.length,
    numbers: parts[3].includes("n"),
    ignored: [...ignored],
  };
}

/** Split a move list into coordinates and hexworld's colon tokens. */
function* tokenise(text) {
  for (const chunk of text.split(".")) {
    if (chunk === ",") {
      yield ",";
      continue;
    }
    let rest = chunk;
    while (rest) {
      if (rest[0] === ",") {
        yield ",";
        rest = rest.slice(1);
        continue;
      }
      const token = TOKEN.exec(rest);
      if (token) {
        yield token[1];
        rest = rest.slice(token[1].length);
        continue;
      }
      // Not a coordinate of the running-together kind, so the rest of this
      // chunk has to be a single relative coordinate.
      const upto = rest.indexOf(",");
      yield upto === -1 ? rest : rest.slice(0, upto);
      rest = upto === -1 ? "" : rest.slice(upto);
    }
  }
}

/** The fragment this board used to write, kept so old links still open. */
function parseLegacy(text, maxSize) {
  const [position, cursorText] = text.split("@");
  const [sizeText, movesText = ""] = position.split(":");
  const size = Number(sizeText);
  if (!Number.isInteger(size) || size < 2 || size > maxSize) return null;

  const moves = [];
  for (const token of movesText.split(",").filter(Boolean)) {
    const cell = parseCoord(token.slice(1), size);
    if (!cell) return null;
    moves.push({ ...cell, color: token[0] === "b" ? "blue" : "red" });
  }
  const cursor = cursorText === undefined ? moves.length : Number(cursorText);
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > moves.length) {
    return null;
  }
  return { size, moves, cursor, numbers: true, ignored: [] };
}

/**
 * Write a fragment. Positions that alternate from red, which is every real
 * game, go out in hexworld's format so the link opens there too. A position
 * built with a colour forced does not survive that — the colours are not in
 * the format, only inferred — so those keep the older explicit spelling.
 */
export function formatHash({ size, moves, cursor, numbers }) {
  if (!alternates(moves)) {
    const listed = moves
      .map((m) => `${m.color[0]}${standard(m.col, m.row)}`)
      .join(",");
    const rewound = cursor < moves.length ? `@${cursor}` : "";
    return `#${size}${listed ? ":" + listed : ""}${rewound}`;
  }

  const played = moves.slice(0, cursor).map(coord).join("");
  const ahead = moves.slice(cursor).map(coord).join("");
  const body = ahead ? `,${played},${ahead}` : `,${played}`;
  return `#${size}${numbers ? "n" : ""}${body}`.replace(/,+$/, "");
}

const coord = (m) => standard(m.col, m.row);

function alternates(moves) {
  return moves.every((m, i) => m.color === (i % 2 ? "blue" : "red"));
}
