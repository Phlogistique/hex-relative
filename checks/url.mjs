/**
 * Opening hexworld's URLs, in the browser rather than in url.js alone: the
 * page has to end up on the right board, with the right cursor and numbering,
 * and rewrite the fragment to something hexworld would read back.
 */
import { check, pad } from "./lib/browser.mjs";

const CASES = [
  ["three moves", "#13,d10j9d5", "#13,d10j9d5", 3],
  ["rewound", "#13,d10j9,d5", "#13,d10j9,d5", 2],
  ["at the start", "#13,,d10j9d5", "#13,,d10j9d5", 0],
  ["numbered", "#13n,d10j9d5", "#13n,d10j9d5", 3],
  ["rotated (read past)", "#11r3,f6", "#11,f6", 1],
  ["swap-sides (read past)", "#13,d10:Sj9", "#13,d10j9", 2],
  ["relative coordinates", "#13,44.54'.5'4", "#13,d10j9d5", 3],
  ["one colour, by passes", "#5,a1:pb1:pc1", "#5,a1:pb1:pc1", 3],
  ["a swap", "#5,a2:s", "#5,a2:s", 1],
  ["an older link of ours", "#13:rd10,bj9@1", "#13n,d10,j9", 1],
  ["oblong, unreadable", "#11x13,d10", "#13n", 0],
];

await check("Opening hexworld URLs", async ({ open }) => {
  for (const [label, given, rewritten, stones] of CASES) {
    const page = await open(given);
    const got = await page.evaluate(() => ({
      hash: location.hash,
      stones: document.querySelectorAll(".stone:not(.hidden)").length,
      note: document.getElementById("status").textContent,
    }));
    console.log(
      `  ${pad(label, 24)}${pad(given, 18)}-> ${pad(got.hash, 18)}${got.stones} stones${got.note ? "  " + got.note : ""}`,
    );
    if (got.hash !== rewritten || got.stones !== stones) {
      throw new Error(
        `${label}: wanted ${rewritten} with ${stones} stones, got ${got.hash} with ${got.stones}`,
      );
    }
    await page.close();
  }
});
