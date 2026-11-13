// Chronologie réseau : quand démarre chaque requête après la navigation.
// Usage : node scripts/waterfall.mjs [baseUrl] [path]
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4173";
const path = process.argv[3] ?? "/connexion";

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const rows = [];
const t0 = Date.now();

page.on("request", (req) => rows.push({ url: req.url().replace(base, ""), t: Date.now() - t0, type: req.resourceType() }));
page.on("requestfinished", (req) => {
  const row = rows.find((r) => r.url === req.url().replace(base, "") && !r.end);
  if (row) row.end = Date.now() - t0;
});
page.on("requestfailed", (req) => {
  const row = rows.find((r) => r.url === req.url().replace(base, "") && !r.end);
  if (row) row.end = "échec";
});

await page.goto(base + path, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(6000);

console.log(`--- ${path} (t0 = début de navigation) ---`);
for (const r of rows.sort((a, b) => a.t - b.t)) {
  console.log(`${String(r.t).padStart(5)} → ${String(r.end ?? "…").padStart(6)} ms  ${r.type.padEnd(10)} ${r.url}`);
}

await browser.close();
