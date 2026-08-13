/**
 * The URL fragment, which follows hexworld.org's so a board can be carried
 * between the two by editing the host.
 *
 * Run with: node url.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { formatHash, parseHash } from "./url.js";

const MAX = 26;
const read = (hash) => parseHash(hash, MAX);
const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const cells = (state) =>
  state.moves.map((m) =>
    m.type === "move"
      ? `${m.color[0]}${LETTERS[m.col]}${m.row + 1}`
      : `${m.color[0]}:${m.type}`,
  );

test("reads a hexworld board", () => {
  const state = read("#13,d10j9d5");
  assert.equal(state.size, 13);
  assert.deepEqual(cells(state), ["rd10", "bj9", "rd5"]);
  assert.equal(state.cursor, 3);
});

test("the comma between the move lists is the history cursor", () => {
  assert.equal(read("#13,d10j9,d5").cursor, 2);
  assert.equal(read("#13,,d10j9d5").cursor, 0);
  assert.equal(read("#13,d10j9d5").cursor, 3);
  // and all three describe the same three moves
  for (const hash of ["#13,d10j9,d5", "#13,,d10j9d5", "#13,d10j9d5"]) {
    assert.equal(read(hash).moves.length, 3, hash);
  }
});

test("colours alternate from red, and a pass changes the turn", () => {
  assert.deepEqual(
    read("#5,a1b1c1").moves.map((m) => m.color),
    ["red", "blue", "red"],
  );
  // a pass is a move of its own, and the stone after it is red again
  assert.deepEqual(cells(read("#5,a1:pb1")), ["ra1", "b:pass", "rb1"]);
});

test("a pass is what lets a one-colour position be written at all", () => {
  const reds = read("#5,a1:pb1:pc1");
  assert.deepEqual(
    reds.moves.filter((m) => m.type === "move").map((m) => m.color),
    ["red", "red", "red"],
  );
  assert.equal(
    formatHash({ ...reds, cursor: reds.moves.length }),
    "#5,a1:pb1:pc1",
  );

  // and blue-only starts with one
  const blues = read("#5,:pa1:pb1");
  assert.deepEqual(
    blues.moves.filter((m) => m.type === "move").map((m) => m.color),
    ["blue", "blue"],
  );
});

test("a swap keeps its place in the history", () => {
  const state = read("#5,a2:s");
  assert.deepEqual(cells(state), ["ra2", "b:swap"]);
  assert.equal(state.ignored.length, 0);
  assert.equal(formatHash({ ...state, cursor: 2 }), "#5,a2:s");
});

test("reads hexworld's flags, and says which it could not use", () => {
  assert.equal(read("#13n,d10").numbers, true);
  assert.equal(read("#13,d10").numbers, false);
  assert.deepEqual(read("#13r3mc1,d10").ignored.sort(), [
    "colours",
    "mirroring",
    "rotation",
  ]);
  assert.deepEqual(read("#13,d10:Sj9").ignored, ["swap-sides"]);
  assert.deepEqual(read("#13,d10:rb").ignored, ["resignation"]);
  assert.deepEqual(read("#13,d10").ignored, []);
});

test("accepts relative coordinates when they are separated by a stop", () => {
  assert.deepEqual(cells(read("#13,44.54'.5'4")), ["rd10", "bj9", "rd5"]);
  // mixed with ordinary ones
  assert.deepEqual(cells(read("#13,d10.54'.d5")), ["rd10", "bj9", "rd5"]);
  // and the cursor still works
  assert.equal(read("#13,44.54',5'4").cursor, 2);
});

test("square boards only, and only ones this board can draw", () => {
  assert.equal(read("#13x13,d10").size, 13);
  assert.equal(read("#11x13,d10"), null);
  assert.equal(read("#1,"), null);
  assert.equal(read("#40,a1"), null);
});

test("refuses what it cannot read rather than guessing", () => {
  assert.equal(read("#13,z9"), null); // off the board
  assert.equal(read("#13,104"), null); // ambiguous relative coordinate
  assert.equal(read("#13,d10,j9,d5"), null); // too many move lists
  assert.equal(read(""), null);
  assert.equal(read("#"), null);
});

test("still opens the links this board used to write", () => {
  const state = read("#13:rd10,bj9,rd5@2");
  assert.deepEqual(cells(state), ["rd10", "bj9", "rd5"]);
  assert.equal(state.cursor, 2);
  // that spelling stored the colours, so a pass goes in to reproduce them
  assert.deepEqual(cells(read("#13:rd10,rj9")), ["rd10", "b:pass", "rj9"]);
});

test("writes hexworld's format, and reads its own writing back", () => {
  const moves = [
    { type: "move", col: 3, row: 9, color: "red" },
    { type: "move", col: 9, row: 8, color: "blue" },
    { type: "move", col: 3, row: 4, color: "red" },
  ];
  assert.equal(
    formatHash({ size: 13, moves, cursor: 3, numbers: false }),
    "#13,d10j9d5",
  );
  assert.equal(
    formatHash({ size: 13, moves, cursor: 2, numbers: true }),
    "#13n,d10j9,d5",
  );
  assert.equal(
    formatHash({ size: 13, moves, cursor: 0, numbers: false }),
    "#13,,d10j9d5",
  );
  assert.equal(
    formatHash({ size: 13, moves: [], cursor: 0, numbers: false }),
    "#13",
  );

  for (const cursor of [0, 1, 2, 3]) {
    for (const numbers of [true, false]) {
      const back = read(formatHash({ size: 13, moves, cursor, numbers }));
      assert.deepEqual(back.moves, moves);
      assert.equal(back.cursor, cursor);
      assert.equal(back.numbers, numbers);
    }
  }
});

test("every history round-trips, passes and swaps included", () => {
  for (const hash of [
    "#13,d10j9d5",
    "#13n,d10j9,d5",
    "#13,,d10j9d5",
    "#5,a1:pb1:pc1",
    "#5,:pa1:pb1",
    "#5,a2:s",
    "#5n,a2:s,b3",
    "#9,a1:p:pb2",
  ]) {
    const state = read(hash);
    assert.equal(formatHash(state), hash, hash);
  }
});
