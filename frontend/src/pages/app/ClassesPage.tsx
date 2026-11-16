// Liste et création des classes de l'école, par cycle.
import { useState } from "react";
import { Link } from "react-router-dom";
import { AsyncView } from "@/components/ui/AsyncView";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/Brand";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { useCurrentUser } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { CYCLE_EXAMS, CYCLE_LABELS, CYCLES, SERIES_OPTIONS } from "@/data/school";
import { useAsync } from "@/hooks/useAsync";
import { createClass, deleteClass, getSchoolOverview } from "@/services/schoolService";
import { listStudentRows } from "@/services/studentService";
import { listTeacherRows } from "@/services/teacherService";
import type { ClassRoom } from "@/types";

// Composant principal de la page.
export default function ClassesPage() {
  const user = useCurrentUser();
  const { toast } = useToast();
  // On charge en parallèle les classes, les élèves et les enseignants.
  const state = useAsync(async () => {
    const [overview, students, teachers] = await Promise.all([getSchoolOverview(user.schoolId), listStudentRows(user), listTeacherRows(user.schoolId)]);
    return { overview, students, teachers };
  }, [user.schoolId]);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ClassRoom | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ levelId: "", section: "A", series: "", capacity: "35" });

  const levelCycle = state.data?.overview.levels.find((l) => l.id === form.levelId)?.cycle;
  const capacity = Number(form.capacity);
  const formValid = !!form.levelId && capacity >= 5 && capacity <= 60 && (levelCycle !== "secondaire" || !!form.series) && (levelCycle === "secondaire" || /^[A-Za-z]$/.test(form.section));

  const create = async () => {
    setBusy(true);
    try {
      const c = await createClass(user.schoolId, { levelId: form.levelId, section: form.section, series: levelCycle === "secondaire" ? form.series : undefined, capacity });
      toast(`Classe « ${c.name} » créée.`);
      setOpen(false);
      state.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Création impossible.", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await deleteClass(user.schoolId, toDelete.id);
      toast(`Classe « ${toDelete.name} » supprimée.`);
      setToDelete(null);
      state.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Suppression impossible.", "error");
      setToDelete(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Classes" subtitle="Élémentaire, moyen et secondaire" actions={<Button onClick={() => setOpen(true)}>Nouvelle classe</Button>} />
      <AsyncView state={state} skeleton={<SkeletonCards count={6} className="lg:grid-cols-3" />}>
        {({ overview, students, teachers }) => (
          <div className="space-y-8">
            {CYCLES.map((cycle) => {
              const list = overview.classes.filter((c) => c.cycle === cycle);
              const enabled = overview.settings.cycles.includes(cycle);
              return (
                <section key={cycle} aria-labelledby={`cy-${cycle}`}>
                  <div className="mb-3 flex items-center gap-3">
                    <h2 id={`cy-${cycle}`} className="text-xl font-extrabold">{CYCLE_LABELS[cycle]}</h2>
                    <Badge tone="dark">Examen : {CYCLE_EXAMS[cycle]}</Badge>
                    {!enabled && <Badge tone="warning">Cycle non proposé</Badge>}
                  </div>
                  {list.length === 0 ? (
                    <p className="rounded-2xl bg-white p-6 text-sm text-neutral-500 shadow-card">Aucune classe dans ce cycle.</p>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {list.map((c, index) => {
                        const count = students.filter((s) => s.classId === c.id).length;
                        const head = teachers.find((t) => t.id === c.headTeacherId);
                        return (
                          <Card key={c.id} hover className="stagger-item" style={{ animationDelay: `${index * 50}ms` }}>
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="text-2xl font-extrabold text-forest">{c.name}</p>
                                <p className="text-xs text-neutral-500">{overview.levels.find((l) => l.id === c.levelId)?.label}{c.series ? ` · série ${c.series}` : ""}</p>
                              </div>
                              <button type="button" aria-label={`Supprimer la classe ${c.name}`} onClick={() => setToDelete(c)} className="grid size-11 place-items-center rounded-full text-neutral-400 hover:bg-red-50 hover:text-danger">
                                <Icon name="delete" />
                              </button>
                            </div>
                            <p className="mt-4 flex items-center gap-2 text-sm">
                              <Icon name={cycle === "elementaire" ? "child_care" : "workspace_premium"} className="text-[18px] text-forest" />
                              <span className="text-neutral-500">{cycle === "elementaire" ? "Instituteur titulaire :" : "Professeur principal :"}</span>
                              <strong>{head ? `${head.firstName} ${head.lastName}` : "Non désigné"}</strong>
                            </p>
                            <div className="mt-4">
                              <div className="mb-1.5 flex justify-between text-xs font-semibold"><span>Effectif</span><span>{count} / {c.capacity}</span></div>
                              <ProgressBar value={(count / c.capacity) * 100} tone={count >= c.capacity ? "danger" : "leaf"} />
                            </div>
                            <Link to={`/app/eleves?classe=${c.id}`} className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-forest hover:underline">
                              Voir les élèves <Icon name="arrow_forward" className="text-[18px]" />
                            </Link>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </AsyncView>

      <Modal open={open} onClose={() => setOpen(false)} title="Nouvelle classe" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button><Button variant="dark" disabled={!formValid} loading={busy} onClick={() => void create()}>Créer la classe</Button></>}>
        <div className="grid gap-4">
          <Select label="Niveau" required placeholder="Choisir un niveau" value={form.levelId} onChange={(e) => setForm({ ...form, levelId: e.target.value })} options={(state.data?.overview.levels ?? [])
            .filter((l) => (state.data?.overview.settings.cycles ?? CYCLES).includes(l.cycle))
            .map((l) => ({ value: l.id, label: `${l.label} (${CYCLE_LABELS[l.cycle]})` }))} />
          {levelCycle === "secondaire" ? (
            <Select label="Série" required placeholder="Choisir une série" value={form.series} onChange={(e) => setForm({ ...form, series: e.target.value })} options={SERIES_OPTIONS.map((s) => ({ value: s, label: s }))} />
          ) : (
            <Input label="Section (lettre)" maxLength={1} value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} error={form.section && !/^[A-Za-z]$/.test(form.section) ? "Une seule lettre (A, B, C…)." : null} />
          )}
          <Input label="Capacité" type="number" min={5} max={60} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} error={capacity < 5 || capacity > 60 ? "Entre 5 et 60 élèves." : null} />
        </div>
      </Modal>
      <ConfirmDialog open={!!toDelete} title="Supprimer cette classe ?" message={`La classe ${toDelete?.name ?? ""} et ses affectations seront supprimées. Cette action est irréversible. Une classe contenant des élèves ne peut pas être supprimée.`} loading={busy} onConfirm={() => void remove()} onCancel={() => setToDelete(null)} />
    </>
  );
}
