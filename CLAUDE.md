# Notes for whoever picks this up

## What this is

One static page: a Hex board that names cells with Mason's relative
coordinates. No dependencies, no build step, plain ES modules served as they
are. `README.md` describes the notation and the URL format; this file is about
working on it.

## Where it lives

`Phlogistique/hex-relative` is the repository. `main` is served straight
by GitHub Pages (Settings → Pages → Deploy from a branch → `main` / `/ (root)`),
so a push is a deploy, and the site is at
<https://phlogistique.github.io/hex-relative/>.

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
| `edges.mjs` | the four coloured edges join up, stand `BORDER_WIDTH` off the outline and no more, and split every corner evenly |
| `goban.mjs` | the dual drawing: three lines through every cell, star points, clearances, a click, and no red or blue left anywhere |
| `numbers.mjs` | the move number sits on the middle of its stone's ink |
| `placing.mjs` | what a click does in each placing mode, occupied cell or not |
| `history.mjs` | first/prev/next/last, the keyboard, clicking a row, branching |
| `passing.mjs` | passes and swaps, including that a swap is its own undo |
| `swap-button.mjs` | the swap is offered only in reply to the opening move |
| `url.mjs` | hexworld's fragments open on the right board and rewrite cleanly |
| `phone.mjs` | three screen sizes: no sideways overflow, board and answer inside the screen |
| `turned.mjs` | the board turned upright: columns vertical, 11 bottom left, taps still land, bigger, labels still clear, a URL bar sliding away does not turn it, and turning pays before the box is square |
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

**The coloured edges are four bands, not one shape per hexagon edge.** They
were drawn a segment at a time once, each shifted out along its own normal and
capped round, and the caps were the whole trouble: two of them met at every
point of the zigzag, so the outline wore a knob on the outside of each and left
a notch in the inside of each, and at the corners whichever colour happened to
be drawn last covered the other. `rim()` walks the outline instead — every
hexagon edge with nothing behind it, in the order they join up — and
`buildEdges()` lays one polygon along each colour's run of it.

Two things about that walk are worth knowing:

- **The whole of the geometry is `pushed()`**, the same mitre the goban's bands
  use: the one point standing `BORDER_WIDTH` off both of the edges meeting at a
  vertex. Taken at every vertex alike it turns the zigzag, closes the corners
  between two colours, and needs no case of its own for either. It comes out
  `MITRE` from the vertex every time, the outline turning through 120 degrees
  wherever it turns at all, which is also how far the drawing reaches past the
  points of the zigzag and so what a label there has to clear.
- **Every corner of the board is halved between the two colours.** At two of
  them the halves fall between hexagon edges and there is nothing to do. At the
  other two the corner cell shows three edges, the middle one facing off the
  board in two directions at once, and it is cut down the middle so each colour
  keeps the half on its own side. Giving it whole to whichever colour asked
  first is what left the four corners of the board looking unalike.

**Turning the board upright is one rotation, applied to everything.** The
rhombus comes out half again as wide as it is tall, which is the wrong way
round for a phone, so where the room left for it is taller than it is wide the
whole drawing is turned a twelfth of a turn clockwise. `turned()` is the whole
of it: cell centres, the hexagons' own corners, the four outward normals of the
wooden board, and the step each line of labels takes out of the board. Nothing
else in `board.js` knows about it, and nothing outside `board.js` does at all.

Three things are worth knowing before touching it:

- **Why a twelfth, and why that way round.** A rhombus fills its own box
  exactly when a pair of its sides stands square to the screen; anything else
  spends board on the corners. Four turns do that, two of them leave the board
  upright, and of those two this is the one that keeps `11` in the bottom left
  corner with the red edge falling away from it to `11'` at the lowest point.
  The prettier-looking sixth of a turn — the rhombus standing on its long
  diagonal, a diamond — was tried first and thrown away: it wastes a quarter of
  the box on the corners and draws a smaller board than this.
