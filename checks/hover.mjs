/**
 * The one mark, and who is offered it.
 *
 * The board says a single thing about a single cell: the pointer is on it, or
 * the panel is naming it. Both look the same, on both drawings, so the check
 * is that hovering a cell and tapping it leave the hexagon in the same state.
 *
 * The half worth the check is the touch screen. It has no pointer, but it does
 * have `:hover`: the cell last tapped keeps it, and keeps it through a zoom or
 * a scroll that carries the finger nowhere near, which used to strand a lit
 * cell behind. So the hover half is offered to real pointers only, and the way
 * to measure that is to hold a cell hovered on a screen that reports itself
 * touch. A reading of nothing lit would be worth nothing if the cell were not
 * hovered, so that is measured too. What a tap leaves there is the mark.
 */
import { check, pad } from "./lib/browser.mjs";

const CELL = 3 * 9 + 3;

const look = (index) => {
  const hex = document
    .querySelectorAll(".cells .cell")
    [index].querySelector(".hex");
  const style = getComputedStyle(hex);
  return {
    hovered: hex.closest(".cell").matches(":hover"),
    paint: `${style.fill} ringed ${style.stroke}`,
  };
};

const phone = { viewport: { width: 390, height: 780 }, hasTouch: true };

for (const style of ["hex", "goban"]) {
  await check(`The one mark, on the ${style} board`, async ({ open }) => {
    const page = await open("#9n,");
    await page.selectOption("#mode", "inspect");
    if (style !== "hex") await page.selectOption("#style", style);
    await page.waitForTimeout(200);

    const cells = page.locator(".cells .cell");
    const plain = await page.evaluate(look, CELL);
    await cells.nth(CELL).hover();
    await page.waitForTimeout(60);
    const hovered = await page.evaluate(look, CELL);
    await cells.nth(CELL).click();
    await page.mouse.move(2, 2);
    await page.waitForTimeout(60);
    const tapped = await page.evaluate(look, CELL);

    console.log(`  ${pad("untouched", 10)}${plain.paint}`);
    console.log(`  ${pad("hovered", 10)}${hovered.paint}`);
    console.log(`  ${pad("tapped", 10)}${tapped.paint}`);
    if (!hovered.hovered) throw new Error("the cell was not hovered at all");
    if (hovered.paint === plain.paint)
      throw new Error("hovering the cell left it alone");
    if (tapped.paint !== hovered.paint)
      throw new Error("a tap leaves a different mark from the pointer");
  });
}

await check("What a finger is offered", async ({ open }) => {
  for (const style of ["hex", "goban"]) {
    const page = await open("#9n,", phone);
    await page.selectOption("#mode", "inspect");
    if (style !== "hex") await page.selectOption("#style", style);
    await page.waitForTimeout(200);

    const cells = page.locator(".cells .cell");
    const plain = await page.evaluate(look, CELL);
    await cells.nth(CELL).hover();
    await page.waitForTimeout(60);
    const held = await page.evaluate(look, CELL);
    await cells.nth(CELL).tap();
    await page.waitForTimeout(80);
    const tapped = await page.evaluate(look, CELL);

    console.log(
      `  ${pad(style, 7)}held hovered: ${held.hovered}, and still ${held.paint}`,
    );
    console.log(`  ${pad("", 7)}tapped: ${tapped.paint}`);
    if (!held.hovered)
      throw new Error("the cell was not hovered, so this proves nothing");
    if (held.paint !== plain.paint)
      throw new Error(`${style}: a touch screen lit the cell anyway`);
    if (tapped.paint === plain.paint)
      throw new Error(`${style}: a tap left no mark`);
    await page.close();
  }
});
