/**
 * Shared plumbing for the browser checks: a static server for the page, a
 * Chromium to look at it with, and a running tally of anything the console
 * complained about.
 *
 * Two things about this environment are worth knowing before writing another
 * of these, both of which cost time to discover:
 *
 *  - Playwright may only be installed globally, and it is CommonJS, so a bare
 *    `import { chromium } from "playwright"` fails twice over. Hence the
 *    search below.
 *  - Chromium here cannot reach the internet. Do not hand `chromium.launch()`
 *    a proxy to work around that either: with one set, even 127.0.0.1 comes
 *    back 405. To check what is actually deployed, fetch the files with curl
 *    into a directory and point these checks at that instead.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = fileURLToPath(new URL("../../", import.meta.url));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
};

async function chromium() {
  const places = [
    "playwright",
    "/opt/node22/lib/node_modules/playwright/index.js",
  ];
  for (const place of places) {
    try {
      const loaded = await import(place);
      const found = loaded.chromium ?? loaded.default?.chromium;
      if (found) return found;
    } catch {
      // try the next place
    }
  }
  throw new Error(`Playwright not found. Looked in: ${places.join(", ")}`);
}

function serve(root) {
  const server = createServer(async (request, response) => {
    const path = normalize(decodeURI(request.url.split("?")[0])).replace(
      /^(\.\.[/\\])+/,
      "",
    );
    const file = join(root, path === "/" ? "index.html" : path);
    try {
      const body = await readFile(file);
      response.writeHead(200, {
        "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }),
    );
  });
}

/**
 * Run one check. `body` is handed { open, site }, where `open(hash)` returns a
 * page already loaded and watched for console errors. Exits non-zero if the
 * check throws or if the page complained, so these can be chained with &&.
 *
 * Pass `root` to serve a directory other than the repository — the deployed
 * files, for instance.
 */
export async function check(title, body, { root = SITE } = {}) {
  const { server, origin } = await serve(root);
  const browser = await (await chromium()).launch();
  const complaints = [];

  const open = async (hash = "", options = {}) => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      ...options,
    });
    page.on("pageerror", (error) =>
      complaints.push(`page error: ${error.message}`),
    );
    page.on("console", (message) => {
      if (message.type() === "error") complaints.push(message.text());
    });
    await page.goto(origin + "/" + hash, { waitUntil: "networkidle" });
    await page.waitForTimeout(120);
    return page;
  };

  console.log(`\n${title}`);
  let failed = null;
  try {
    await body({ open, site: origin });
  } catch (error) {
    failed = error;
  }
  await browser.close();
  server.close();

  if (complaints.length) {
    console.log("  console complained:\n    " + complaints.join("\n    "));
  } else {
    console.log("  no console errors");
  }
  if (failed) {
    console.error(failed);
    process.exitCode = 1;
  } else if (complaints.length) {
    process.exitCode = 1;
  }
}

/** Pad for the little tables these checks print. */
export const pad = (value, width) => String(value).padEnd(width);
