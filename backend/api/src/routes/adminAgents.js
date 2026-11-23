/**
 * Gestion des agents administratifs Classora.
 * Toutes les opérations sont réservées au superadmin (liste, création,
 * modification de rôle, désactivation). L'identité et le rôle viennent du
 * profil admin_agents, jamais du client.
 */
import { passwordError, revokeUserSessions } from "../lib/auth.js";
import { auditAdmin, requireAdminRole, serviceClient } from "../lib/authAdmin.js";
import { badRequest, forbidden, notFound, ok, route, serverError, RATE_LIMIT_RE, logError } from "../lib/http.js";
import { enforceRateLimit } from "../lib/rateLimit.js";
import { expectObject, requireEmail, requireString, requireUuid, ValidationError } from "../lib/validate.js";

const ADMIN_ROLES = Object.freeze(["superadmin", "admin", "agent_suivi"]);

// Handler principal : GET/POST/PATCH /admin/agents — gestion des agents (superadmin).
export default route(async (req, res) => {
  const svc = serviceClient();
  try {
    // Résout l'appelant et son rôle admin.
    const admin = await requireAdminRole(svc, req, res);
    if (!admin) return;
    const { caller } = admin;

    if (req.method === "GET") {
      // Liste des agents : réservée au superadmin (elle expose les e-mails et
      // téléphones de toute l'équipe, et la navigation la cache aux autres rôles).
      if (caller.role !== "superadmin") {
        return forbidden(res, "Seul le superadministrateur peut consulter la liste des agents.");
      }
      await enforceRateLimit(svc, `admin-agents-list:${caller.id}`, 30, 300);

      const { data: agents, error } = await svc
        .from("admin_agents")
        .select("id, matricule, role, status, first_name, last_name, email, phone, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (error) throw new Error("Impossible de charger les agents.");

      return ok(res, {
        agents: agents.map((a) => ({
          id: a.id,
          matricule: a.matricule,
          role: a.role,
          status: a.status,
          firstName: a.first_name,
          lastName: a.last_name,
          email: a.email,
          phone: a.phone,
          createdAt: a.created_at,
          updatedAt: a.updated_at,
        })),
      });
    }

    if (req.method === "POST") {
      // Création d'un nouvel agent (superadmin uniquement).
      if (caller.role !== "superadmin") {
        return forbidden(res, "Seul le superadministrateur peut créer un agent.");
      }
      await enforceRateLimit(svc, `admin-agents-create:${caller.id}`, 10, 300);

      const body = expectObject(req.body);
      const role = requireString(body, "role", "Le rôle", { max: 20 });
      if (!ADMIN_ROLES.includes(role)) {
        return badRequest(res, "Rôle invalide.");
      }
      const firstName = requireString(body, "firstName", "Le prénom", { min: 1, max: 60 });
      const lastName = requireString(body, "lastName", "Le nom", { min: 1, max: 60 });
      const email = requireEmail(body);
      const phone = optionalPhone(body);
      // Mot de passe FIXE choisi par le superadministrateur : aucun mot de passe
      // temporaire n'est généré ni affiché. L'agent se connecte avec ce mot de
      // passe tant qu'il n'est pas remplacé.
      const password = requireString(body, "password", "Le mot de passe", { min: 8, max: 72, trim: false });
      const pwdError = passwordError(password);
      if (pwdError) throw new ValidationError(`Mot de passe invalide : ${pwdError}`);

      // Génère la matricule côté serveur.
      const { data: matriculeData, error: matriculeError } = await svc.rpc("generate_admin_matricule");
      if (matriculeError || !matriculeData) {
        throw new Error("Impossible de générer la matricule administrative.");
      }
      const matricule = matriculeData;

      // Crée le compte Auth via service_role.
      const { data: created, error: createError } = await svc.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role, school_id: null },
      });
      if (createError || !created?.user) {
        const duplicate = /already|duplicate|registered/i.test(createError?.message ?? "");
        return badRequest(
          res,
          duplicate ? "Un compte existe déjà avec cet e-mail." : "Impossible de créer le compte administrateur. Réessayez.",
        );
      }

      try {
        // Crée le profil agent (id renvoyé pour le journal d'audit — même
        // espace d'identifiants que la branche PATCH).
        const { data: inserted, error: profileError } = await svc
          .from("admin_agents")
          .insert({
            auth_user_id: created.user.id,
            matricule,
            role,
            status: "ACTIF",
            first_name: firstName,
            last_name: lastName,
            email,
            phone: phone ?? "",
          })
          .select("id, matricule, role, status")
          .single();
        if (profileError || !inserted) throw new Error(profileError?.message ?? "réponse vide après insertion");

        await auditAdmin(svc, {
          schoolId: null,
          actorId: caller.id,
          actorRole: caller.role,
          action: "admin_agent_created",
          entity: "admin_agents",
          entityId: inserted.id,
          payload: { matricule, role, email },
        });

        return ok(res, {
          userId: created.user.id,
          matricule,
          email,
          firstName,
          lastName,
          role,
        });
      } catch (sqlError) {
        // Nettoyage : supprime le compte Auth si le profil échoue.
        await svc.auth.admin.deleteUser(created.user.id);
        const message = sqlError instanceof Error ? sqlError.message : undefined;
        if (message && /un compte existe déjà|unique|duplicate/i.test(message)) return badRequest(res, message);
        logError("admin-agents", sqlError);
        return serverError(res);
      }
    }

    if (req.method === "PATCH") {
      // Modification d'un agent (rôle, statut, informations).
      await enforceRateLimit(svc, `admin-agents-patch:${caller.id}`, 30, 300);
      const body = expectObject(req.body);
      const agentId = requireUuid(body, "agentId", "L'identifiant de l'agent");

      const { data: target, error: targetError } = await svc
        .from("admin_agents")
        .select("id, role, status, auth_user_id")
        .eq("id", agentId)
        .maybeSingle();
      if (targetError || !target) {
        return notFound(res, "Agent introuvable.");
      }

      // Seul le superadmin peut modifier un autre agent ; un admin ne peut
      // pas modifier un superadmin ni changer le rôle d'un agent à superadmin.
      if (caller.id !== target.auth_user_id && caller.role !== "superadmin") {
        return forbidden(res, "Seul le superadministrateur peut modifier un autre agent.");
      }
      if (caller.role !== "superadmin" && target.role === "superadmin") {
        return forbidden(res, "Seul le superadministrateur peut modifier un superadministrateur.");
      }

      // Protections anti-verrouillage : un superadmin ne peut ni se
      // rétrograder ni se désactiver lui-même, et le DERNIER superadmin
      // actif ne peut être ni rétrogradé ni désactivé (sinon plus aucun
      // accès à la console sans repasser par le script d'amorçage).
      const downgradesTarget =
        (body.role !== undefined && body.role !== "superadmin") ||
        (body.status !== undefined && body.status !== "ACTIF");
      if (caller.id === target.auth_user_id && caller.role === "superadmin" && downgradesTarget) {
        return forbidden(res, "Un superadministrateur ne peut pas se rétrograder ni se désactiver lui-même.");
      }
      if (target.role === "superadmin" && downgradesTarget) {
        const { count } = await svc
          .from("admin_agents")
          .select("*", { count: "exact", head: true })
          .eq("role", "superadmin")
          .eq("status", "ACTIF");
        if ((count ?? 0) <= 1) {
          return forbidden(res, "Impossible de modifier le dernier superadministrateur actif.");
        }
      }

      const patch = {};
      if (body.role !== undefined) {
        const newRole = requireString(body, "role", "Le rôle", { max: 20 });
        if (!ADMIN_ROLES.includes(newRole)) return badRequest(res, "Rôle invalide.");
        if (caller.role !== "superadmin") return forbidden(res, "Seul le superadministrateur peut modifier un rôle.");
        patch.role = newRole;
      }
      if (body.status !== undefined) {
        const newStatus = requireString(body, "status", "Le statut", { max: 20 });
        if (!["ACTIF", "EN_ATTENTE", "DESACTIVE"].includes(newStatus)) return badRequest(res, "Statut invalide.");
        patch.status = newStatus;
      }
      if (body.firstName !== undefined) patch.first_name = requireString(body, "firstName", "Le prénom", { min: 1, max: 60 });
      if (body.lastName !== undefined) patch.last_name = requireString(body, "lastName", "Le nom", { min: 1, max: 60 });
      if (body.phone !== undefined) patch.phone = optionalSnPhoneField(body);
      if (body.email !== undefined) {
        patch.email = requireEmail(body, "email");
      }

      if (Object.keys(patch).length === 0) {
        return badRequest(res, "Aucune modification fournie.");
      }

      // Mise à jour atomique (garde « dernier superadmin » incluse) via RPC.
      // La RPC est appelée AVANT la modification de Supabase Auth : si elle
      // échoue, l'email Auth n'est jamais touché, évitant toute divergence
      // entre le profil admin_agents et le compte Auth.
      const { data: updatedOk, error: updateError } = await svc.rpc("admin_update_agent", {
        p_agent_id: agentId,
        p_patch: patch,
        p_downgrades: downgradesTarget,
      });
      if (updateError) {
        if (/unique|duplicate/i.test(updateError.message)) return badRequest(res, "Cet e-mail ou matricule est déjà utilisé.");
        logError("admin-agents", updateError);
        return serverError(res);
      }
      if (updatedOk === false) {
        return forbidden(res, "Impossible de modifier le dernier superadministrateur actif.");
      }

      // Un changement d'e-mail doit aussi modifier le compte Supabase Auth
      // APRÈS la RPC réussie. Si cette étape échoue, l'email dans Auth reste
      // l'ancien : divergence à corriger manuellement par l'admin, mais aucune
      // donnée n'est corrompue (le profil reste cohérent).
      if (patch.email) {
        const { error: authEmailError } = await svc.auth.admin.updateUserById(target.auth_user_id, {
          email: patch.email,
          email_confirm: true,
        });
        if (authEmailError) {
          logError("admin-agents:auth-email", authEmailError);
          // On ne fait pas échouer l'opération : la RPC a réussi, seul Auth
          // diverge. L'admin sera alerté via le journal d'audit.
        }
      }

      // Désactivation : révocation des sessions de l'agent (refresh tokens).
      if (patch.status === "DESACTIVE") await revokeUserSessions(svc, target.auth_user_id);

      await auditAdmin(svc, {
        schoolId: null,
        actorId: caller.id,
        actorRole: caller.role,
        action: "admin_agent_updated",
        entity: "admin_agents",
        entityId: agentId,
        payload: patch,
      });

      return ok(res, { message: "Agent mis à jour." });
    }

    return ok(res, { error: "Méthode non autorisée." }, 405);
  } catch (e) {
    if (e instanceof Error && e.name === "ValidationError") return badRequest(res, e.message);
    if (e instanceof Error && RATE_LIMIT_RE.test(e.message)) return ok(res, { error: e.message }, 429);
    logError("admin-agents", e);
    return serverError(res);
  }
});

/** Valide un téléphone optionnel à la création d'un agent. Entrée : corps. Sortie : téléphone ou undefined. */
function optionalPhone(body) {
  const raw = body["phone"];
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") throw new ValidationError("Le téléphone est invalide.");
  if (!/^(\+221)?\s?7(?:0|[5-8])\s?\d{3}\s?\d{2}\s?\d{2}$/.test(raw.trim())) {
    throw new ValidationError("Le téléphone est invalide.");
  }
  return raw.trim();
}

/** Même contrôle téléphone qu'à la création, mais chaîne vide si absent (mise à jour PATCH). */
function optionalSnPhoneField(body) {
  const raw = body["phone"];
  if (raw === undefined || raw === null || raw === "") return "";
  if (typeof raw !== "string") throw new ValidationError("Le téléphone est invalide.");
  if (!/^(\+221)?\s?7(?:0|[5-8])\s?\d{3}\s?\d{2}\s?\d{2}$/.test(raw.trim())) {
    throw new ValidationError("Le téléphone est invalide.");
  }
  return raw.trim();
}