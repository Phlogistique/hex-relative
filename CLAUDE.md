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
npx prettier@3 --write .           # the formatting everything here is in
```

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
| `numbers.mjs` | the move number sits on the middle of its stone's ink |
| `placing.mjs` | what a click does in each placing mode, occupied cell or not |
| `history.mjs` | first/prev/next/last, the keyboard, clicking a row, branching |
| `passing.mjs` | passes and swaps, including that a swap is its own undo |
| `swap-button.mjs` | the swap is offered only in reply to the opening move |
| `url.mjs` | hexworld's fragments open on the right board and rewrite cleanly |
| `phone.mjs` | three screen sizes: no sideways overflow, panel above the fold |
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
- Label spacing looked ragged because the row labels were centred instead of
  anchored by the edge facing the board, and then because the offsets were
  measured to the *nearest* outline. On the sides that is the step above,
  receding diagonally, which always passes closer than the flank alongside;
  holding it at arm's length pushed the numbers visibly out. Clearance is now
  measured to the edge each label faces.

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

Do not commit that file.

## Loose ends

- `Phlogistique/random`'s pull request #1 was closed as superseded; the work is
  here.
- Passes and swaps have buttons, but hexworld's resignation and forfeit
  (`:rb :rw :fb :fw`) are read past with a note rather than modelled.
- Boards are square only. hexworld's oblong ones are refused, and the page says
  the link could not be read.
