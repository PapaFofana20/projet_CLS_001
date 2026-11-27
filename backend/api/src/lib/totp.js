/**
 * Utilitaires TOTP (Time-Based One-Time Password) — RFC 6238.
 * Implémentation pure (aucune dépendance externe) pour éviter d'alourdir
 * le bundle de production et maîtriser la surface d'attaque.
 *
 * Algorithme :
 *   1. Secret aléatoire (20 bytes = 160 bits) encodé en base32 (RFC 4648).
 *   2. Counter = floor(now / 30s).
 *   3. HMAC-SHA1(secret_bytes, counter sur 8 octets big-endian).
 *   4. Truncation dynamique -> code sur 6 chiffres.
 *
 * La vérification accepte une fenêtre de ±1 step (30 s) pour absorber le
 * décalage d'horloge client/serveur.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { randomBytes } from "node:crypto";

// RFC 4648 : 8 et 9 ne font PAS partie de l'alphabet base32 (les accepter
// rendrait la validation de secret ambiguë et les codes non interopérables).
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_SECONDS = 30;
const TOTP_CODE_DIGITS = 6;
const TOTP_WINDOW = 1; // +/- 1 step accepté

/* ------------------------------------------------------------------ */
/* Base32 (RFC 4648)                                                  */
/* ------------------------------------------------------------------ */

/** Encode un tableau d'octets en base32 standard (avec padding). */
export function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  // Padding pour multiple de 8.
  while (output.length % 8 !== 0) output += "=";
  return output;
}

/** Décode une chaîne base32 en tableau d'octets. */
export function base32Decode(input) {
  if (typeof input !== "string") throw new Error("Secret base32 invalide.");
  const cleaned = input.replace(/=+$/, "").toUpperCase();
  // Rejet explicite de tout caractère hors alphabet (8, 9, 0, 1, ponctuation…)
  // avant la boucle : un secret invalide ne doit jamais produire un code.
  if (!/^[A-Z2-7]+$/.test(cleaned)) throw new Error("Caractère base32 invalide.");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of cleaned) {
    const digit = BASE32_ALPHABET.indexOf(char);
    if (digit === -1) throw new Error("Caractère base32 invalide.");
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/* ------------------------------------------------------------------ */
/* Secret                                                             */
/* ------------------------------------------------------------------ */

/** Génère un secret TOTP aléatoire encodé en base32 (20 bytes). */
export function generateTOTPSecret() {
  return base32Encode(randomBytes(20));
}

/** Construit l'URI otpauth pour affichage / scan par une app authentificateur. */
export function buildOTPAuthURI(secret, emailOrLogin, issuer = "Classora") {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(emailOrLogin);
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_CODE_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}

/* ------------------------------------------------------------------ */
/* Code                                                               */
/* ------------------------------------------------------------------ */

/** Calcule le code TOTP à l'instant donné (défaut : maintenant). */
export function generateTOTPCode(secret, now = Date.now()) {
  const key = base32Decode(secret);
  let counter = BigInt(Math.floor(now / 1000 / TOTP_STEP_SECONDS));
  const counterBuffer = new ArrayBuffer(8);
  const view = new DataView(counterBuffer);
  for (let i = 7; i >= 0; i--) {
    view.setUint8(i, Number(counter & 255n));
    counter /= 256n;
  }
  const hmac = createHmac("sha1", key).update(new Uint8Array(counterBuffer)).digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const code = (binary % 10 ** TOTP_CODE_DIGITS).toString().padStart(TOTP_CODE_DIGITS, "0");
  return code;
}

/** Renvoie le pas de temps TOTP correspondant au code, ou null.
 *  Tolérance d'un step en RETARD seulement (jamais vers le futur : avancer
 *  lastUsed au-delà de l'horloge verrouillerait la fenêtre de l'utilisateur).
 *  Fonction pure : l'anti-replay (mémoire ou base) est appliqué par l'appelant.
 */
export function findTotpStep(secret, token, now = Date.now()) {
  if (typeof token !== "string" || !/^\d{6}$/.test(token)) return null;
  const currentStep = Math.floor(now / 1000 / TOTP_STEP_SECONDS);
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
    if (offset > 0) continue;
    const step = currentStep + offset;
    const expected = generateTOTPCode(secret, step * TOTP_STEP_SECONDS * 1000);
    if (timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return step;
  }
  return null;
}

/** Vérifie un code TOTP avec anti-replay LOCAL (tests / usage sans base).
 *  Les routes admin utilisent verifyTotpForAgent() (lib/totpStore.js), qui
 *  persiste le step consommé en base et fonctionne donc sur plusieurs instances.
 */
const USED_STEPS = new Map(); // clé sha256(secret) -> dernier step consommé
export function verifyTOTPCode(secret, token, now = Date.now()) {
  const step = findTotpStep(secret, token, now);
  if (step === null) return false;
  const secretHash = createHash("sha256").update(String(secret)).digest("hex");
  const currentStep = Math.floor(now / 1000 / TOTP_STEP_SECONDS);
  const lastUsed = USED_STEPS.get(secretHash) ?? -Infinity;
  if (step <= lastUsed) return false; // déjà consommé : replay
  USED_STEPS.set(secretHash, Math.min(step, currentStep));
  const cutoff = currentStep - TOTP_WINDOW - 1;
  for (const [k, v] of USED_STEPS.entries()) {
    if (v < cutoff) USED_STEPS.delete(k);
  }
  return true;
}
