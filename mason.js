/**
 * Mason's relative coordinates for Hex.
 *
 * Adapted from Go, as described on HexWiki:
 * https://www.hexwiki.net/index.php/User:Mason#Relative_Coordinates
 *
 * A cell is named YX (row first, then column), because in Hex the row matters
 * more than the column. Each of the two numbers counts cells from an edge:
 *
 *   Y   distance from the bottom red edge   ("red")
 *   Y'  distance from the top red edge      ("red'")
 *   X   distance from the left blue edge    ("blue")
 *   X'  distance from the right blue edge   ("blue'")
 *
 * A prime marks the coordinate as being measured from the far edge, so the
 * usual 4-4 point is 44, its mirror on the right is 54' and so on. The hyphen
 * is optional while both numbers are a single digit, and required as soon as
 * one of them is not (10-4, not 104).
 *
 * Board convention used throughout (same as HexWiki):
 *   col 0 .. size-1 runs left to right,   col 0 = blue edge, col size-1 = blue'
 *   row 0 .. size-1 runs top to bottom,   row 0 = red' edge, row size-1 = red
 */

/** Names of the four edges, in relative-coordinate terminology. */
export const EDGES = {
  red: "red", // bottom
  redPrime: "red'", // top
  blue: "blue", // left
  bluePrime: "blue'", // right
};

/** Distance in cells from each of the four edges (1 = on the edge). */
export function distances(col, row, size) {
  return {
    red: size - row, // up from the bottom
    redPrime: row + 1, // down from the top
    blue: col + 1, // right from the left
    bluePrime: size - col, // left from the right
  };
}

/** Render a coordinate, inserting the hyphen only when it is needed. */
export function format(y, yPrime, x, xPrime) {
  const sep = y > 9 || x > 9 ? "-" : "";
  return `${y}${yPrime ? "'" : ""}${sep}${x}${xPrime ? "'" : ""}`;
}

/**
 * All four ways of naming a cell, from the closest edges to the farthest.
 * Every one of them is a legitimate name; which one is clearest depends on
 * what the move is doing, so a UI is better off showing the alternatives.
 */
export function variants(col, row, size) {
  const d = distances(col, row, size);
  const out = [];
  for (const yPrime of [false, true]) {
    for (const xPrime of [false, true]) {
      const y = yPrime ? d.redPrime : d.red;
      const x = xPrime ? d.bluePrime : d.blue;
      out.push({
        text: format(y, yPrime, x, xPrime),
        y,
        x,
        yPrime,
        xPrime,
        yEdge: yPrime ? EDGES.redPrime : EDGES.red,
        xEdge: xPrime ? EDGES.bluePrime : EDGES.blue,
        distance: y + x,
      });
    }
  }
  return out.sort((a, b) => a.distance - b.distance);
}

/**
 * The default name of a cell: measured from whichever edge is nearer on each
 * axis, preferring the unprimed edge on a tie (the centre row of an odd
 * board is 7, not 7').
 *
 * This is only a default. Mason's own example is that b8 on 13x13 is 62 in
 * isolation, but is better called 8'2 when it follows 2'3 and 5'2, because
 * that name does not change with board size.
 */
export function relative(col, row, size) {
  const d = distances(col, row, size);
  const yPrime = d.redPrime < d.red;
  const xPrime = d.bluePrime < d.blue;
  const y = yPrime ? d.redPrime : d.red;
  const x = xPrime ? d.bluePrime : d.blue;
  return format(y, yPrime, x, xPrime);
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/**
 * The name of a column: a..z, then aa..az, ba.. — bijective base 26, the same
 * spelling hexworld gives columns past the 26th, so the two agree on the wide
 * boards as well. The largest board either draws, 53x53, reaches ba.
 */
export function column(col) {
  let out = "";
  for (let n = col; n >= 0; n = Math.floor(n / 26) - 1)
    out = LETTERS[n % 26] + out;
  return out;
}

/** The inverse of column(): "a" is 0, "z" is 25, "aa" is 26. */
function columnIndex(letters) {
  let n = -1;
  for (const letter of letters) n = (n + 1) * 26 + LETTERS.indexOf(letter);
  return n;
}

/** Ordinary Hex coordinates, e.g. d10. */
export function standard(col, row) {
  return column(col) + (row + 1);
}

const COMPACT = /^(\d)('?)-?(\d)('?)$/; // 44, 54', 5'4, 4'4', optional hyphen
const HYPHENATED = /^(\d+)('?)-(\d+)('?)$/; // 10-4, 12'-3 ... hyphen required
const STANDARD = /^([a-z]+)(\d+)$/;

/**
 * Parse a relative coordinate ("5'2", "8'-2", "10-4") or an ordinary one
 * ("b5"). Returns {col, row} or null if it is malformed or off the board.
 *
 * Primes and apostrophes of several shapes are accepted, and a two-digit
 * number without a hyphen is rejected rather than guessed at, since "104"
 * could mean either 10-4 or 1-04.
 */
export function parse(input, size) {
  const s = String(input)
    .trim()
    .toLowerCase()
    .replace(/[′’´`]/g, "'")
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, "");
  if (!s) return null;

  const std = STANDARD.exec(s);
  if (std) {
    const col = columnIndex(std[1]);
    const row = Number(std[2]) - 1;
    return inRange(col, row, size) ? { col, row } : null;
  }

  const m = HYPHENATED.exec(s) || COMPACT.exec(s);
  if (!m) return null;
  const [, yText, yPrime, xText, xPrime] = m;
  const y = Number(yText);
  const x = Number(xText);
  if (y < 1 || x < 1 || y > size || x > size) return null;

  const row = yPrime ? y - 1 : size - y;
  const col = xPrime ? size - x : x - 1;
  return inRange(col, row, size) ? { col, row } : null;
}

function inRange(col, row, size) {
  return col >= 0 && col < size && row >= 0 && row < size;
}
