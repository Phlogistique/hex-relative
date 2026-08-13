/**
 * The swap is only on offer as the reply to the opening move — the same test
 * hexworld puts on its own button. The history will hold a swap anywhere, so
 * a link carrying one elsewhere still opens; it is the button that is barred.
 */
import { check, pad } from "./lib/browser.mjs";

const CASES = [
  ["empty board", "#13", true],
  ["after one stone", "#13,d10", false],
  ["after two stones", "#13,d10j9", true],
  ["rewound to one stone", "#13,d10,j9", false],
  ["rewound to empty", "#13,,d10j9", true],
  ["opened with a pass", "#13,:p", true],
  ["already swapped", "#13,d10:s", true],
];

await check("When a swap is offered", async ({ open }) => {
  for (const [label, hash, disabled] of CASES) {
    const page = await open(hash);
    const got = await page.evaluate(
      () => document.getElementById("swap").disabled,
    );
    console.log(
      `  ${pad(label, 24)}${pad(hash, 16)}${got ? "disabled" : "offered"}`,
    );
    if (got !== disabled)
      throw new Error(`${label}: wanted ${disabled ? "disabled" : "offered"}`);
    await page.close();
  }

  // stepping back to the opening move offers it again
  const page = await open("#13,d10j9");
  await page.click("#prev");
  const back = await page.evaluate(
    () => document.getElementById("swap").disabled,
  );
  console.log(
    `  ${pad("stepped back to move 1", 24)}${pad("", 16)}${back ? "disabled" : "offered"}`,
  );
  if (back)
    throw new Error("stepping back to the opening move should offer the swap");
});
