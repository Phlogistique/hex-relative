/**
 * How far every coordinate label stands off the board.
 *
 * The measure that matters is the distance to the edge each label *faces* —
 * the flank of the board for a row, the points of the zigzag for a column —
 * and that should come out at exactly GAP on all four sides, for every label,
 * whatever its width. Getting there took two goes: the row labels were centred
 * rather than anchored by their inner edge, so a wide "13'" crowded the board
 * where a bare "7" did not; and the offsets were then solved against the
 * *nearest* outline, which on the sides is the step above, receding
 * diagonally, so holding that at arm's length pushed the numbers visibly out.
 *
 * The nearest outline of any kind is reported too, but only for information:
 * on the sides it is meant to pass closer than GAP, and does.
 */
import { check, pad } from "./lib/browser.mjs";

const GAP = 0.55; // must match board.js
const HALF_WIDTH = Math.sqrt(3) / 2;
const BORDER = 0.3; // BORDER_WIDTH in board.js
// How much further out the mitred band reaches than the hexagon it runs
// along: OUTSET in board.js.
const OUTSET = 1 + (BORDER * 2) / Math.sqrt(3);

await check("Label clearance", async ({ open }) => {
  const page = await open("#13");
  const measured = await page.evaluate(
    ([HALF_WIDTH, OUTSET]) => {
      const size = Number(document.getElementById("size").value);
      const last = size - 1;
      const centre = (col, row) => ({
        x: Math.sqrt(3) * (col + row / 2),
        y: 1.5 * row,
      });
      const all = [...document.querySelectorAll(".labels text")];

      // Half the digits' ink, worked out exactly as board.js does it, since
      // trimming the em box by eye does not recover the same edge.
      const inks = new Map();
      const inkHalf = (label) => {
        const style = getComputedStyle(label);
        const key = `${style.fontWeight}/${style.fontSize}/${style.fontFamily}`;
        if (!inks.has(key)) {
          const context = document.createElement("canvas").getContext("2d");
          context.font = `${style.fontWeight} 1000px ${style.fontFamily}`;
          const ink = context.measureText("0123456789");
          inks.set(
            key,
            ((ink.actualBoundingBoxAscent - ink.actualBoundingBoxDescent) /
              2000) *
              parseFloat(style.fontSize),
          );
        }
        return inks.get(key);
      };

      // The coloured edges are four filled bands; what a label has to clear is
      // any side of one, so take them apart into their sides.
      const segments = [...document.querySelectorAll(".border")].flatMap(
        (band) => {
          const points = band
            .getAttribute("points")
            .split(" ")
            .map((pair) => pair.split(",").map(Number));
          return points.map(([x1, y1], i) => {
            const [x2, y2] = points[(i + 1) % points.length];
            return { x1, y1, x2, y2 };
          });
        },
      );
      const toSegment = (px, py, s) => {
        const dx = s.x2 - s.x1;
        const dy = s.y2 - s.y1;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((px - s.x1) * dx + (py - s.y1) * dy) / (dx * dx + dy * dy),
          ),
        );
        return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
      };

      const groups = {};
      for (const label of all) {
        const { side, line } = label.dataset;
        const index = all
          .filter((l) => l.dataset.side === side && l.dataset.line === line)
          .indexOf(label);
        const box = label.getBBox();
        const x = Number(label.getAttribute("x"));
        // getBBox is the em box, taller than the ink; trim to about the ink.
        const trim = box.height * 0.18;

        let facing;
        if (side === "left") {
          facing = centre(0, index).x - HALF_WIDTH * OUTSET - x;
        } else if (side === "right") {
          facing = x - (centre(last, index).x + HALF_WIDTH * OUTSET);
        } else {
          // board.js puts the baseline at the label's centre plus the ink, so
          // the ink runs from baseline - 2*ink to baseline.
          const ink = inkHalf(label);
          const baseline = Number(label.getAttribute("y"));
          const near = side === "top" ? baseline : baseline - 2 * ink;
          const point =
            side === "top"
              ? centre(index, 0).y - OUTSET
              : centre(index, last).y + OUTSET;
          facing = side === "top" ? point - near : near - point;
        }

        let nearest = Infinity;
        for (let i = 0; i <= 8; i++) {
          const px = box.x + (box.width * i) / 8;
          for (const py of [box.y + trim, box.y + box.height - trim]) {
            for (const s of segments) {
              nearest = Math.min(nearest, toSegment(px, py, s));
            }
          }
        }

        const key = `${side} ${line === "1" ? "outer" : "inner"}`;
        (groups[key] ??= []).push({
          text: label.textContent,
          facing: +facing.toFixed(3),
          nearest: +nearest.toFixed(3),
        });
      }
      return groups;
    },
    [HALF_WIDTH, OUTSET],
  );

  for (const [side, labels] of Object.entries(measured)) {
    const facing = labels.map((l) => l.facing);
    const low = Math.min(...facing);
    const high = Math.max(...facing);
    const nearest = Math.min(...labels.map((l) => l.nearest));
    console.log(
      `  ${pad(side, 14)} faces the board at ${low.toFixed(2)}..${high.toFixed(2)}` +
        `   nearest outline of any kind ${nearest.toFixed(2)}`,
    );
    if (!side.endsWith("inner")) continue;
    if (Math.abs(low - GAP) > 0.02 || Math.abs(high - GAP) > 0.02) {
      throw new Error(
        `${side}: faces the board at ${low}..${high}, wanted ${GAP}`,
      );
    }
  }
});
