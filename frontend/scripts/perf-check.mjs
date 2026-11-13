// Vérification locale des performances et du rendu (Playwright).
// Usage : node scripts/perf-check.mjs [baseUrl]
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4173";
const pages = ["/connexion", "/inscription", "/tarifs", "/", "/fonctionnalites", "/ecoles"];

const browser = await chromium.launch({ channel: "chrome" });

for (const path of pages) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const failures = [];
  const errors = [];
  const consoleErrors = [];
  let bytes = 0;
  const resources = [];

  page.on("requestfailed", (req) => failures.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`));
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("response", async (res) => {
    try {
      const sizes = await res.request().sizes();
      const size = sizes.responseBodySize + sizes.responseHeadersSize;
      bytes += size;
      resources.push({ url: res.url(), type: res.request().resourceType(), size, status: res.status() });
    } catch {
      /* réponse interrompue */
    }
  });

  const start = Date.now();
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 60000 });
  const loadMs = Date.now() - start;

  // Attendre les polices, puis vérifier que chaque icône utilisée a bien un glyphe.
  const iconCheck = await page.evaluate(async () => {
    await document.fonts.ready;
    const els = [...document.querySelectorAll(".material-symbols-rounded")];
    const names = [...new Set(els.map((el) => (el.textContent ?? "").trim()).filter(Boolean))];
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return { names, missing: ["canvas indisponible"] };
    ctx.font = '24px "Material Symbols Rounded"';
    // Un glyphe d'icône occupe une chasse d'environ 24 px ; un nom non trouvé
    // est rendu comme du texte normal, donc bien plus large.
    const missing = names.filter((name) => ctx.measureText(name).width > 30);
    return {
      names,
      missing,
      fontLoaded: document.fonts.check('24px "Material Symbols Rounded"'),
      family: els[0] ? getComputedStyle(els[0]).fontFamily : null,
    };
  });

  const images = await page.evaluate(() =>
    [...document.images].map((img) => ({
      src: img.currentSrc || img.getAttribute("src") || "",
      loaded: img.complete && img.naturalWidth > 0,
      width: img.naturalWidth,
    })),
  );
  const brokenImages = images.filter((img) => img.src && !img.loaded);

  const lcp = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const entries = performance.getEntriesByType("largest-contentful-paint");
        resolve(entries.length ? Math.round(entries[entries.length - 1].startTime) : null);
      }),
  );

  console.log(`\n=== ${path} ===`);
  console.log(`chargement complet : ${loadMs} ms | LCP : ${lcp ?? "n/a"} ms | transféré : ${(bytes / 1024).toFixed(0)} Ko`);
  console.log(
    "ressources :",
    resources
      .filter((r) => r.size > 0)
      .sort((a, b) => b.size - a.size)
      .slice(0, 8)
      .map((r) => `${r.type}:${(r.size / 1024).toFixed(0)}Ko:${r.url.replace(base, "")}`)
      .join(" | "),
  );
  if (brokenImages.length) console.log("IMAGES NON CHARGÉES :", brokenImages);
  if (iconCheck.missing?.length) console.log("ICÔNES SANS GLYPHE :", iconCheck.missing.join(", "));
  console.log(`police d'icônes : ${iconCheck.fontLoaded ? "chargée" : "NON CHARGÉE"} (${iconCheck.names.length} icônes)`);
  if (failures.length) console.log("REQUÊTES ÉCHOUÉES :", failures);
  if (errors.length) console.log("ERREURS JS :", errors);
  if (consoleErrors.length) console.log("ERREURS CONSOLE :", consoleErrors.slice(0, 5));

  await page.screenshot({ path: `temp-${path.replace(/\W+/g, "_") || "home"}.png`, fullPage: false });
  await context.close();
}

await browser.close();
