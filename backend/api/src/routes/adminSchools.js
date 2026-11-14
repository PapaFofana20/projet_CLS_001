/**
 * Gestion transversale des établissements : l'agent administratif peut
 * consulter toutes les écoles, modifier leurs informations et gérer leurs
 * statuts (activation/suspension). L'identité et les permissions viennent
 * du profil admin_agents, jamais du client.
 */
import { auditAdmin, requireAdminRole, serviceClient } from "../lib/authAdmin.js";
import { badRequest, forbidden, notFound, ok, route, serverError, RATE_LIMIT_RE, logError } from "../lib/http.js";
import { enforceRateLimit } from "../lib/rateLimit.js";
import { expectObject, requireEmail, requireSnPhone, requireString, requireUuid, ValidationError } from "../lib/validate.js";

// Handler principal : GET/PATCH/POST/DELETE /admin/schools — gestion transversale des écoles.
export default route(async (req, res) => {
  const svc = serviceClient();
  try {
    const admin = await requireAdminRole(svc, req, res);
    if (!admin) return;
    const { caller } = admin;

    if (req.method === "GET") {
      // Liste des écoles avec recherche, filtres, tri, pagination.
      // Réservée à admin+superadmin : agent_suivi ne doit pas avoir accès
      // à l'exhaustivité des établissements (données personnelles, effectifs,
      // abonnements…). Voir H-01 de l'audit.
      if (!["admin", "superadmin"].includes(caller.role)) {
        return forbidden(res, "Votre rôle ne permet pas de consulter la liste des établissements.");
      }
      await enforceRateLimit(svc, `admin-schools-list:${caller.id}`, 30, 300);

      // Fiche complète d'un établissement (direction, effectifs, classes,
      // enseignants, abonnement) quand l'identifiant est fourni.
      const idParam = (req.query.id ?? "").toString().trim();
      if (idParam) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam)) {
          return badRequest(res, "Identifiant d'établissement invalide.");
        }
        return schoolProfile(svc, res, idParam);
      }

      // parseInt NaN → repli sur les valeurs par défaut (sinon .range(NaN) → 500).
      const rawPage = parseInt(req.query.page ?? "1", 10);
      const rawPageSize = parseInt(req.query.pageSize ?? "20", 10);
      const page = Number.isInteger(rawPage) ? Math.max(1, rawPage) : 1;
      const pageSize = Number.isInteger(rawPageSize) ? Math.min(100, Math.max(1, rawPageSize)) : 20;
      // Échappement LIKE + PostgREST : \, %, _ mais aussi , ( ) . — dans un
      // filtre ilike PostgREST, « , » et « ) » peuvent casser/interpréter
      // la syntaxe du filtre (injection de filtre).
      const search = (req.query.search ?? "").toString().trim()
        .replace(/\\/g, "\\\\")   // échapper le backslash EN PREMIER (B8)
        .replace(/[%_(),.]/g, (c) => `\\${c}`);
      const rawStatus = req.query.status ? String(req.query.status) : null;
      if (rawStatus !== null && !["ACTIF", "SUSPENDUE", "TOUTES"].includes(rawStatus)) {
        return badRequest(res, "Statut de filtre invalide.");
      }
      const status = rawStatus === "TOUTES" ? null : rawStatus;
      const SORTABLE = new Set(["name", "matricule", "city", "created_at"]);
      const sortBy = SORTABLE.has(String(req.query.sortBy)) ? String(req.query.sortBy) : "created_at";
      const sortDir = req.query.sortDir === "asc" ? "asc" : "desc";

      let query = svc
        .from("schools")
        .select("id, name, matricule, city, address, phone, email, logo_url, cycles, registration_open, auto_approve_students, created_at", { count: "exact" });

      if (search) {
        query = query.ilike("name", `%${search}%`);
      }

      // Filtre par statut : `registration_open` est la valeur que l'action
      // setStatus modifie et que le badge « Actif / Suspendu » du front lit.
      // (L'ancien code passait un builder Supabase à `.in()`, ce qui produisait
      // un filtre PostgREST invalide et cassait le filtre.)
      if (status === "ACTIF") {
        query = query.eq("registration_open", true);
      } else if (status === "SUSPENDUE") {
        query = query.eq("registration_open", false);
      }

      const { data: schools, error, count } = await query
        .order(sortBy, { ascending: sortDir === "asc" })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (error) throw new Error("Impossible de charger les établissements.");

      return ok(res, {
        schools: (schools ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          matricule: s.matricule ?? "",
          city: s.city,
          address: s.address,
          phone: s.phone,
          email: s.email,
          logoUrl: s.logo_url,
          cycles: s.cycles ?? [],
          registrationOpen: s.registration_open,
          autoApproveStudents: s.auto_approve_students,
          createdAt: s.created_at,
        })),
        total: count ?? 0,
        page,
        pageSize,
      });
    }

    if (req.method === "PATCH") {
      // Modification d'une école (informations administratives).
      // Réservée aux rôles admin+ : agent_suivi est en lecture seule.
      if (!["admin", "superadmin"].includes(caller.role)) {
        return forbidden(res, "Votre rôle ne permet pas de modifier un établissement.");
      }
      await enforceRateLimit(svc, `admin-schools-patch:${caller.id}`, 30, 300);
      const body = expectObject(req.body);
      const schoolId = requireUuid(body, "schoolId", "L'identifiant de l'établissement");

      // Statut d'inscription / approbation automatique : réservés au
      // superadmin, exactement comme setStatus — sinon un agent de niveau
      // inférieur pouvait réactiver les inscriptions d'une école suspendue.
      const touchesStatusFields =
        body.registrationOpen !== undefined || body.autoApproveStudents !== undefined;
      if (touchesStatusFields && caller.role !== "superadmin") {
        return forbidden(res, "Seul le superadministrateur peut modifier le statut d'un établissement.");
      }

      const patch = {};
      if (body.name !== undefined) patch.name = requireString(body, "name", "Le nom de l'école", { min: 2, max: 120 });
      if (body.city !== undefined) patch.city = requireString(body, "city", "La ville", { min: 1, max: 80 });
      if (body.address !== undefined) patch.address = requireString(body, "address", "L'adresse", { max: 200 });
      if (body.phone !== undefined) patch.phone = requireSnPhone(body, "phone", "Le téléphone");
      if (body.email !== undefined) patch.email = requireEmailField(body);
      if (body.cycles !== undefined) {
        const cycles = requireCyclesField(body);
        patch.cycles = cycles;
      }
      if (body.registrationOpen !== undefined) patch.registration_open = body.registrationOpen === true;
      if (body.autoApproveStudents !== undefined) patch.auto_approve_students = body.autoApproveStudents === true;

      if (Object.keys(patch).length === 0) {
        return badRequest(res, "Aucune modification fournie.");
      }

      const { data: updated, error: updateError } = await svc
        .from("schools")
        .update(patch)
        .eq("id", schoolId)
        .select("id, name, matricule")
        .maybeSingle();
      if (updateError) {
        if (/duplicate|unique/i.test(updateError.message)) return badRequest(res, "Un établissement existe déjà avec ces informations.");
        logError("admin-schools", updateError);
        return serverError(res);
      }
      if (!updated) {
        return notFound(res, "Établissement introuvable.");
      }

      await auditAdmin(svc, {
        schoolId,
        actorId: caller.id,
        actorRole: caller.role,
        action: "admin_school_updated",
        entity: "schools",
        entityId: schoolId,
        payload: patch,
      });

      return ok(res, {
        id: updated.id,
        name: updated.name,
        matricule: updated.matricule,
      });
    }

    if (req.method === "POST" && req.body && req.body.action === "setStatus") {
      // Activation / suspension d'une école (superadmin uniquement).
      if (caller.role !== "superadmin") {
        return forbidden(res, "Seul le superadministrateur peut modifier le statut d'un établissement.");
      }
      await enforceRateLimit(svc, `admin-schools-status:${caller.id}`, 30, 300);

      const body = expectObject(req.body);
      const schoolId = requireUuid(body, "schoolId", "L'identifiant de l'établissement");
      const newStatus = requireString(body, "status", "Le statut", { max: 20 });
      if (!["ACTIF", "SUSPENDUE"].includes(newStatus)) {
        return badRequest(res, "Statut invalide.");
      }

      // Met à jour le statut via registration_open (suspendue = inscriptions closes + école désactivée).
      // `.select("id")` + contrôle du résultat : sans retour, une UUID
      // inexistante produisait « activé avec succès » (0 ligne modifiée n'est
      // pas une erreur PostgREST).
      const { data: updated, error: updateError } = await svc
        .from("schools")
        .update({ registration_open: newStatus === "ACTIF" })
        .eq("id", schoolId)
        .select("id")
        .maybeSingle();
      if (updateError) return serverError(res);
      if (!updated) return notFound(res, "Établissement introuvable.");

      await auditAdmin(svc, {
        schoolId,
        actorId: caller.id,
        actorRole: caller.role,
        action: "admin_school_status_changed",
        entity: "schools",
        entityId: schoolId,
        payload: { newStatus },
      });

      return ok(res, { message: `Établissement ${newStatus === "ACTIF" ? "activé" : "suspendu"} avec succès.` });
    }

    if (req.method === "DELETE") {
      // Suppression définitive d'un établissement (superadmin uniquement).
      // Irréversible : toutes les données de l'école partent en cascade et
      // ses comptes Auth sont supprimés. La matricule exacte doit être
      // fournie en confirmation — elle protège d'une suppression précipitée
      // sur la mauvaise ligne.
      if (caller.role !== "superadmin") {
        return forbidden(res, "Seul le superadministrateur peut supprimer un établissement.");
      }
      await enforceRateLimit(svc, `admin-schools-delete:${caller.id}`, 5, 300);

      const body = expectObject(req.body);
      const schoolId = requireUuid(body, "schoolId", "L'identifiant de l'établissement");
      // Matricule de confirmation (5 caractères) — ou nom de l'établissement
      // en repli : la matricule scolaire reste NULL tant qu'aucun paiement
      // d'abonnement n'a été confirmé.
      const confirmation = requireString(body, "confirmation", "La confirmation de suppression", { min: 2, max: 120 });

      const { data: school, error: findError } = await svc
        .from("schools")
        .select("id, name, matricule")
        .eq("id", schoolId)
        .maybeSingle();
      if (findError || !school) {
        return notFound(res, "Établissement introuvable.");
      }
      // H-4 : la confirmation EXIGE la matricule (le nom, public et devinable,
      // ne peut plus servir de confirmation pour une suppression irréversible).
      if (!school.matricule) {
        return badRequest(res, "Cet établissement n'a pas de matricule : la suppression est bloquée. Contactez le support.");
      }
      if (confirmation !== school.matricule) {
        return badRequest(res, "La confirmation saisie ne correspond pas à cet établissement.");
      }

      // (H5) Suppression TRANSACTIONNELLE via RPC security definer :
      // les élèves et l'école partagent UNE transaction Postgres. Si une
      // étape échoue, rien n'est supprimé (avant : les élèves partaient
      // d'abord, un échec suivant perdait les élèves sans supprimer l'école).
      // La RPC collecte aussi les ids des comptes Auth à nettoyer après coup.
      const { data: purge, error: purgeError } = await svc.rpc("admin_purge_school", {
        p_school_id: schoolId,
      });
      if (purgeError || !purge) {
        logError("admin-schools", purgeError);
        return serverError(res);
      }

      const authUserIds = purge.auth_user_ids ?? [];

      // Suppression des comptes Auth devenus orphelins (best-effort : les
      // données sont déjà supprimées, un échec ne fait pas échouer l'opération).
      let authUsersRemoved = 0;
      for (const userId of authUserIds) {
        const { error: userDeleteError } = await svc.auth.admin.deleteUser(userId);
        if (!userDeleteError) authUsersRemoved += 1;
      }

      await auditAdmin(svc, {
        schoolId: null,
        actorId: caller.id,
        actorRole: caller.role,
        action: "admin_school_deleted",
        entity: "schools",
        entityId: schoolId,
        payload: {
          matricule: purge.matricule,
          name: purge.school_name,
          students: purge.students ?? 0,
          accounts: authUserIds.length,
          authUsersRemoved,
        },
      });

      return ok(res, {
        message: `Établissement ${purge.school_name} supprimé définitivement.`,
        authUsersRemoved,
      });
    }

    // POST sans action reconnue : 400 explicite (et non un 405 générique).
    if (req.method === "POST") {
      return badRequest(res, "Action inconnue.");
    }

    return ok(res, { error: "Méthode non autorisée." }, 405);
  } catch (e) {
    if (e instanceof Error && e.name === "ValidationError") return badRequest(res, e.message);
    if (e instanceof Error && RATE_LIMIT_RE.test(e.message)) return ok(res, { error: e.message }, 429);
    logError("admin-schools", e);
    return serverError(res);
  }
});

