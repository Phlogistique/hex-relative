/**
 * Where the move number sits inside its stone.
 *
 * The baseline is worked out in board.js from the digits' measured ink,
 * because neither dominant-baseline nor the CSS cap unit lands on it: both
 * follow metrics the font declares, which reserve room for accents and
 * descenders that digits never use. This recomputes the right answer
 * independently and checks the board agrees.
 */
import { check } from "./lib/browser.mjs";

await check("Move numbers centred on their stones", async ({ open }) => {
  const page = await open("#13n,d10j9d5j4c2b5b8a1b1c1d1e1f1");
  const { applied, ideal } = await page.evaluate(() => {
    const label = document.querySelector(".stone-label");
    const style = getComputedStyle(label);
    const size = parseFloat(style.fontSize);
    const context = document.createElement("canvas").getContext("2d");
    context.font = `${style.fontWeight} 1000px ${style.fontFamily}`;
    const ink = context.measureText("0123456789");
    return {
      applied: Number(label.getAttribute("y")),
      ideal:
        ((ink.actualBoundingBoxAscent - ink.actualBoundingBoxDescent) / 2000) *
        size,
    };
  });
  const off = Math.abs(applied - ideal);
  console.log(
    `  baseline ${applied.toFixed(5)}, ink centre ${ideal.toFixed(5)}, out by ${off.toFixed(6)}`,
  );
  if (off > 0.001) throw new Error(`numbers off centre by ${off}`);
});
