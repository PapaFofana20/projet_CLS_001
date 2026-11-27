/**
 * Tests unitaires — rate limiting (backend/api/src/lib/rateLimit.js).
 *
 * Ces tests ne nécessitent pas de base de données Supabase : on passe un
 * objet `svc` mocké dont la méthode `rpc` simule la RPC `sys_rate_limit`.
 *
 * Exécution : node --test backend/api/test/rateLimit.test.js
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp, enforceRateLimit, RATE_LIMIT_RE } from "../src/lib/rateLimit.js";

/* ------------------------------------------------------------------ */
/* clientIp                                                           */
/* ------------------------------------------------------------------ */

test("clientIp retourne req.ip quand il est défini (proxy Render, trust proxy: 1)", () => {
  const req = { ip: "10.0.0.5", headers: {}, socket: { remoteAddress: "127.0.0.1" } };
  assert.strictEqual(clientIp(req), "10.0.0.5");
});

test("clientIp accepte un X-Forwarded-For à un seul maillon valide", () => {
  const req = {
    ip: "",
    headers: { "x-forwarded-for": "198.51.100.5" },
    socket: { remoteAddress: "127.0.0.1" },
  };
  assert.strictEqual(clientIp(req), "198.51.100.5");
});

test("clientIp REJETTE un XFF forgé à plusieurs maillons (retombée sur le socket)", () => {
  // Avec trust proxy: 1, seul le maillon ajouté par Render est fiable. Une
  // chaîne multi-maillons reçue sans req.ip resolved est falsifiable : on ne
  // prend PAS le dernier maillon (sinon l'attaquant choisit sa clé de rate limit).
  const req = {
    ip: "",
    headers: { "x-forwarded-for": "1.2.3.4, 9.9.9.9, 203.0.113.77" },
    socket: { remoteAddress: "127.0.0.1" },
  };
  assert.strictEqual(clientIp(req), "127.0.0.1");
  assert.notStrictEqual(clientIp(req), "203.0.113.77");
});

test("clientIp REJETTE les XFF à entrées invalides (IPv4 ou IPv6 attendus)", () => {
  const invalid = [
    "not-an-ip",
    "999.999.999.999",
    "198.51.100.5:8080",
    "1.2.3.4, pas-une-ip",
  ];
  for (const value of invalid) {
    const req = { ip: "", headers: { "x-forwarded-for": value }, socket: { remoteAddress: "127.0.0.1" } };
    assert.strictEqual(clientIp(req), "127.0.0.1", `XFF invalide accepté : ${value}`);
  }
});

test("clientIp accepte une IPv6 valide (req.ip ou XFF)", () => {
  assert.strictEqual(clientIp({ ip: "2001:db8::1", headers: {}, socket: {} }), "2001:db8::1");
  assert.strictEqual(
    clientIp({ ip: "", headers: { "x-forwarded-for": "2001:db8::2" }, socket: {} }),
    "2001:db8::2",
  );
});

test("clientIp fallback sur X-Real-IP", () => {
  const req = { ip: "", headers: { "x-real-ip": "198.51.100.7" }, socket: { remoteAddress: "127.0.0.1" } };
  assert.strictEqual(clientIp(req), "198.51.100.7");
});

test("clientIp genere une cle stable par session en dev (pas d'IP, pas de XFF, pas de socket)", () => {
  const req = { ip: null, headers: {}, socket: { remoteAddress: null } };
  const first = clientIp(req);
  const second = clientIp(req);
  assert.ok(first.startsWith("dev:"), "cle dev attendue, obtenu : " + first);
  assert.strictEqual(first, second, "meme cle sur deux appels pour un meme req");
});

test("clientIp retourne une chaine non vide meme sans socket", () => {
  const req = { ip: null, headers: {}, socket: { remoteAddress: null } };
  const result = clientIp(req);
  assert.ok(typeof result === "string" && result.length > 0, "attendu une chaine non vide, obtenu : " + result);
});

/* ------------------------------------------------------------------ */
/* enforceRateLimit                                                   */
/* ------------------------------------------------------------------ */

test("enforceRateLimit laisse passer tant que le compteur est sous le max", async () => {
  let count = 0;
  const svc = {
    async rpc(_name, params) {
      count += 1;
      return { data: count <= params.p_max, error: null };
    },
  };
  for (let i = 0; i < 5; i++) {
    await enforceRateLimit(svc, "test:key", 10, 60);
  }
  assert.strictEqual(count, 5);
});

test("enforceRateLimit rejette quand la limite est atteinte", async () => {
  let count = 0;
  const svc = {
    async rpc(_name, params) {
      count += 1;
      return { data: count <= params.p_max, error: null };
    },
  };
  // p_max = 2 : 2 appels passent, le 3e est refuse (data === false)
  await enforceRateLimit(svc, "test:key", 2, 60);
  await enforceRateLimit(svc, "test:key", 2, 60);
  await assert.rejects(
    () => enforceRateLimit(svc, "test:key", 2, 60),
    /Trop de tentatives/
  );
});

test("enforceRateLimit leve une erreur indisponible si la RPC echoue (fail-closed)", async () => {
  const svc = {
    async rpc() {
      return { data: null, error: new Error("db down") };
    },
  };
  await assert.rejects(() => enforceRateLimit(svc, "test:key", 10, 60), /momentanément indisponible/);
});

test("RATE_LIMIT_RE reconnait le message de rejet", () => {
  assert.ok(RATE_LIMIT_RE.test("Trop de tentatives. Réessayez dans quelques minutes."));
  assert.ok(!RATE_LIMIT_RE.test("Autre erreur"));
});
