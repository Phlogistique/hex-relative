/**
 * Checks the relative-coordinate implementation against the worked examples
 * on https://www.hexwiki.net/index.php/User:Mason#Relative_Coordinates
 *
 * Run with: node hex/mason.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { distances, format, parse, relative, standard, variants } from "./mason.js";

/** The 13x13 diagram from the wiki: stone label -> cell -> expected name. */
const WIKI = [
  { label: "A", cell: "d10", name: "44" },
  { label: "B", cell: "j9", name: "54'" },
  { label: "C", cell: "d5", name: "5'4" },
  { label: "D", cell: "j4", name: "4'4'" },
  { label: "1", cell: "c2", name: "2'3" },
  { label: "2", cell: "b5", name: "5'2" },
  { label: "3", cell: "b8", name: "62" },
];

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const cellOf = (s) => ({ col: LETTERS.indexOf(s[0]), row: Number(s.slice(1)) - 1 });

test("names the wiki's 13x13 example stones", () => {
  for (const { label, cell, name } of WIKI) {
    const { col, row } = cellOf(cell);
    assert.equal(relative(col, row, 13), name, `stone ${label} at ${cell}`);
  }
});

test("b8 is also nameable as 8' 2, the form the wiki prefers in context", () => {
  const { col, row } = cellOf("b8");
  const names = variants(col, row, 13).map((v) => v.text);
  assert.ok(names.includes("62"), names.join(" "));
  assert.ok(names.includes("8'2"), names.join(" "));
});

test("parses every name back to the cell it came from", () => {
  for (const size of [3, 5, 11, 13, 14, 19]) {
    for (let col = 0; col < size; col++) {
      for (let row = 0; row < size; row++) {
        for (const v of variants(col, row, size)) {
          assert.deepEqual(parse(v.text, size), { col, row }, `${v.text} on ${size}x${size}`);
        }
        assert.deepEqual(parse(standard(col, row), size), { col, row });
      }
    }
  }
});

test("hyphenates exactly when a number has more than one digit", () => {
  assert.equal(format(4, false, 4, false), "44");
  assert.equal(format(5, false, 4, true), "54'");
  assert.equal(format(10, false, 4, false), "10-4");
  assert.equal(format(4, true, 12, true), "4'-12'");
});

test("measures from the near edge, and prefers the unprimed edge on a tie", () => {
  // Centre of a 13x13 board: 7 up from red is also 7 down from red'.
  assert.equal(relative(6, 6, 13), "77");
  // Corners.
  assert.equal(relative(0, 12, 13), "11"); // a13, on red and blue
  assert.equal(relative(12, 0, 13), "1'1'"); // m1, on red' and blue'
});

test("the four edges are one step apart in the right direction", () => {
  const d = distances(0, 12, 13); // a13: bottom-left corner
  assert.deepEqual(d, { red: 1, redPrime: 13, blue: 1, bluePrime: 13 });
});

test("rejects malformed and off-board input", () => {
  assert.equal(parse("104", 13), null); // ambiguous: 10-4 or 1-04, so no guessing
  assert.equal(parse("14-1", 13), null); // off the board
  assert.equal(parse("0-4", 13), null);
  assert.equal(parse("", 13), null);
  assert.equal(parse("z9", 13), null);
  assert.equal(parse("4x4", 13), null);
});

test("accepts hyphens, typographic primes and stray spaces", () => {
  const target = parse("5'2", 13);
  for (const text of [" 5'2 ", "5'-2", "5′2", "5’2"]) {
    assert.deepEqual(parse(text, 13), target, text);
  }
});