/** Valide l'e-mail d'une école (minuscules, format simple). Entrée : corps. Sortie : e-mail normalisé. */
function requireEmailField(body) {
  const raw = requireString(body, "email", "L'e-mail", { max: 120, trim: true });
  const email = raw.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new ValidationError("L'e-mail est invalide.");
  }
  return email;
}

/** Valide les cycles d'une école (liste blanche, sans doublons). */
function requireCyclesField(body) {
  const raw = body["cycles"];
  const allowed = new Set(["elementaire", "moyen", "secondaire"]);
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ValidationError("Sélectionnez au moins un cycle.");
  }
  const cycles = raw.filter((c) => typeof c === "string" && allowed.has(c));
  if (cycles.length === 0 || cycles.length !== raw.length) {
    throw new ValidationError("Sélection de cycles invalide.");
  }
  return Array.from(new Set(cycles));
}

/**
 * Fiche complète d'un établissement : direction, effectifs, classes,
 * enseignants et abonnement. Requêtes ciblées côté serveur — le navigateur
 * ne télécharge jamais les données brutes des élèves.
 */
async function schoolProfile(svc, res, schoolId) {
  const today = new Date().toISOString().slice(0, 10);

  const { data: school, error } = await svc.from("schools").select("*").eq("id", schoolId).maybeSingle();
  if (error || !school) return notFound(res, "Établissement introuvable.");

  // Direction (un directeur en pratique, liste exhaustive par sécurité).
  const { data: directors, error: directorsError } = await svc
    .from("profiles")
    .select("id, first_name, last_name, email, phone, status, created_at")
    .eq("school_id", schoolId)
    .eq("role", "directeur");
  if (directorsError) throw new Error("Impossible de charger la direction.");

  // Effectifs globaux (garçons comptés explicitement : total − filles
  // comptait un éventuel sexe non renseigné parmi les garçons).
  const { count: studentsTotal } = await svc.from("students").select("*", { count: "exact", head: true }).eq("school_id", schoolId);
  const { count: girls } = await svc.from("students").select("*", { count: "exact", head: true }).eq("school_id", schoolId).eq("gender", "F");
  const { count: boys } = await svc.from("students").select("*", { count: "exact", head: true }).eq("school_id", schoolId).eq("gender", "M");
  const { count: parents } = await svc.from("profiles").select("*", { count: "exact", head: true }).eq("school_id", schoolId).eq("role", "parent");

  // Classes avec libellé de niveau et effectif par classe (une seule requête
  // sur la colonne class_id pour tous les comptes).
  const { data: classes, error: classesError } = await svc
    .from("class_rooms")
    .select("id, name, level_id, cycle, capacity")
    .eq("school_id", schoolId)
    .order("name");
  if (classesError) throw new Error("Impossible de charger les classes.");
  const { data: levels } = await svc.from("levels").select("id, label");
  const levelLabels = new Map((levels ?? []).map((l) => [l.id, l.label]));
  const { data: classLinks } = await svc.from("students").select("class_id").eq("school_id", schoolId);
  const perClass = new Map();
  for (const s of classLinks ?? []) perClass.set(s.class_id, (perClass.get(s.class_id) ?? 0) + 1);

  // Enseignants : liste limitée (50) + total exact.
  const { data: teachers, count: teachersTotal } = await svc
    .from("teachers")
    .select("id, kind, first_name, last_name, email, phone, specialties", { count: "exact" })
    .eq("school_id", schoolId)
    .order("last_name")
    .limit(50);

  // Abonnement avec sa formule (FK plan_id → plans).
  const { data: sub } = await svc
    .from("subscriptions")
    .select("starts_at, ends_at, student_limit, amount_paid, method, paid_at, plans(id, name, tagline, student_limit, monthly_price, yearly_price)")
    .eq("school_id", schoolId)
    .maybeSingle();
  const subscription = sub
    ? {
        plan: sub.plans
          ? {
              id: sub.plans.id,
              name: sub.plans.name,
              tagline: sub.plans.tagline,
              studentLimit: sub.plans.student_limit,
              monthlyPrice: sub.plans.monthly_price,
              yearlyPrice: sub.plans.yearly_price,
            }
          : null,
        startsAt: sub.starts_at,
        endsAt: sub.ends_at,
        studentLimit: sub.student_limit,
        amountPaid: sub.amount_paid,
        method: sub.method,
        paidAt: sub.paid_at,
        status: !sub.ends_at ? "AUCUN" : sub.ends_at < today ? "EXPIRE" : "ACTIF",
      }
    : null;

  const director = (directors ?? [])[0]
    ? {
        id: directors[0].id,
        firstName: directors[0].first_name,
        lastName: directors[0].last_name,
        email: directors[0].email,
        phone: directors[0].phone,
        status: directors[0].status,
        memberSince: directors[0].created_at,
      }
    : null;

  return ok(res, {
    school: {
      id: school.id,
      name: school.name,
      matricule: school.matricule ?? "",
      city: school.city,
      address: school.address,
      phone: school.phone,
      email: school.email,
      logoUrl: school.logo_url,
      cycles: school.cycles ?? [],
      registrationOpen: school.registration_open,
      autoApproveStudents: school.auto_approve_students,
      createdAt: school.created_at,
    },
    director,
    stats: {
      students: studentsTotal ?? 0,
      girls: girls ?? 0,
      boys: boys ?? 0,
      classes: (classes ?? []).length,
      teachers: teachersTotal ?? 0,
      parents: parents ?? 0,
    },
    classes: (classes ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      level: levelLabels.get(c.level_id) ?? c.level_id,
      cycle: c.cycle,
      capacity: c.capacity,
      studentCount: perClass.get(c.id) ?? 0,
    })),
    teachers: (teachers ?? []).map((t) => ({
      id: t.id,
      kind: t.kind,
      firstName: t.first_name,
      lastName: t.last_name,
      email: t.email,
      phone: t.phone,
      specialties: t.specialties ?? [],
    })),
    teachersTotal: teachersTotal ?? 0,
    subscription,
  });
}
