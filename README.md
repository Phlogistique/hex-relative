# Hex board with Mason's relative coordinates

An interactive [Hex](https://en.wikipedia.org/wiki/Hex_(board_game)) board that names cells with
[Mason's relative coordinates](https://www.hexwiki.net/index.php/User:Mason#Relative_Coordinates).

## The notation

A cell is named **YX** — row first, then column — and each number counts cells inwards from an edge
instead of from a fixed origin. The bottom red edge is the reference:

| | counted from | edge name |
|---|---|---|
| `Y` | bottom edge, upwards | `red` |
| `Y'` | top edge, downwards | `red'` |
| `X` | left edge, inwards | `blue` |
| `X'` | right edge, inwards | `blue'` |

The hyphen is optional while both numbers are a single digit, and required once one of them is not:
`44`, `54'`, but `10-4`.

Because the numbers are distances from edges, the 4-4 point is `44` on every board, and an opening
such as `2'3`, `5'2`, `8'2` reads the same on 11×11 as on 19×19.

Every cell has four valid names, one per pair of edges. The page shows all four and defaults to the
one measured from the two nearest edges. That is only a default: on 13×13, `b8` is `62` in isolation
but is better called `8'2` when it follows `2'3` and `5'2`, since that name places it relative to
those stones rather than to the bottom edge — and does not change with board size.

## The page

The page itself carries no explanatory prose; everything is in tooltips, on the heading, the
controls, the board and each of the four names in the Cell panel.

Both names of every row and column are printed on all four sides of the board: against the board the
one measured from the nearer edge, running 1 up to about half the board and back down, and outside
it, smaller and fainter, the one measured from the far edge. Each label line follows the slant of
the rhombus, sitting on the continuation of its own column.

Tap or click to place a stone and again to take it off; shift-click or long-press erases. The
`nothing (just name cells)` mode reads the board without changing it, which is how you name cells on
a touch screen, where there is no hover. Step through the game with the arrow buttons, `Home`, the
arrow keys and `End`, or click any row of the stone list to jump to that position.

A pass and a swap are moves like any other and keep their place in that list. The swap is the pie
rule as hexworld records it: the board is reflected across its long diagonal and every stone changes
colour, which makes it its own undo. A pass is also what lets a one-colour position exist at all —
placing with `red only` puts one in wherever the turn would not otherwise come round, so that the
position can still be written in a format that infers the colours from the order of play.

## The URL

The fragment is [hexworld.org](https://hexworld.org/board/)'s, so a board carries between the two by
editing the host and nothing else, in either direction:

    #<size>[flags],<moves played>,<moves still ahead>

Moves run together — `d10j9d5` — since a letter-then-digits coordinate ends where the next one
starts. The comma between the two move lists is where the history cursor sits, so `#13,d10j9,d5` is
three moves seen from the second. The `n` flag turns on move numbers; hexworld's `r<n>`, `m` and
`c<n>` for rotation, mirroring and colour scheme are read past, and the page says so when a link
carried one.

`:p` is a pass and `:s` a swap, both kept in the history. Two red stones running are `a1:pb1`, and a
blue-first position starts with a pass: `:pa1`. hexworld's `:S` swap-sides only relabels the colours
on screen, and `:rb :rw :fb :fw` end the game without touching the board, so those are read past.

As an addition, a move may also be written as a relative coordinate when separated by a full stop
from its neighbours, since `44` and `54'` do not end where the next one starts:

    #13,44.54'.5'4

Every position this board can show goes out in that format, passes included. An older spelling of
its own (`#9:ra1,rb1`) is still read, so links shared before are not broken.

## Layout

| file | contents |
|---|---|
| `mason.js` | the coordinate system: `relative`, `variants`, `format`, `parse`, `distances` — no DOM |
| `board.js` | the SVG board: geometry, edge borders, labels, win detection |
| `url.js` | the URL fragment: hexworld's format, read and written — no DOM |
| `app.js` | UI wiring: toolbar, readout, stone list, history |
| `mason.test.mjs` | checks against every worked example on the wiki page |
| `url.test.mjs` | checks the fragment against hexworld's format |
| `checks/` | browser checks: layout, clicking, history, phones, the largest board — see `CLAUDE.md` |

`mason.js` and `url.js` have no dependencies and no DOM references, so either can be reused
on its own.

## Running it

Any static server will do — plain ES modules, no build step:

```sh
python3 -m http.server 8000
```

Tests:

```sh
node --test *.test.mjs                                # unit tests
for c in checks/*.mjs; do node "$c" || break; done    # browser checks
```

## Deployment

The site is the repository root, so GitHub Pages serves it straight from the branch: **Settings →
Pages → Source: Deploy from a branch → `main` / `/ (root)`**. No build and no deployment workflow;
the only workflow runs the tests.

## Board conventions

Pointy-top hexagons in a rhombus, in HexWiki's orientation: red joins top to bottom, blue joins left
to right. Columns are lettered `a`… from the left, rows numbered `1`… from the top, so standard
coordinates such as `d10` agree with HexWiki and hexworld.org.

Boards run from 2×2 to 53×53, which is as far as hexworld goes as well. Past the 26th column the
letters double, in hexworld's spelling: `…y z aa ab …az ba`, so the far corner of the largest board
is `ba53`. Relative coordinates need no such thing — they are distances, so that corner is `1'1'`
whatever the board size. A 53×53 board comes out about ten pixels to the cell on a laptop screen,
and is not much use on a phone.

## Credits

The notation is [Mason's](https://www.hexwiki.net/index.php/User:Mason).
