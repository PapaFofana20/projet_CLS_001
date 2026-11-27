/**
 * Anti-replay TOTP persistant (multi-instances Render).
 *
 * La vérification cryptographique reste dans lib/totp.js ; ici on consomme
 * atomiquement le pas de temps via la RPC Postgres `consume_totp_step`, afin
 * qu'un code accepté sur une instance ne puisse pas être rejoué sur une autre.
 * En cas d'erreur base on échoue fermé (return false) : mieux vaut refuser un
 * code légitime que d'autoriser un rejeu.
 */
import { findTotpStep } from "./totp.js";
import { logError } from "./http.js";

export async function verifyTotpForAgent(svc, agentId, secret, token, now = Date.now()) {
  const step = findTotpStep(secret, token, now);
  if (step === null) return false;
  const { data, error } = await svc.rpc("consume_totp_step", {
    p_agent_id: agentId,
    // Nombre (pas BigInt) : JSON.stringify d'un BigInt lève une TypeError
    // dans supabase-js. Le step reste très en dessous de MAX_SAFE_INTEGER.
    p_step: Number(step),
  });
  if (error) {
    logError("totp-consume", error);
    return false;
  }
  return data === true;
}
