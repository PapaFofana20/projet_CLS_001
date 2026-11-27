import type { School, SchoolSettings, SessionUser, Student, Teacher } from "@/types";
import { teacherClassIds } from "@/utils/permissions";
import { assignmentsOf, classesOf, schoolOf, settingsOf, studentsOf, teachersOf, db } from "./db";
import { subscriptionInfoOf } from "./subscriptionService";

// Contrôles d'accès : qui peut voir ou modifier quoi dans une école.

/** École de la session — toutes les requêtes de données doivent partir d'ici. */
export function requireSchool(actor: SessionUser): string {
  if (!actor.schoolId) throw new Error("Aucune école associée à ce compte. Contactez le support.");
  return actor.schoolId;
}

// École et réglages de l'utilisateur connecté (cache local).
export const schoolOfActor = (actor: SessionUser): School | undefined => schoolOf(actor.schoolId);
export const settingsOfActor = (actor: SessionUser): SchoolSettings => settingsOf(actor.schoolId);

// Fiche enseignant liée au compte connecté (undefined si ce n'est pas un enseignant).
export function teacherOf(actor: SessionUser): Teacher | undefined {
  return actor.teacherId ? teachersOf(actor.schoolId).find((t) => t.id === actor.teacherId) : undefined;
}

/** Classes qu'un enseignant peut voir (affectations + classes dont il est titulaire / principal). */
export function visibleClassIds(actor: SessionUser): string[] {
  if (actor.role === "instituteur" || actor.role === "professeur") {
    const id = actor.teacherId ?? "";
    const heads = classesOf(actor.schoolId).filter((c) => c.headTeacherId === id).map((c) => c.id);
    return Array.from(new Set([...teacherClassIds(id, assignmentsOf(actor.schoolId)), ...heads]));
  }
  return classesOf(actor.schoolId).map((c) => c.id);
}

/** Élèves visibles selon le rôle : chaque acteur ne voit que son périmètre, dans SON école. */
export function visibleStudents(actor: SessionUser): Student[] {
  const mine = studentsOf(actor.schoolId);
  switch (actor.role) {
    case "eleve":
      return mine.filter((s) => s.id === actor.studentId);
    case "parent":
      return mine.filter((s) => s.parentId === actor.parentId);
    case "instituteur":
    case "professeur": {
      const ids = visibleClassIds(actor);
      return mine.filter((s) => ids.includes(s.classId));
    }
    default:
      return mine;
  }
}

// Vérifie une condition et lève une erreur sinon (petit garde-fou réutilisé partout).
export function ensure(condition: boolean, message = "Accès refusé."): void {
  if (!condition) throw new Error(message);
}

/**
 * Bloque l'écriture quand l'école n'a pas d'abonnement actif : AUCUN (jamais
 * activé) ou EXPIRE en lecture seule. `school_is_writable` côté serveur reste
 * la source de vérité (RLS + Edge Functions) : ce contrôle n'est qu'un
 * garde-fou UX pour afficher un message clair avant la tentative d'écriture.
 */
export function ensureWritable(actor: SessionUser): void {
  const info = subscriptionInfoOf(actor.schoolId);
  if (info.status === "AUCUN") {
    throw new Error("Aucun abonnement actif : les modifications sont désactivées. Choisissez une formule dans la page Abonnement.");
  }
  if (info.status === "EXPIRE") {
    ensure(!info.readOnly, "Mode lecture seule : l'abonnement de votre école est expiré. Les modifications sont désactivées.");
  }
}

/** Vérifie qu'un compte appartient bien à l'école attendue (isolation côté service). */
export function ensureSameSchool(actor: SessionUser, schoolId: string, message = "Cette ressource appartient à une autre école."): void {
  ensure(actor.schoolId === schoolId, message);
}

/** Liste des demandes en attente pour l'école (badge du menu). */
export function pendingCount(schoolId: string): number {
  return db.registrationRequests.filter((r) => r.schoolId === schoolId && r.status === "EN_ATTENTE").length;
}