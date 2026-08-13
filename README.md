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
a touch screen, where there is no hover. The position lives in the URL fragment
(`#13:rd10,bj9,…`), so a link carries it.

## Layout

| file | contents |
|---|---|
| `mason.js` | the coordinate system: `relative`, `variants`, `format`, `parse`, `distances` — no DOM |
| `board.js` | the SVG board: geometry, edge borders, labels, win detection |
| `app.js` | UI wiring: toolbar, readout, stone list, URL state |
| `mason.test.mjs` | checks against every worked example on the wiki page |

`mason.js` has no dependencies and no DOM references, so it can be reused on its own.

## Running it

Any static server will do — plain ES modules, no build step:

```sh
python3 -m http.server 8000
```

Tests:

```sh
node --test mason.test.mjs
```

## Deployment

The site is the repository root, so GitHub Pages serves it straight from the branch: **Settings →
Pages → Source: Deploy from a branch → `main` / `/ (root)`**. No build and no deployment workflow;
the only workflow runs the tests.

## Board conventions

Pointy-top hexagons in a rhombus, in HexWiki's orientation: red joins top to bottom, blue joins left
to right. Columns are lettered `a`… from the left, rows numbered `1`… from the top, so standard
coordinates such as `d10` agree with HexWiki and hexworld.org.

## Credits

The notation is [Mason's](https://www.hexwiki.net/index.php/User:Mason). This board is an
independent implementation; it is not derived from, and not affiliated with, hexworld.org.
