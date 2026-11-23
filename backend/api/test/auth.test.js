/**
 * Tests unitaires — authentification (backend/api/src/lib/auth.js).
 *
 * Fonctions pures testables sans base de données :
 *   - generateTempPassword() : format, solidite, aleatoire
 *   - passwordError() : regles de validation
 *
 * Execution : node --test backend/api/test/auth.test.js
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateTempPassword, passwordError, EMAIL_RE, SN_PHONE_RE } from "../src/lib/auth.js";

/* ------------------------------------------------------------------ */
/* generateTempPassword                                               */
/* ------------------------------------------------------------------ */

test("generateTempPassword retourne une chaine de 12 caracteres", () => {
  const pwd = generateTempPassword();
  assert.strictEqual(typeof pwd, "string");
  assert.strictEqual(pwd.length, 12);
});

test("generateTempPassword contient au moins une minuscule, une majuscule et un chiffre", () => {
  const pwd = generateTempPassword();
  assert.ok(/[a-z]/.test(pwd), "minuscule manquante dans : " + pwd);
  assert.ok(/[A-Z]/.test(pwd), "majuscule manquante dans : " + pwd);
  assert.ok(/\d/.test(pwd), "chiffre manquant dans : " + pwd);
});

test("generateTempPassword est aleatoire (deux appels != )", () => {
  const p1 = generateTempPassword();
  const p2 = generateTempPassword();
  assert.notStrictEqual(p1, p2, "deux appels consecutifs ont genere le meme mot de passe");
});

test("generateTempPassword n'utilise jamais les caracteres ambigus 0/O/1/I", () => {
  const ambigu = /[0O1I]/;
  for (let i = 0; i < 100; i++) {
    assert.ok(!ambigu.test(generateTempPassword()), "caractere ambigu trouve");
  }
});

test("generateTempPassword ne retourne jamais une chaine vide ni null", () => {
  assert.ok(generateTempPassword().length > 0);
});

/* ------------------------------------------------------------------ */
/* passwordError                                                      */
/* ------------------------------------------------------------------ */

test("passwordError rejette un mot de passe vide", () => {
  assert.strictEqual(passwordError(""), "Le mot de passe est obligatoire.");
});

test("passwordError rejette un mot de passe trop court (< 8)", () => {
  assert.ok(passwordError("Abc123").includes("8 caract\u00e8res"));
});

test("passwordError rejette sans majuscule", () => {
  assert.ok(passwordError("abcdefgh1").includes("majuscule"));
});

test("passwordError rejette sans minuscule", () => {
  assert.ok(passwordError("ABCDEFGH1").includes("minuscule"));
});

test("passwordError rejette sans chiffre", () => {
  assert.ok(passwordError("Abcdefgh").includes("chiffre"));
});

test("passwordError accepte un mot de passe valide (8+ car, maj, min, chiffre)", () => {
  assert.strictEqual(passwordError("Abcdefgh1"), null);
});

test("passwordError accepte un mot de passe plus long", () => {
  assert.strictEqual(passwordError("MotDePasse123!"), null);
});

/* ------------------------------------------------------------------ */
/* Regex utilitaires                                                  */
/* ------------------------------------------------------------------ */

test("EMAIL_RE accepte des emails valides", () => {
  assert.ok(EMAIL_RE.test("prenom.nom@ecole.sn"));
  assert.ok(EMAIL_RE.test("directeur@mon-ecole.edu.sn"));
});

test("EMAIL_RE rejette des emails invalides", () => {
  assert.ok(!EMAIL_RE.test("pas-un-email"));
  assert.ok(!EMAIL_RE.test("@sansdomaine.com"));
  assert.ok(!EMAIL_RE.test("utilisateur@"));
});

test("SN_PHONE_RE accepte les numeros senegalais avec ou sans +221", () => {
  assert.ok(SN_PHONE_RE.test("77 123 45 67"));
  assert.ok(SN_PHONE_RE.test("+221 77 123 45 67"));
  assert.ok(SN_PHONE_RE.test("70 123 45 67"));
});

test("SN_PHONE_RE rejette les numeros invalides", () => {
  assert.ok(!SN_PHONE_RE.test("01 23 45 67"));
  assert.ok(!SN_PHONE_RE.test("abc"));
});
