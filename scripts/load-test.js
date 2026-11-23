/**
 * SCRIPT DE TEST DE CHARGE — Plateforme SCOLIA / Classora
 *
 * Simule N utilisateurs connectés simultanément sur l'API backend pour
 * mesurer le plafond de l'instance Express (Render) avant saturation.
 *
 * Usage :
 *   node scripts/load-test.js              # API locale (http://localhost:3000)
 *   API_URL=https://api.onrender.com node scripts/load-test.js
 *
 * Endpoints testes :
 *   - GET  /healthz                      (sonde, sans auth)
 *   - POST /verify-matricule             (public, rate-limite par IP)
 *   - POST /login-guard                  (authentifie, JWT requis)
 *
 * Resultats : temps de réponse, taux d'erreur, requêtes/seconde.
 */

import { createHash } from "node:crypto";

const API_URL = process.env.API_URL || "http://localhost:3000";
const CONCURRENT = parseInt(process.env.CONCURRENT || "20", 10);   // utilisateurs simultanés
const TOTAL_REQUESTS = parseInt(process.env.TOTAL_REQUESTS || "100", 10); // total des requêtes
const DURATION_SEC = parseInt(process.env.DURATION_SEC || "30", 10); // ou durée fixe

let stats = {
  total: 0,
  ok: 0,
  clientError: 0,
  serverError: 0,
  timeout: 0,
  errors: [],
  latencies: [],
};

function randomMatricule() {
  const n = Math.floor(Math.random() * 900000) + 100000;
  return `CLA-ADM-${String(n).padStart(6, "0")}`;
}

async function fetchWithTimeout(url, opts, timeoutMs = 8000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const start = Date.now();
    const res = await fetch(url, { ...opts, signal: controller.signal });
    const latency = Date.now() - start;
    const body = await res.text().catch(() => "");
    clearTimeout(t);
    return { status: res.status, latency, body };
  } catch (e) {
    clearTimeout(t);
    if (e.name === "AbortError") {
      return { status: 408, latency: timeoutMs, body: "timeout", error: e };
    }
    return { status: 0, latency: timeoutMs, body: "", error: e };
  }
}

async function worker(workerId, endSignal) {
  while (!endSignal.aborted) {
    const idx = stats.total++;
    if (idx >= TOTAL_REQUESTS && TOTAL_REQUESTS > 0) break;

    // Alterne entre les endpoints pour simuler un usage mixte.
    const endpoint = idx % 3 === 0 ? "healthz" : idx % 3 === 1 ? "verify" : "guard";

    let result;
    if (endpoint === "healthz") {
      result = await fetchWithTimeout(`${API_URL}/healthz`, { method: "GET" });
    } else if (endpoint === "verify") {
      result = await fetchWithTimeout(`${API_URL}/verify-matricule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matricule: randomMatricule() }),
      });
    } else {
      // /login-guard besoin d'un JWT valide — on envoie un token bidon pour
      // mesurer le comportement (401 attendu, pas de crash serveur).
      result = await fetchWithTimeout(`${API_URL}/login-guard`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer fake-token-${workerId}-${idx}` },
        body: JSON.stringify({}),
      });
    }

    if (result.error) {
      stats.timeout += 1;
      stats.errors.push(`worker ${workerId} req ${idx}: ${result.error.message}`);
    } else if (result.status >= 200 && result.status < 300) {
      stats.ok += 1;
      stats.latencies.push(result.latency);
    } else if (result.status >= 400 && result.status < 500) {
      stats.clientError += 1;
      stats.latencies.push(result.latency);
    } else {
      stats.serverError += 1;
      stats.latencies.push(result.latency);
    }

    // Petite pause pour ne pas saturer le CPU local (pas un vrai DoS).
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function main() {
  console.log("=== Test de charge — SCOLIA / Classora ===");
  console.log(`API        : ${API_URL}`);
  console.log(`Concurrent : ${CONCURRENT} utilisateurs simultanés`);
  console.log(`Requêtes   : ${TOTAL_REQUESTS} (ou ${DURATION_SEC}s si TOTAL_REQUESTS=0)`);
  console.log("------------------------------------------");

  const start = Date.now();
  const endSignal = { aborted: false };

  // Si TOTAL_REQUESTS = 0, on tourne pendant DURATION_SEC.
  if (TOTAL_REQUESTS <= 0) {
    setTimeout(() => { endSignal.aborted = true; }, DURATION_SEC * 1000);
  }

  const workers = [];
  for (let i = 0; i < CONCURRENT; i++) {
    workers.push(worker(i, endSignal));
  }
  await Promise.all(workers);

  const elapsed = (Date.now() - start) / 1000;
  const totalDone = stats.ok + stats.clientError + stats.serverError + stats.timeout;
  const rps = totalDone / elapsed;
  const sorted = stats.latencies.slice().sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;

  console.log("------------------------------------------");
  console.log(`Temps ecoule : ${elapsed.toFixed(2)}s`);
  console.log(`Requêtes     : ${totalDone}`);
  console.log(`  2xx (OK)   : ${stats.ok}`);
  console.log(`  4xx (client): ${stats.clientError}`);
  console.log(`  5xx (serveur): ${stats.serverError}`);
  console.log(`  timeouts   : ${stats.timeout}`);
  console.log(`Req/seconde  : ${rps.toFixed(1)}`);
  console.log(`Latence p50  : ${p50}ms`);
  console.log(`Latence p95  : ${p95}ms`);
  console.log(`Latence p99  : ${p99}ms`);
  if (stats.errors.length > 0) {
    console.log(`Erreurs      : ${stats.errors.length} (premières :)`);
    stats.errors.slice(0, 5).forEach((e) => console.log("  -", e));
  }

  // Verdict
  console.log("------------------------------------------");
  if (stats.serverError > totalDone * 0.05) {
    console.log("⚠️  VERDICT : taux d'erreur serveur > 5% — l'instance est sous-dimensionnée pour cette charge.");
  } else if (rps < 10) {
    console.log("⚠️  VERDICT : < 10 req/s — l'API est très limitée, prévoir auto-scaling.");
  } else {
    console.log("✅  VERDICT : l'instance tient cette charge sans erreur serveur significative.");
  }
  console.log("=== Fin du test de charge ===");
}

main().catch((e) => {
  console.error("Erreur fatale du test de charge :", e);
  process.exit(1);
});
