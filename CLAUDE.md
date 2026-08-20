# Notes for whoever picks this up

## What this is

One static page: a Hex board that names cells with Mason's relative
coordinates. No dependencies, no build step, plain ES modules served as they
are. `README.md` describes the notation and the URL format; this file is about
working on it.

## Where it lives

`Phlogistique/hex-relative` is the real repository. `main` is served straight
by GitHub Pages (Settings → Pages → Deploy from a branch → `main` / `/ (root)`),
so a push is a deploy, and the site is at
<https://phlogistique.github.io/hex-relative/>.

`Phlogistique/random` carries a byte-identical copy under `hex/` on the branch
`claude/hex-mason-relative-coords-5qiwp8`. It is a mirror and nothing more —
the work happened here first and was copied across. If keeping the two in step
stops being worth it, drop the mirror rather than letting them drift.

## Running it

```sh
python3 -m http.server 8000        # any static server; the page is the repo root
node --test *.test.mjs             # unit tests: the notation and the URL format
for c in checks/*.mjs; do node "$c" || break; done   # browser checks, see below
npx prettier@3 --write .           # the formatting the code here is in
```

Run prettier on the code, not on `*.md`: the prose here has never been through
it, and letting it reflow the tables buries a real change in whitespace.

CI runs the unit tests only. The browser checks need Chromium and are meant to
be run by hand when the drawing or the interaction changes.

## The browser checks

`checks/` holds what the unit tests cannot reach: anything about where things
land on screen, what a click does, and whether the console stayed quiet. Each
one prints what it measured and exits non-zero if it disagrees, so they are
worth reading as much as running.

| check | what it holds down |
|---|---|
| `labels.mjs` | every coordinate label stands exactly `GAP` off the edge it faces |
| `goban.mjs` | the two go-style drawings: three lines through every cell, star points, clearances, a click, and no red or blue left anywhere |
| `numbers.mjs` | the move number sits on the middle of its stone's ink |
| `placing.mjs` | what a click does in each placing mode, occupied cell or not |
| `history.mjs` | first/prev/next/last, the keyboard, clicking a row, branching |
| `passing.mjs` | passes and swaps, including that a swap is its own undo |
| `swap-button.mjs` | the swap is offered only in reply to the opening move |
| `url.mjs` | hexworld's fragments open on the right board and rewrite cleanly |
| `phone.mjs` | three screen sizes: no sideways overflow, panel above the fold |
| `large.mjs` | 53x53: every cell drawn, inside its box, columns lettered past z |
| `screenshots.mjs` | writes PNGs next to itself, for what only the eye can judge |

`checks/lib/browser.mjs` holds the plumbing: it serves the repository itself,
finds Chromium, and fails the check if the page logged an error.

### Two environment traps

Both cost an hour the first time.

- **Playwright may only be installed globally, and it is CommonJS.** A bare
  `import { chromium } from "playwright"` fails twice over. `lib/browser.mjs`
  searches `playwright` then
  `/opt/node22/lib/node_modules/playwright/index.js` and takes `.default`.
- **Chromium here cannot reach the internet**, and handing `chromium.launch()`
  a proxy makes it worse: with one set even `127.0.0.1` answers 405. To check
  what is actually deployed, `curl` the files into a directory and point
  `check(..., { root })` at that.

## Conventions worth keeping

**Measure, do not guess.** Nearly every visual defect in this page's history
came from a plausible constant that turned out wrong, and each was settled by
measuring in the browser rather than nudging a number:

- Move numbers were centred with a fixed baseline offset that put the digits
  0.105 em too low. Neither `dominant-baseline` nor the CSS `cap` unit lands on
  the right spot — both follow metrics the font declares, which reserve room
  for accents and descenders digits never use — so `board.js` measures the
  digits' ink with `measureText` and centres on that.
- The `cap` unit is exactly the right tool and is unusable here anyway:
  Chromium floors it to 1px, and these labels are well under a pixel tall in
  the SVG's own units. Scaling the coordinate system up to make `cap` work was
  tried and reverted — it needed the scale republished to CSS as a custom
  property with a fallback, which put back the constant it was meant to remove.
- The goban's row labels look wrong at `GAP` measured sideways, because that
  board's flanks lean and a hexagon's do not: the same sideways step leaves
  less room against a slanted edge than a square one. They are placed by the
  clearance square on to the edge, and `reach()` says what the sideways step
  has to be to buy it.
