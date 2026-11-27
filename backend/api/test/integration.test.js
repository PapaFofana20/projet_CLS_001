/**
 * Tests d'intégration — API Express (backend/api/src/index.js).
 *
 * L'app réelle est démarrée sur un port éphémère (NODE_ENV=test : index.js
 * n'appelle pas listen lui-même) et les requêtes passent par fetch(). Aucun
 * mock.module (API expérimentale absente de Node 26), aucun test factice à
 * assert.ok(true) : chaque test vérifie une réponse HTTP réelle.
 *
 * Les routes touchant Supabase ne sont appelées que sur des chemins qui
 * échouent AVANT tout appel réseau (validation, 405, absence de JWT).
 *
 * Exécution : node --test backend/api/test/integration.test.js
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

let server;
let baseUrl;

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    FRONTEND_ORIGIN: "https://ecole.test",
    PORT: "0",
  });
  // L'export `app` permet de posséder le serveur (et de le fermer) ici.
  const { app } = await import("../src/index.js");
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

/** Requête HTTP réelle ; renvoie { status, headers, body, text }. */
async function request(path, opts = {}) {
  const res = await fetch(`${baseUrl}${path}`, opts);
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Réponse non-JSON : on garde le texte brut pour l'assertion.
  }
  return { status: res.status, headers: res.headers, body, text };
}

/* ------------------------------------------------------------------ */
/* Santé, 404, en-têtes                                                */
/* ------------------------------------------------------------------ */

test("GET /healthz répond 200 { ok: true }", async () => {
  const res = await request("/healthz");
  assert.strictEqual(res.status, 200);
  assert.deepEqual(res.body, { ok: true, service: "scolia-api" });
});

test("GET /healthz porte les en-têtes de durcissement", async () => {
  const res = await request("/healthz");
  assert.strictEqual(res.headers.get("x-content-type-options"), "nosniff");
  assert.strictEqual(res.headers.get("x-frame-options"), "DENY");
  assert.ok(res.headers.get("content-security-policy").includes("default-src 'none'"));
});

test("route inconnue répond 404 avec l'enveloppe { error } (pas de HTML)", async () => {
  const res = await request("/cette-route-nexiste-pas");
  assert.strictEqual(res.status, 404);
  assert.deepEqual(res.body, { error: "Ressource introuvable." });
});

/* ------------------------------------------------------------------ */
/* CORS                                                               */
/* ------------------------------------------------------------------ */

test("CORS : origine configurée autorisée (FRONTEND_ORIGIN)", async () => {
  const res = await request("/healthz", { headers: { Origin: "https://ecole.test" } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get("access-control-allow-origin"), "https://ecole.test");
  assert.strictEqual(res.headers.get("vary"), "Origin");
});

test("CORS : origine inconnue refusée avec 403 { error }", async () => {
  const res = await request("/healthz", { headers: { Origin: "https://intrus.test" } });
  assert.strictEqual(res.status, 403);
  assert.deepEqual(res.body, { error: "Origine non autorisée." });
  assert.strictEqual(res.headers.get("access-control-allow-origin"), null);
});

test("CORS : préflight OPTIONS autorisé avec PATCH/DELETE dans Allow-Methods", async () => {
  const res = await request("/admin/auth", {
    method: "OPTIONS",
    headers: {
      Origin: "https://ecole.test",
      "Access-Control-Request-Method": "PATCH",
    },
  });
  assert.strictEqual(res.status, 204);
  const methods = res.headers.get("access-control-allow-methods") ?? "";
  assert.ok(methods.includes("PATCH"));
  assert.ok(methods.includes("DELETE"));
});

test("CORS : aucune origine joker (même hors production)", async () => {
  // NODE_ENV=test et FRONTEND_ORIGIN fixe : une origine locale non listée
  // doit être refusée, pas acceptée par un wildcard « development ».
  const res = await request("/healthz", { headers: { Origin: "http://localhost:9999" } });
  assert.strictEqual(res.status, 403);
});

/* ------------------------------------------------------------------ */
/* Routes réelles : gardes de méthode et authentification              */
/* ------------------------------------------------------------------ */

test("POST /admin/stats (méthode interdite) répond 405 { error }", async () => {
  const res = await request("/admin/stats", { method: "POST" });
  assert.strictEqual(res.status, 405);
  assert.deepEqual(res.body, { error: "Méthode non autorisée." });
});

test("GET /admin/login (méthode interdite) répond 405 { error }", async () => {
  const res = await request("/admin/login");
  assert.strictEqual(res.status, 405);
  assert.deepEqual(res.body, { error: "Méthode non autorisée." });
});

test("POST /platform-status (méthode interdite) répond 405 { error }", async () => {
  const res = await request("/platform-status", { method: "POST" });
  assert.strictEqual(res.status, 405);
  assert.deepEqual(res.body, { error: "Méthode non autorisée." });
});

test("POST /admin/auth sans JWT répond 401 { error }", async () => {
  const res = await request("/admin/auth", { method: "POST" });
  assert.strictEqual(res.status, 401);
  assert.ok(typeof res.body.error === "string" && res.body.error.length > 0);
});

test("GET /admin/mfa/status sans JWT répond 401 { error }", async () => {
  const res = await request("/admin/mfa/status");
  assert.strictEqual(res.status, 401);
  assert.ok(typeof res.body.error === "string");
});

test("routes /admin/* sans cache (Cache-Control: no-store)", async () => {
  const res = await request("/admin/auth", { method: "POST" });
  assert.strictEqual(res.headers.get("cache-control"), "no-store");
});

test("POST /admin/login avec corps invalide répond 400 { error } sans appel DB", async () => {
  const res = await request("/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "a" }),
  });
  assert.strictEqual(res.status, 400);
  assert.ok(typeof res.body.error === "string" && res.body.error.length > 0);
});

test("corps JSON malformé répond 400 { error } (jamais de HTML d'Express)", async () => {
  const res = await request("/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://ecole.test" },
    body: "{corps invalide",
  });
  assert.strictEqual(res.status, 400);
  assert.deepEqual(res.body, { error: "Requête invalide." });
  // Même sur erreur de parsing, les en-têtes CORS doivent rester lisibles.
  assert.strictEqual(res.headers.get("access-control-allow-origin"), "https://ecole.test");
});
