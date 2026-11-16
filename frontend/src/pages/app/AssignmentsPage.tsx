// Affectations des enseignants aux classes et aux matières.
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AsyncView } from "@/components/ui/AsyncView";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/Brand";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/context/ToastContext";
import { CYCLES, CYCLE_LABELS } from "@/data/school";
import { AssignmentMatrix } from "@/features/assignments/AssignmentMatrix";
import { HeroBar, HeroCard, HeroLegend, KpiTile, PanelHeading } from "@/features/admin/adminUi";
import { useAsync } from "@/hooks/useAsync";
import { getAssignmentBoard, setCellTeacher, setHeadTeacher, setTitular, type AssignmentBoard } from "@/services/assignmentService";
import { useCurrentUser } from "@/context/AuthContext";
import type { Cycle } from "@/types";
import { MAX_ASSIGNMENTS_PER_TEACHER } from "@/utils/permissions";

// Composant principal de la page.
export default function AssignmentsPage() {
  const user = useCurrentUser();
  const state = useAsync(() => getAssignmentBoard(user.schoolId), [user.schoolId]);
  const { toast } = useToast();
  const [cycle, setCycle] = useState<Cycle>("moyen");
  // Verrou anti double-clic : une écriture en cours bloque les suivantes
  // (avant : aucun état busy, deux clics rapides = écritures concurrentes).
  const runningRef = useRef(false);

  const run = async (op: () => Promise<AssignmentBoard>, success: string) => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      state.setData(await op());
      toast(success);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Modification impossible.", "error");
    } finally {
      runningRef.current = false;
    }
  };

  return (
    <>
      <PageHeader title="Affectations" subtitle="Qui enseigne quoi, dans quelle classe. Les enseignants ne voient que leurs affectations." />
      <AsyncView state={state} skeleton={<Skeleton className="h-96 w-full" />}>
        {(board) => {
          const errors = board.conflicts.filter((c) => c.severity === "error");
          const warnings = board.conflicts.filter((c) => c.severity === "warning");
          const profs = board.teachers.filter((t) => t.kind === "professeur");
          const totalCells = board.classSubjects.length;
          const filled = board.assignments.length;
          const coverage = totalCells > 0 ? Math.round((filled / totalCells) * 100) : 0;
          const overloaded = profs.filter((t) => board.assignments.filter((a) => a.teacherId === t.id).length > MAX_ASSIGNMENTS_PER_TEACHER).length;
          return (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <HeroCard
                  eyebrow="Couverture pédagogique"
                  icon="how_to_reg"
                  value={`${coverage} %`}
                  label={`${filled} affectation${filled > 1 ? "s" : ""} sur ${totalCells} case${totalCells > 1 ? "s" : ""} (classe · matière)`}
                  footnote={`${board.teachers.length} enseignant${board.teachers.length > 1 ? "s" : ""} · ${board.classes.length} classe${board.classes.length > 1 ? "s" : ""} · ${errors.length} erreur(s), ${warnings.length} alerte(s)`}
                >
                  <HeroBar
                    segments={[
                      { pct: coverage, className: "bg-lime" },
                      { pct: Math.max(0, 100 - coverage), className: "bg-white/20" },
                    ]}
                  />
                  <HeroLegend
                    items={[
                      { dot: "bg-lime", label: `Affecté · ${filled}` },
                      { dot: "bg-white/40", label: `À compléter · ${Math.max(0, totalCells - filled)}` },
                    ]}
                    trailing={
                      <>
                        <Icon name={errors.length ? "error" : "verified"} className="text-[14px]" />
                        {errors.length ? `${errors.length} conflit(s)` : "Aucun conflit"}
                      </>
                    }
                  />
                </HeroCard>

                <div className="grid gap-3 sm:grid-cols-2">
                  <KpiTile tone="lime" icon="how_to_reg" label="Affectations" value={filled} note={`${totalCells} cases possibles`} />
                  <KpiTile tone="sky" icon="badge" label="Enseignants" value={board.teachers.length} note={`${profs.length} professeur(s)`} />
                  <KpiTile tone={errors.length ? "red" : "neutral"} icon="error" label="Erreurs" value={errors.length} note="Conflits bloquants" />
                  <KpiTile tone={overloaded > 0 ? "amber" : "violet"} icon="schedule" label="Surchargés" value={overloaded} note={`Max ${MAX_ASSIGNMENTS_PER_TEACHER} affectations`} />
                </div>
              </div>

              <Card className={board.conflicts.length ? "" : "!bg-lime-soft"}>
                <PanelHeading
                  icon={board.conflicts.length ? "warning" : "verified"}
                  title="Contrôle des conflits"
                  subtitle="Matière sans professeur, professeur surchargé, doublon sur une même classe et matière"
                  action={<div className="flex gap-2"><Badge tone={errors.length ? "danger" : "success"}>{errors.length} erreur(s)</Badge><Badge tone={warnings.length ? "warning" : "success"}>{warnings.length} alerte(s)</Badge></div>}
                />
                {board.conflicts.length === 0 ? (
                  <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-forest"><Icon name="check_circle" fill /> Aucune anomalie : toutes les matières ont un enseignant.</p>
                ) : (
                  <ul className="mt-4 grid gap-2 md:grid-cols-2" aria-live="polite">
                    {board.conflicts.map((c) => (
                      <li key={c.id} className={`flex items-start gap-2 rounded-xl p-3 text-sm ${c.severity === "error" ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"}`}>
                        <Icon name={c.severity === "error" ? "error" : "warning"} fill className="text-[20px]" />
                        {c.message}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              {board.classSubjects.length === 0 && (
                <Card className="!bg-amber-50">
                  <p className="text-sm text-amber-900">
                    <strong>Aucune matière n'est rattachée à une classe.</strong> Configurez d'abord les matières par classe dans{" "}
                    {/* <Link> et non <a href> : un <a> interne rechargeait toute
                        l'application (re-boot + hydrateAll) au lieu de naviguer instantanément. */}
                    <Link to="/app/parametres" className="font-semibold underline">Paramètres → Coefficients</Link>, puis revenez ici pour affecter les enseignants.
                  </p>
                </Card>
              )}
              <Tabs label="Cycle" value={cycle} onChange={(v) => setCycle(v as Cycle)} items={CYCLES.map((c) => ({ id: c, label: CYCLE_LABELS[c], badge: board.classes.filter((x) => x.cycle === c).length }))} />
              <AssignmentMatrix
                board={board}
                cycle={cycle}
                onReplace={(c, s, _oldId, newId) => void run(() => setCellTeacher(user, c, s, newId), "Affectation mise à jour : un seul enseignant par matière.")}
                onSetHead={(c, t) => void run(() => setHeadTeacher(user, c, t), "Professeur principal mis à jour.")}
                onSetTitular={(c, t) => {
                  const cls = board.classes.find((x) => x.id === c);
                  const n = board.classSubjects.filter((x) => x.classId === c).length;
                  void run(() => setTitular(user, c, t), t ? `Titulaire nommé : il reçoit automatiquement les ${n} matières de ${cls?.name ?? "la classe"}.` : "Titulaire retiré.");
                }}
              />
              {cycle !== "elementaire" && (
                <Card>
                  <PanelHeading icon="school" title="Charge des professeurs" subtitle={`Maximum conseillé : ${MAX_ASSIGNMENTS_PER_TEACHER} affectations (classe · matière)`} />
                  <ul className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-2">
                    {profs.map((t) => {
                      const n = board.assignments.filter((a) => a.teacherId === t.id).length;
                      return (
                        <li key={t.id} className="flex items-center gap-3 text-sm">
                          <span className="w-40 truncate font-semibold">{t.firstName} {t.lastName}</span>
                          <ProgressBar className="flex-1" value={(n / MAX_ASSIGNMENTS_PER_TEACHER) * 100} tone={n > MAX_ASSIGNMENTS_PER_TEACHER ? "danger" : n > 7 ? "warning" : "leaf"} />
                          <span className={`w-10 text-right font-bold ${n > MAX_ASSIGNMENTS_PER_TEACHER ? "text-danger" : ""}`}>{n}</span>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              )}
            </div>
          );
        }}
      </AsyncView>
    </>
  );
}
