/**
 * Chiffrement au repos des secrets TOTP admin (AES-256-GCM).
 *
 * La clé est dérivée (SHA-256) de SUPABASE_SERVICE_ROLE_KEY : aucune nouvelle
 * variable d'environnement requise, et le secret ne repose jamais en clair en
 * base. Format : "enc:v1:<iv_b64>:<tag_b64>:<cipher_b64>".
 *
 * Compatibilité : une valeur sans le préfixe "enc:v1:" est traitée comme un
 * secret historique en clair (migration progressive) et renvoyée telle quelle.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { SERVICE_KEY } from "../config.js";

const PREFIX = "enc:v1:";

function deriveKey() {
  if (!SERVICE_KEY) throw new Error("Configuration serveur incomplète (SUPABASE_SERVICE_ROLE_KEY).");
  return createHash("sha256").update(SERVICE_KEY).digest();
}

/** Chiffre un secret TOTP. Retourne la valeur à stocker en base. */
export function encryptTOTPSecret(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/** Déchiffre un secret TOTP stocké. Les secrets historiques en clair sont retournés tels quels. */
export function decryptTOTPSecret(stored) {
  if (stored == null) return null;
  if (typeof stored !== "string" || !stored.startsWith(PREFIX)) return stored;
  const [, ivB64, tagB64, cipherB64] = stored.split(":");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(cipherB64, "base64")), decipher.final()]).toString("utf8");
}
