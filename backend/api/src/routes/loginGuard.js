/**
 * Contrôle POST-connexion : vérification du statut du compte avec les mêmes
 * messages que le front (authService.login). Supabase Auth ouvre une session
 * même pour un compte EN_ATTENTE/DESACTIVE : c'est cet endpoint qui décide
 * si la session est exploitable (les politiques RLS le rappellent, en dur).
 *
 * L'identité de l'appelant est résolue par JWT VÉRIFIÉ (getAuthenticatedUser),
 * journaux d'audit écrits APRÈS verdict, débit limité par compte vérifié.
 */

import { audit, getAuthenticatedUser, serviceClient } from "../lib/auth.js";
import { methodNotAllowed, ok, route, serverError, unauthorized, RATE_LIMIT_RE, logError } from "../lib/http.js";
import { enforceRateLimit } from "../lib/rateLimit.js";

// Handler principal : POST /login-guard — vérifie le statut du compte après connexion.
export default route(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res);
  const svc = serviceClient();
  try {
    const user = await getAuthenticatedUser(svc, req);
    if (!user) return unauthorized(res);

    await enforceRateLimit(svc, `login-guard:${user.id}`, 20, 300);

    const { data: profile, error } = await svc
      .from("profiles")
      .select("id, school_id, role, status, must_change_password")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      // Panne base ≠ identifiants invalides : ne pas présenter une erreur
      // Supabase comme un échec de connexion.
      throw new Error("Impossible de vérifier le compte.");
    }
    if (!profile) {
      // Aucun profil scolaire : l'appelant peut être un agent admin_agents
      // (espace admin) ou un inconnu. On fait toujours la vérification
      // admin_agents (pour l'audit) mais on renvoie UN MESSAGE UNIQUE — jamais
      // de différenciation qui permettrait l'énumération d'emails.
      const { data: adminAgent } = await svc
        .from("admin_agents")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (adminAgent) {
        await audit(svc, {
          schoolId: null,
          actorId: user.id,
          actorRole: "admin",
          action: "login_blocked_admin_agent",
          entity: "admin_agents",
          entityId: user.id,
        });
      }
      return unauthorized(res, "E-mail ou mot de passe incorrect.");
    }

    if (profile.status === "DESACTIVE") {
      await audit(svc, {
        schoolId: profile.school_id,
        actorId: profile.id,
        actorRole: profile.role,
        action: "login_blocked_desactive",
        entity: "profiles",
        entityId: profile.id,
      });
      return ok(res, {
        status: "DESACTIVE",
        error: "Ce compte a été désactivé par la direction de votre école. Contactez votre école.",
      });
    }
    if (profile.status === "EN_ATTENTE") {
      await audit(svc, {
        schoolId: profile.school_id,
        actorId: profile.id,
        actorRole: profile.role,
        action: "login_blocked_en_attente",
        entity: "profiles",
        entityId: profile.id,
      });
      return ok(res, {
        status: "EN_ATTENTE",
        error: "Votre demande d'inscription est en attente de validation par votre école.",
      });
    }

    // Liste blanche : tout statut inconnu (future valeur) est refusé, jamais
    // traité comme ACTIF par effet du fall-through.
    if (profile.status !== "ACTIF") {
      await audit(svc, {
        schoolId: profile.school_id,
        actorId: profile.id,
        actorRole: profile.role,
        action: "login_blocked_unknown_status",
        entity: "profiles",
        entityId: profile.id,
        payload: { status: profile.status },
      });
      return ok(res, {
        status: profile.status,
        error: "Ce compte n'est pas activé. Contactez votre école.",
      }, 403);
    }

    await audit(svc, {
      schoolId: profile.school_id,
      actorId: profile.id,
      actorRole: profile.role,
      action: "login",
      entity: "profiles",
      entityId: profile.id,
    });

    return ok(res, {
      status: "ACTIF",
      schoolId: profile.school_id,
      role: profile.role,
      mustChangePassword: profile.must_change_password,
    });
  } catch (e) {
    if (e instanceof Error && RATE_LIMIT_RE.test(e.message)) return ok(res, { error: e.message }, 429);
    logError("login-guard", e);
    return serverError(res);
  }
});