- Label spacing looked ragged because the row labels were centred instead of
  anchored by the edge facing the board, and then because the offsets were
  measured to the *nearest* outline. On the sides that is the step above,
  receding diagonally, which always passes closer than the flank alongside;
  holding it at arm's length pushed the numbers visibly out. Clearance is now
  measured to the edge each label faces.

**The go-style boards are other drawings of the same board, not other
boards.** `style` picks between the three in `render()`; everything else — the
cells, the history, the URL, the hit testing — is shared and untouched. Two of
them are go-style and share the `dual` class: `goban` lays a wooden slab on the
page, `full` runs the wood out to the frame. The hexagons are still there in
both, transparent, because
they are the click target and the Voronoi cell of the intersection, so pointing
at one still names exactly one cell. `fill: transparent` rather than
`fill: none`: `none` stops taking clicks, and the board would go dead without
looking any different, which is what `checks/goban.mjs` ends by proving.

**Nothing on a go-style board is red or blue, and that is a harder rule than
it sounds.** On the board itself it is easy — red plays black, blue plays
white, edges included, so which pair of sides a colour is joining can be read
off the stones. Off the board it is not, because black and white are exactly
the two colours a page cannot lend: one of them is always the paper, and which
one depends on the colour scheme. Nothing outside the board is drawn in either.

There are two ways out and the boards take one each. Given wood to print on,
black and white can be used outright, so `full` sets every coordinate in a
pill — a coordinate written on a stone, which brings its own background and so
owes the page nothing. Where there is no wood — outside the slab, and in the
stone list either way — the device is filled against hollow, which is how a Go
book does it and is the one distinction that survives the page turning over:
red's coordinates solid, blue's outlined in the page's own ink, and the stone
list's dots a disc and a ring. Hollow numerals need bold stems: at
`font-weight: 400` the outlines close up into a smudge on a large board.

Only the near-edge name is pilled. Both names of a row name the same row, so
one pill says which pair it belongs to, and `buildPills` skipping the second
line is the difference between a border and a wall of stones. It costs a
clearance rule: the pill is what faces the board once there is one, so `pill()`
reports the overhang and `layoutLabels` gives it up out of the ink's position,
which is why the pilled labels still measure `GAP` in `checks/goban.mjs`.

The rule is worth a check because it is easy to leave half-done — it caught a
missed rename here, the stone list's dots having been keyed on each drawing's
name. They hang off `body[data-dual]` now, so another go-style board needs no
rule of its own. `goban.mjs` resolves `--red` and `--blue` through a probe
element and then reads back every `color`, `fill`, `stroke`, `background` and
`box-shadow` on the board and the panels beside it. It reads the hexagons first
and insists on finding 151 of them there, so that a reading of zero means
something.

**The page carries no explanatory prose.** Everything is in `title` tooltips —
the heading, each control, the board, each of the four names in the Cell panel.
Added by request; keep it that way unless asked otherwise.

**`mason.js` and `url.js` touch no DOM** and are covered by unit tests. Keep
anything testable on that side of the line.

## hexworld.org

The board is an independent implementation — hexworld's is © Peter Selinger,
minified and unlicensed, so none of it is copied here and none of it should be.
What *is* borrowed is the URL fragment format, so a board carries between the
two by editing the host.

That format was read out of their code rather than guessed. To check it again:

```sh
curl -s https://www.hexworld.org/board/hexreplay.js -o /tmp/hexreplay.js
```

then look for:

| in `hexreplay.js` | what it gives |
|---|---|
| `ei=function` | the fragment parser: size, flags, the two move lists |
| `Qt=function` | the writer, and where the cursor comma goes |
| `u.C="swap-pieces"`, `o.prototype.C` | `:s` reflects the board across its long diagonal and inverts every colour — the pie rule, and its own undo |
| `u.U="swap-sides"`, `o.prototype.U` | `:S` only toggles a CSS class, so it is a display relabel and is read past here |
| `It=function` | the test on their swap button: cursor at 1 and the opening move a placement, which is the rule copied here |
| `c.prototype.rt`, `53<t.files` | where their board sizes stop, and so where this one stops |
| `e.toString`, `e.q` | column names past the 26th: bijective base 26, `z aa ab`, not a repeated letter |

Do not commit that file.

## Loose ends

- `Phlogistique/random`'s pull request #1 was closed as superseded; the work is
  here.
- Passes and swaps have buttons, but hexworld's resignation and forfeit
  (`:rb :rw :fb :fw`) are read past with a note rather than modelled.
- Boards are square only. hexworld's oblong ones are refused, and the page says
  the link could not be read.