- **The hexagons come round with it**, which is the one thing that is not free.
  On their sides they reach 1 sideways and `HALF_WIDTH` up rather than the
  other way about, and `faces()` has to say so, since where a label lands is
  worked out rather than drawn. The box the drawing is given is not worked out:
  the coloured band's own outer corners are the outermost thing there is, so
  `render()` takes its box off them and never asks. Their neighbours do not
  change: the polygon turns as one, so edge k still faces `NEIGHBOURS[k]`.
- **The text does not turn with it**, which is what the labels have to answer
  for. A line of labels sits on the continuation of its own row or column, and
  faces the outline: square on to the screen on the hexagons, whose outline is
  a zigzag of points, and a real leaning edge on the wooden board. Clearance is
  measured from the corner of the ink nearest that edge, which is the same as
  the whole facing side of it where the two are parallel and is not where they
  are not. That is one rule for four sides, two drawings and both ways round,
  and it moved the goban's row labels out by an eighth of a cell — the gap they
  were meant to have had all along, `checks/goban.mjs` having measured to the
  anchor rather than to the nearest ink.

**`innerHeight` is not the height of the screen on a phone.** It follows the
URL bar, which slides away as you scroll down and comes back as you scroll up,
and a resize fires each time. Measuring the room for the board with it turned
the board over mid-scroll on a screen near the size where the decision is
close — the one bug this drawing has had that a reader meets by doing nothing
at all. `steadyHeight()` measures `100svh` through a probe instead: the layout
viewport does not move with the bar, and `svh` is that viewport at its
smallest, which is also the one the Cell panel has to fit in, the bar being out
whenever the page is at the top.

That is not reproducible by resizing the window, and the first attempt at a
check was worthless for it: `setViewportSize` moves the layout viewport too, so
`svh` moves with it and nothing is proved. The bar moves `innerHeight` alone.
`checks/turned.mjs` redefines `window.innerHeight` and fires a resize, which is
what the bar actually does, and refuses to pass if `svh` moved as well.

**What has to fit on the screen is the board and the answer to a tap, and not
a pixel more.** The heading and the toolbar stand above the board, and the
reader can put them off the top of the screen by scrolling, so what they take
is not taken from the board: the room is the whole screen less what has to stay
*under* the board. That is the one thing that may not go off the bottom — a tap
that scrolls its own answer out of sight is no use — and it is the answer
itself rather than the whole Cell panel, the cell's other names being able to
wait for a scroll.

So a phone is deliberately given a board taller than the space the page leaves
it at rest: at 360 by 658 the board is drawn 345 by 496 where the page has only
338 free under the toolbar, and the reader scrolls the toolbar away to see the
foot of it. That is the whole of why it is worth turning at all — it took the
cell from 15px to 22px on that screen, where measuring against the room under
the toolbar had it lying down.

`app.js` measures the box — the board's own width, and `steadyHeight()` less
what stands under it — and hands it to `board.fitInto()`, which lies the
rhombus down or stands it up, whichever draws the bigger cell in a box that
size. Everything between the foot of the board and the foot of that answer is
laid out already and does not depend on how tall the board is, so one
measurement settles it; the stylesheet is asked whether the page is one column
or two rather than the breakpoint being written down in two places. Beside the
board rather than under it the panel keeps its own place, there is nothing to
measure, and the cap is the stylesheet's `78vh`.

The one screen where that cap bites is a phone held sideways, which has almost
no height and a panel laid out for a desktop: the answer alone was taking a
third of the screen, so the same trims a narrow screen gets are given to a
short one, and what they free goes into the board. `phone.mjs` prints how much
of the screen the board and its answer want, and refuses to pass if that is
more than there is.

Which way round draws the bigger board is not the same question as which way
round the box leans, and taking the second for the first cost this page a band
of screens. The rule was that a box taller than it is wide wants the upright
drawing, which would be right if the two drawings were each other's transposed.
They are not, and the labels are what spoils it: they come round with neither
the board nor the reader's head, so a printed number stands the same way up in
both and takes its width out of the upright drawing's width, where lying down
the same width came out of a side that had room to spare. The upright drawing
is a twenty-fifth stouter than the lying one turned on its side, so there is a
band of boxes — slightly wider than they are tall — where standing the board up
still draws it bigger, and a phone held upright is often in it: a 360 by 658
screen leaves a box of 345 by 338, which used to be drawn lying down.

