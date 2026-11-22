import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const PORT = 5192;
const BASE = `http://localhost:${PORT}`;
const OUT = path.resolve(import.meta.dirname, "..", "..", "shots-tmp");

const server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
  cwd: path.resolve(import.meta.dirname, ".."),
  stdio: "pipe",
  shell: true,
});

async function waitForServer() {
  for (let i = 0; i < 90; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Le serveur vite n'a pas démarré");
}

const browser = await chromium.launch({ channel: "chrome" });
try {
  await waitForServer();
  mkdirSync(OUT, { recursive: true });
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(BASE + "/a-propos", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const vision = page.locator('section[aria-labelledby="vision-title"]');
    await vision.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    await vision.locator("blockquote").scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    await vision.screenshot({ path: path.join(OUT, `vision3-${w}.png`) });
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log("ok", OUT);
