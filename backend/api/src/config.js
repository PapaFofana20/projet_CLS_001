/**
 * Configuration serveur (variables d'environnement — Render > Environment).
 * AUCUNE clé secrète côté navigateur : SUPABASE_SERVICE_ROLE_KEY ne vit
 * que sur Render.
 */

const parsedPort = Number(process.env.PORT ?? 3000);
/** PORT valide (app.listen(NaN) échouerait de façon obscure). */
export const PORT = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65536 ? parsedPort : 3000;

/** URL publique du projet Supabase, ex. https://xxxx.supabase.co */
export const SUPABASE_URL = process.env.SUPABASE_URL ?? "";

/** Clé service_role — JAMAIS exposée au navigateur. */
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/**
 * Clé dédiée au chiffrement AES-256-GCM des secrets TOTP au repos.
 * Fallback sur SERVICE_KEY (dérivé en SHA-256) pour compatibilité avec les
 * déploiements existants. Rotation : changer cette valeur rend les secrets
 * déjà chiffrés illisibles — prévoir une migration (déchiffrement avec
 * l'ancienne clé puis ré-chiffrement) avant toute rotation en production.
 */
export const TOTP_ENCRYPTION_KEY = process.env.TOTP_ENCRYPTION_KEY ?? "";

/**
 * Secret HMAC signant les jetons de pré-authentification MFA (après mot de
 * passe, avant code TOTP). Fallback : SERVICE_KEY dérivé en SHA-256.
 */
export const MFA_PREAUTH_SECRET = process.env.MFA_PREAUTH_SECRET ?? "";

/**
 *_origine du front autorisée en CORS, ex. https://classora.onrender.com.
 * Plusieurs origines : séparées par des virgules.
 */
export const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "";