`board.shape()` is what settles it, and it is measured for the same reason the
labels are: where they land is read off the text as rendered, so the way round
that is not on screen has to be drawn to be measured. It is drawn once out of
sight and the answer kept — it depends on the size, the style and which labels
are printed, and on nothing a resize touches, so a board that has been fitted
once fits again for nothing. `checks/turned.mjs` works the band out from the
two drawings, builds a screen that lands in the middle of it, and insists the
board stands up there and comes out bigger for it; it also checks the drawing
made out of sight against a real one, since a hidden drawing that measured
nothing would look like a very stout board and turn every screen.

That reversed what the chrome above the board costs, and the note it reversed
is worth keeping. While the board was measured against the room left under the
toolbar, its height was what bound and every pixel of chrome came straight off
the board — the heading wrapping onto a second line cost a twelfth of the board
on a phone held upright, which is why its size on a narrow screen is still the
largest that keeps it on one line. Now that chrome costs a scroll and nothing
else, and what binds on a phone is the width: `phone.mjs` prints how much width
the drawing leaves over, and on a phone held upright it is none.

**The goban is another drawing of the same board, not another board.**
`style` picks between the two in `render()`; everything else — the cells, the
history, the URL, the hit testing — is shared and untouched. The go-style
drawing hangs off the `dual` class. The hexagons are still there in it,
transparent, because
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

The device that replaces them is filled against hollow, which is how a Go book
does it and is the one distinction that survives the page turning over: the
coordinates counting from red's edges are solid, blue's are outlined in the
page's own ink, and the stone list's dots are a disc and a ring.

The outline is the browser's own, and it is worth knowing which of the three
ways of asking for one this is. It is not a second copy of the text and not a
conversion to paths: it is `stroke` on the `<text>` with `paint-order: stroke`,
so the glyphs themselves are stroked and the fill then covers the inside half
of that stroke, leaving an even outline all the way round.

Put another way, stroking *is* a morphological dilation of the glyph by a disc,
done in vector space, and that is the thing you actually want. The other two
readings of "grow the letter and set it behind" both fail, and both were tried:

- **Scaling it up** is not a dilation at all. A glyph scaled about its origin
  drifts as it grows, so the halo comes out thick on one side and absent on the
  other. Visibly wrong at a glance.
- **`feMorphology operator="dilate"`** is a real dilation and is native, and it
  is much the closer of the two: matched for thickness it is hard to tell from
  the stroke at all. What sets them apart is that its structuring element is a
  rectangle, so it grows a diagonal by `r√2` where it grows an upright by `r` —
  which is also why it looks heavier than a stroke of nominally the same
  radius, and why comparing the two without matching them first is misleading.
  It also works on the rasterised result, so it does not survive being scaled,
  and it costs a filter and a second copy of every label. The stroke is the
  same idea for less.

The weight and the stroke width were settled by looking at 13, 19 and 53 side
by side: at `700` the digits go clumsy, below `0.055` the outline goes timid,
and by `0.085` the counters have closed on the largest board and the numbers
stop reading as hollow and start reading as grey. They sit at `500`/`0.07`
with round joins.

The relabelling reaches the toolbar too: `red only` and `blue only` in the
placing menu read `black only` and `white only` beside a goban. Only what is
printed changes — the option values stay `red` and `blue`, since that is what
the cells, the history and the URL call them whichever way the board is drawn,
and `PLACING` in `app.js` sits beside `WON` so the two stay in step.

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

- Passes and swaps have buttons, but hexworld's resignation and forfeit
  (`:rb :rw :fb :fw`) are read past with a note rather than modelled.
- Boards are square only. hexworld's oblong ones are refused, and the page says
  the link could not be read.
