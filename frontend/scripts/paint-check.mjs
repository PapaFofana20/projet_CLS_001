// Mesure FCP / LCP réels à froid (cache vidé) pour chaque page publique.
// Usage : node scripts/paint-check.mjs [baseUrl]
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4173";
const pages = ["/connexion", "/inscription", "/tarifs", "/", "/fonctionnalites", "/ecoles"];

const browser = await chromium.launch({ channel: "chrome" });

for (const path of pages) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.addInitScript(() => {
    window.__paint = { fcp: null, lcp: null };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") window.__paint.fcp = Math.round(entry.startTime);
      }
    }).observe({ type: "paint", buffered: true });
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) window.__paint.lcp = Math.round(last.startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });

  const start = Date.now();
  await page.goto(base + path, { waitUntil: "commit", timeout: 60000 });

  // Premier élément de contenu visible (titre du formulaire ou du hero).
  const visibleMs = await page.evaluate(async () => {
    const deadline = performance.now() + 15000;
    while (performance.now() < deadline) {
      const el = document.querySelector("h1, h2");
      if (el && el.getBoundingClientRect().height > 0) return Math.round(performance.now());
      await new Promise((r) => requestAnimationFrame(r));
    }
    return null;
  });

  const navMs = Date.now() - start;
  await page.waitForTimeout(2500);
  const paint = await page.evaluate(() => window.__paint);

  console.log(
    `${path.padEnd(18)} FCP ${String(paint.fcp ?? "n/a").padStart(5)} ms | LCP ${String(paint.lcp ?? "n/a").padStart(5)} ms | titre visible ${String(visibleMs ?? "n/a").padStart(5)} ms | navigation ${navMs} ms`,
  );

  await context.close();
}

await browser.close();
