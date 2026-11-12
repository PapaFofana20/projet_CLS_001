/**
 * Vérification de session administrative : l'appelant doit être un agent
 * Classora (profil admin_agents ACTIF). L'identité provient du JWT vérifié
 * par Supabase Auth — jamais décodée sans signature.
 */
import { audit, getAuthenticatedUser, serviceClient } from "../lib/auth.js";
import { auditAdmin } from "../lib/authAdmin.js";
import { ok, RATE_LIMIT_RE, route, serverError, unauthorized, logError } from "../lib/http.js";
import { enforceRateLimit } from "../lib/rateLimit.js";

// Handler principal : POST /admin/auth — vérifie la session d'un agent admin.
export default route(async (req, res) => {
  if (req.method !== "POST") return ok(res, { error: "Méthode non autorisée." }, 405);
  const svc = serviceClient();
  try {
    const user = await getAuthenticatedUser(svc, req);
    if (!user) return unauthorized(res);

    await enforceRateLimit(svc, `admin-auth:${user.id}`, 30, 300);

    // Séparation stricte des espaces : un compte scolaire (directeur,
    // enseignant, parent — table profiles) ne peut JAMAIS accéder à la
    // console d'administration, même si une ligne admin_agents le visait
    // (donnée croisée). Le contrôle passe AVANT la recherche de l'agent.
    const { data: schoolProfile } = await svc
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (schoolProfile) {
      await audit(svc, {
        schoolId: null,
        actorId: user.id,
        actorRole: "scolaire",
        action: "admin_login_blocked_school_account",
        entity: "profiles",
        entityId: user.id,
      });
      return ok(res, {
        error: "Ce compte est un compte scolaire : il n'a pas accès à l'administration. Utilisez la connexion école.",
      }, 403);
    }

    // Cherche le profil admin_agent de l'utilisateur connecté.
    const { data: agent, error } = await svc
      .from("admin_agents")
      .select("id, matricule, role, status, first_name, last_name, email, phone, created_at, totp_enabled")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (error || !agent) {
      return unauthorized(res, "Aucun profil administrateur associé à ce compte.");
    }

    if (agent.status !== "ACTIF") {
      await audit(svc, {
        schoolId: null,
        actorId: user.id,
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

    // Si le MFA est activé pour cet agent, exiger une session MFA vérifiée
    // (créée via POST /admin/mfa/verify après validation du second facteur).
    if (agent.totp_enabled === true) {
      const { data: mfaSession } = await svc
        .from("admin_mfa_sessions")
        .select("id")
        .eq("agent_id", agent.id)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (!mfaSession) {
        await auditAdmin(svc, {
          actorId: user.id,
          actorRole: agent.role,
          action: "admin_auth_mfa_required",
          entity: "admin_agents",
          entityId: agent.id,
          payload: { matricule: agent.matricule },
        });
        return ok(res, { error: "Second facteur requis.", mfaRequired: true }, 403);
      }
    }

    await audit(svc, {
      schoolId: null,
      actorId: user.id,
      actorRole: agent.role,
      action: "admin_login",
      entity: "admin_agents",
      entityId: agent.id,
      payload: { matricule: agent.matricule },
    });

    return ok(res, {
      status: "ACTIF",
      agent: {
        id: agent.id,
        matricule: agent.matricule,
        role: agent.role,
        status: agent.status,
        firstName: agent.first_name,
        lastName: agent.last_name,
        email: agent.email,
        phone: agent.phone,
        createdAt: agent.created_at,
      },
    });
  } catch (e) {
    if (e instanceof Error && RATE_LIMIT_RE.test(e.message)) return ok(res, { error: e.message }, 429);
    logError("admin-auth", e);
    return serverError(res);
  }
});