// Vérifie que les images différées se chargent bien une fois visibles.
// Usage : node scripts/lazy-check.mjs [baseUrl]
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4173";
const pages = ["/", "/ecoles", "/fonctionnalites", "/tarifs", "/inscription", "/connexion"];

const browser = await chromium.launch({ channel: "chrome" });

for (const path of pages) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 60000 });

  // Défilement progressif pour déclencher le chargement différé.
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 250));
    }
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);

  const images = await page.evaluate(() =>
    [...document.images].map((img) => ({
      src: img.currentSrc || img.getAttribute("src") || "",
      loaded: img.complete && img.naturalWidth > 0,
    })),
  );
  const broken = images.filter((img) => img.src && !img.loaded);
  const total = images.filter((img) => img.src).length;
  console.log(
    `${path.padEnd(18)} ${total - broken.length}/${total} images chargées${broken.length ? " | ÉCHEC : " + broken.map((b) => b.src).join(", ") : ""}`,
  );

  await context.close();
}

await browser.close();
