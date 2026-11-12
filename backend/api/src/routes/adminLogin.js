/**
 * Connexion administrative par matricule ou e-mail : résout l'identifiant en
 * e-mail APRÈS vérification du mot de passe auprès de Supabase Auth. Sans
 * secret valide, aucune information n'est révélée — les matricules étant
 * séquentielles (CLA-ADM-000002…), une simple table de correspondance
 * publierait les e-mails de toute l'équipe.
 *
 * Le client termine ensuite par signInWithPassword(email, password) : les
 * jetons de session restent gérés par Supabase côté navigateur, rien ne
 * change pour /admin/auth.
 */
import { SERVICE_KEY, SUPABASE_URL } from "../config.js";
import { auditAdmin, serviceClient } from "../lib/authAdmin.js";
import { ok, route, serverError, RATE_LIMIT_RE, logError } from "../lib/http.js";
import { clientIp, enforceRateLimit } from "../lib/rateLimit.js";
import { expectObject, requireString } from "../lib/validate.js";
import { createPreAuthSession } from "../lib/mfa-sessions.js";

const MATRICULE_RE = /^CLA-ADM-\d{6}$/;
const GENERIC_ERROR = "Matricule/e-mail ou mot de passe incorrect.";

/** Verrouillage progressif en mémoire : compteur d'échecs consécutifs par
 * identifiant. Après 3 échecs, le compte est verrouillé 15 minutes.
 * Réinitialisé à la première réussite. Pas de persistance (perdu au redémarrage),
 * mais suffit à freiner un bruteforce ciblé sans dépendance DB supplémentaire.
 */
const LOGIN_FAILURES = new Map();
const LOCKOUT_WINDOW_MS = 15 * 60_000; // 15 minutes
const MAX_FAILURES = 3;

/** Vrai si l'identifiant a dépassé le seuil d'échecs dans la fenêtre de verrouillage. */
function isLockedOut(identifier) {
  const entry = LOGIN_FAILURES.get(identifier);
  if (!entry) return false;
  if (entry.failures < MAX_FAILURES) return false;
  if (Date.now() - entry.lastFailureAt > LOCKOUT_WINDOW_MS) {
    LOGIN_FAILURES.delete(identifier);
    return false;
  }
  return true;
}

/** Incrémente le compteur d'échecs de connexion pour cet identifiant. */
function recordFailure(identifier) {
  const entry = LOGIN_FAILURES.get(identifier) || { failures: 0, lastFailureAt: 0 };
  entry.failures += 1;
  entry.lastFailureAt = Date.now();
  LOGIN_FAILURES.set(identifier, entry);
  // Borne mémoire : un attaquant ne doit pas pouvoir remplir la Map avec
  // des identifiants aléatoires (DoS mémoire). Au-delà de 10 000 entrées,
  // purge des entrées expirées.
  if (LOGIN_FAILURES.size > 10_000) {
    const now = Date.now();
    for (const [k, v] of LOGIN_FAILURES.entries()) {
      if (now - v.lastFailureAt > LOCKOUT_WINDOW_MS) LOGIN_FAILURES.delete(k);
    }
  }
}

/** Efface le compteur d'échecs après une connexion réussie. */
function clearFailures(identifier) {
  LOGIN_FAILURES.delete(identifier);
}

/** Vérifie (email, password) directement auprès de Supabase Auth. */
async function passwordIsValid(email, password) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    // Timeout ou panne réseau : refus, sans distinguer la cause au client.
    return false;
  }
}

// Handler principal : POST /admin/login — connexion admin par matricule ou e-mail.
export default route(async (req, res) => {
  if (req.method !== "POST") return ok(res, { error: "Méthode non autorisée." }, 405);
  const svc = serviceClient();
  try {
    const body = expectObject(req.body);
    const identifier = requireString(body, "identifier", "L'identifiant", { min: 3, max: 120 });
    const password = requireString(body, "password", "Le mot de passe", { min: 1, max: 72, trim: false });

    const isMatricule = MATRICULE_RE.test(identifier.toUpperCase());
    const value = isMatricule ? identifier.toUpperCase() : identifier.toLowerCase();

    // Débit limité par adresse IP ET par identifiant, avant tout indice.
    await enforceRateLimit(svc, `admin-login:ip:${clientIp(req) ?? "sans-adresse"}`, 20, 300);
    await enforceRateLimit(svc, `admin-login:id:${value}`, 10, 300);

    // Verrouillage progressif après échecs consécutifs (H-03 de l'audit).
    if (isLockedOut(value)) {
      return ok(res, { error: "Compte temporairement verrouillé. Réessayez dans 15 minutes." }, 429);
    }

    // L'identifiant doit correspondre à un agent administratif connu.
    let query = svc.from("admin_agents").select("id, matricule, role, status, email, auth_user_id, totp_enabled");
    query = isMatricule ? query.eq("matricule", value) : query.eq("email", value);
    const { data: agent, error } = await query.maybeSingle();
    if (error || !agent) {
      // Même vérification de mot de passe (jetée) que sur le chemin « agent
      // trouvé » : sans cela, la latence trahissait l'existence d'une
      // matricule — or elles sont séquentielles et donc énumérables.
      await passwordIsValid("matricule-inconnue@classora.invalid", password);
      return ok(res, { error: GENERIC_ERROR }, 401);
    }

    if (!(await passwordIsValid(agent.email, password))) {
      recordFailure(value);
      await auditAdmin(svc, {
        actorId: agent.auth_user_id,
        actorRole: agent.role,
        action: "admin_login_failed",
        entity: "admin_agents",
        entityId: agent.id,
        payload: { matricule: agent.matricule },
      });
      return ok(res, { error: GENERIC_ERROR }, 401);
    }

    if (agent.status !== "ACTIF") {
      await auditAdmin(svc, {
        actorId: agent.auth_user_id,
        actorRole: agent.role,
        action: "admin_login_blocked",
        entity: "admin_agents",
        entityId: agent.id,
        payload: { status: agent.status, matricule: agent.matricule },
      });
      return ok(res, {
        error: `Ce compte administratif est ${agent.status === "DESACTIVE" ? "désactivé" : "en attente de validation"}. Contactez le superadministrateur.`,
      }, 403);
    }

    await auditAdmin(svc, {
      actorId: agent.auth_user_id,
      actorRole: agent.role,
      action: "admin_login_matricule",
      entity: "admin_agents",
      entityId: agent.id,
      payload: { matricule: agent.matricule },
    });

    // Connexion réussie : on efface le compteur d'échecs.
    clearFailures(value);

    // Si le MFA est activé, on ne retourne pas encore l'email : il faut
    // d'abord valider le second facteur via POST /admin/mfa/verify.
    if (agent.totp_enabled === true) {
      const preAuthToken = createPreAuthSession(agent.id);
      await auditAdmin(svc, {
        actorId: agent.auth_user_id,
        actorRole: agent.role,
        action: "admin_login_mfa_required",
        entity: "admin_agents",
        entityId: agent.id,
        payload: { matricule: agent.matricule },
      });
      return ok(res, { mfaRequired: true, preAuthToken });
    }

    return ok(res, { email: agent.email });
  } catch (e) {
    if (e instanceof Error && RATE_LIMIT_RE.test(e.message)) return ok(res, { error: e.message }, 429);
    logError("admin-login", e);
    return serverError(res);
  }
});
