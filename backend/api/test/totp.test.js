/**
 * Tests unitaires — TOTP RFC 6238 (backend/api/src/lib/totp.js).
 *
 * Vecteurs officiels de l'appendice B (SHA-1, 6 chiffres, pas de 30 s) avec
 * le secret ASCII "12345678901234567890" (base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ).
 *
 * Exécution : node --test backend/api/test/totp.test.js
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  base32Decode,
  base32Encode,
  buildOTPAuthURI,
  generateTOTPCode,
  generateTOTPSecret,
  verifyTOTPCode,
  findTotpStep,
} from "../src/lib/totp.js";
import { verifyTotpForAgent } from "../src/lib/totpStore.js";

const RFC_SECRET_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const RFC_SECRET_ASCII = "12345678901234567890";

/** Vecteurs RFC 6238 (codes sur 8 chiffres dans l'appendice B). Notre
 * implémentation produit 6 chiffres : on compare donc les 6 derniers. */
const RFC_VECTORS = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
];

/* ------------------------------------------------------------------ */
/* Base32                                                             */
/* ------------------------------------------------------------------ */

test("base32Encode produit le secret RFC 6238 connu", () => {
  const encoded = base32Encode(new TextEncoder().encode(RFC_SECRET_ASCII));
  assert.strictEqual(encoded, RFC_SECRET_B32);
});

test("base32Decode/Encode font un aller-retour", () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  assert.deepEqual(Array.from(base32Decode(base32Encode(bytes))), Array.from(bytes));
});

test("base32Decode rejette les caractères hors alphabet (8, 9, 0, 1)", () => {
  for (const bad of ["ABCDEFGH8", "ABCDEFGH9", "ABCDEFGH0", "ABCDEFGH1", "abc@defg"]) {
    assert.throws(() => base32Decode(bad), /base32 invalide/i, `secret accepté : ${bad}`);
  }
});

test("generateTOTPSecret produit 32 caractères base32 valides", () => {
  const secret = generateTOTPSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/);
});

test("buildOTPAuthURI contient secret, issuer et paramètres RFC", () => {
  const uri = buildOTPAuthURI(RFC_SECRET_B32, "admin@classora.sn");
  assert.ok(uri.includes(`secret=${RFC_SECRET_B32}`));
  assert.ok(uri.includes("algorithm=SHA1"));
  assert.ok(uri.includes("digits=6"));
  assert.ok(uri.includes("period=30"));
});

/* ------------------------------------------------------------------ */
/* generateTOTPCode — vecteurs RFC 6238                                */
/* ------------------------------------------------------------------ */

test("les vecteurs RFC 6238 sont reproduits exactement", () => {
  // Le counter vaut floor(T / 30) : pour T=59 il vaut 1 (premier vecteur).
  for (const [seconds, rfc8] of RFC_VECTORS) {
    assert.strictEqual(
      generateTOTPCode(RFC_SECRET_B32, seconds * 1000),
      rfc8.slice(-6),
      `vecteur T=${seconds} (RFC ${rfc8})`,
    );
  }
});

test("generateTOTPCode avec counter=1 (T=30s) donne 287082 (RFC 94287082 sur 6 chiffres) et ne lève pas", () => {
  assert.doesNotThrow(() => generateTOTPCode(RFC_SECRET_B32, 30_000));
  assert.strictEqual(generateTOTPCode(RFC_SECRET_B32, 30_000), "287082");
});

test("generateTOTPCode avec counter=2 (T=60s) ne lève pas et renvoie 6 chiffres", () => {
  const code = generateTOTPCode(RFC_SECRET_B32, 60_000);
  assert.match(code, /^\d{6}$/);
});

test("generateTOTPCode refuse un secretbase32 invalide", () => {
  assert.throws(() => generateTOTPCode("NOTBASE32!"), /base32 invalide/i);
});

/* ------------------------------------------------------------------ */
/* verifyTOTPCode — tolérance et anti-replay                            */
/* ------------------------------------------------------------------ */

test("verifyTOTPCode accepte le code du step courant", () => {
  const secret = generateTOTPSecret();
  const now = Date.now();
  assert.strictEqual(verifyTOTPCode(secret, generateTOTPCode(secret, now), now), true);
});

test("verifyTOTPCode refuse un code déjà utilisé (anti-replay)", () => {
  const secret = generateTOTPSecret();
  const now = Date.now();
  const code = generateTOTPCode(secret, now);
  assert.strictEqual(verifyTOTPCode(secret, code, now), true);
  assert.strictEqual(verifyTOTPCode(secret, code, now + 1000), false, "replay accepté");
});

test("verifyTOTPCode refuse un code du step FUTUR (pas de tolérance +1)", () => {
  const secret = generateTOTPSecret();
  const now = Date.now();
  const futureCode = generateTOTPCode(secret, now + 30_000);
  assert.strictEqual(verifyTOTPCode(secret, futureCode, now), false);
});

test("verifyTOTPCode accepte un code du step précédent (décalage d'horloge)", () => {
  const secret = generateTOTPSecret();
  const now = 1_700_000_000_000;
  const previousCode = generateTOTPCode(secret, now - 30_000);
  assert.strictEqual(verifyTOTPCode(secret, previousCode, now), true);
});

test("verifyTOTPCode refuse un token mal formé", () => {
  const secret = generateTOTPSecret();
  for (const token of ["", "12345", "1234567", "abcdef", null, 123456]) {
    assert.strictEqual(verifyTOTPCode(secret, token, Date.now()), false);
  }
});

/* ------------------------------------------------------------------ */
/* Anti-replay persistant (multi-instances)                            */
/* ------------------------------------------------------------------ */

test("findTotpStep renvoie le pas courant et refuse le futur", () => {
  const secret = generateTOTPSecret();
  const now = 1_700_000_000_000;
  const current = generateTOTPCode(secret, now);
  assert.strictEqual(findTotpStep(secret, current, now), Math.floor(now / 1000 / 30));
  assert.strictEqual(findTotpStep(secret, generateTOTPCode(secret, now + 30_000), now), null);
});

test("verifyTotpForAgent consomme le step via la RPC et échoue fermé", async () => {
  const secret = generateTOTPSecret();
  const now = 1_700_000_000_000;
  const token = generateTOTPCode(secret, now);
  const calls = [];
  const svcOk = { rpc: async (name, args) => { calls.push([name, args]); return { data: true, error: null }; } };
  assert.strictEqual(await verifyTotpForAgent(svcOk, "agent-1", secret, token, now), true);
  assert.strictEqual(calls[0][0], "consume_totp_step");
  assert.strictEqual(typeof calls[0][1].p_step, "number");

  const svcReject = { rpc: async () => ({ data: false, error: null }) }; // rejeu
  assert.strictEqual(await verifyTotpForAgent(svcReject, "agent-1", secret, token, now), false);
  const svcError = { rpc: async () => ({ data: null, error: new Error("DB down") }) };
  assert.strictEqual(await verifyTotpForAgent(svcError, "agent-1", secret, token, now), false);
  assert.strictEqual(await verifyTotpForAgent(svcOk, "agent-1", secret, "000000", now), false);
});
