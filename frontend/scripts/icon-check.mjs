// Vérifie que chaque nom d'icône utilisé dans le code a bien un glyphe dans
// le sous-ensemble auto-hébergé de Material Symbols.
import fs from "node:fs";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4173";
const names = fs.readFileSync(".icon-names-strict.txt", "utf8").split(/\r?\n/).filter(Boolean);

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.goto(base + "/connexion", { waitUntil: "domcontentloaded" });

const result = await page.evaluate(async (all) => {
  const style = document.createElement("style");
  style.textContent = '@font-face{font-family:"MS";src:url("/fonts/material-symbols-rounded.woff2?v=1") format("woff2");font-display:block}';
  document.head.appendChild(style);
  await document.fonts.load('24px "MS"', all.join(" "));
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = '24px "MS"';
  const widths = {};
  for (const name of all) widths[name] = Math.round(ctx.measureText(name).width * 10) / 10;
  return { loaded: document.fonts.check('24px "MS"'), widths };
}, names);

const missing = Object.entries(result.widths)
  .filter(([, w]) => w > 30)
  .map(([n]) => n);
const present = Object.entries(result.widths).filter(([, w]) => w <= 30).length;

console.log("police chargée :", result.loaded);
console.log(`glyphes trouvés : ${present}/${names.length}`);
console.log("noms sans glyphe (à vérifier : faux positifs possibles) :", missing.join(", ") || "aucun");
await browser.close();
