// Liste de premiers pas pour le directeur, cochee automatiquement.

import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { PanelHeading } from "@/features/admin/adminUi";
import { useAsync } from "@/hooks/useAsync";
import { assignmentsOf, classesOf, studentsOf, teachersOf, usersOf } from "@/services/db";
import { countPendingFor } from "@/services/registrationService";
import type { SessionUser } from "@/types";
import { cn } from "@/utils/cn";

interface Step {
  id: string;
  label: string;
  to: string;
  icon: string;
  done: boolean;
  hint: string;
}

/**
 * Checklist d'onboarding du directeur : chaque étape se coche automatiquement
 * dès que l'action correspondante est réalisée.
 */
export function OnboardingChecklist({ user }: { user: SessionUser }) {
  const state = useAsync(async () => {
    const [classes, teachers, assignments, students, staff, pending] = await Promise.all([
      Promise.resolve(classesOf(user.schoolId).length),
      Promise.resolve(teachersOf(user.schoolId).length),
      Promise.resolve(assignmentsOf(user.schoolId).length),
      Promise.resolve(studentsOf(user.schoolId).length),
      Promise.resolve(usersOf(user.schoolId).filter((u) => u.role !== "directeur").length),
      countPendingFor(user.schoolId),
    ]);
    return { classes, teachers, assignments, students, staff, pending };
  }, [user.schoolId]);

  if (!state.data) return null;
  const d = state.data;

  const steps: Step[] = [
    { id: "classes", label: "Créer les classes", to: "/app/classes", icon: "meeting_room", done: d.classes > 0, hint: `${d.classes} classe(s)` },
    { id: "students", label: "Inscrire ou importer les élèves", to: "/app/inscription-eleve", icon: "upload_file", done: d.students > 0 || d.pending > 0, hint: d.students + d.pending > 0 ? `${d.students} élève(s), ${d.pending} demande(s)` : "Un élève à la fois ou import CSV" },
    { id: "staff", label: "Créer les accès du personnel", to: "/app/enseignants", icon: "badge", done: d.staff > 0, hint: `${d.staff} accès` },
    { id: "matricule", label: "Partager le matricule aux élèves", to: "/app", icon: "key", done: d.students > 0 || d.pending > 0, hint: d.students + d.pending > 0 ? `${d.students} élève(s), ${d.pending} demande(s)` : "Copiez le matricule et partagez-le par WhatsApp" },
    { id: "affectations", label: "Affecter les enseignants", to: "/app/affectations", icon: "grid_view", done: d.assignments > 0 && d.teachers > 0, hint: `${d.assignments} affectation(s)` },
  ];
  const done = steps.filter((s) => s.done).length;

  return (
    <Card>
      <PanelHeading
        icon="rocket_launch"
        title="Premiers pas"
        subtitle="Quatre étapes pour ouvrir votre école aux familles. Elles se valident automatiquement."
        action={
          <span className="rounded-full bg-lime px-3 py-1 text-xs font-bold text-forest">
            {done}/{steps.length}
          </span>
        }
      />
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.id}>
            <Link to={s.to} className={cn("flex items-start gap-3 rounded-2xl border p-4 transition hover:border-forest", s.done ? "border-lime-soft bg-lime-pale" : "border-neutral-200 bg-white")}>
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-sm font-extrabold", s.done ? "bg-leaf text-white" : "bg-mist text-forest")}>
                {s.done ? <Icon name="check" className="text-[20px]" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{s.label}</span>
                <span className="block text-xs text-neutral-500">{s.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}