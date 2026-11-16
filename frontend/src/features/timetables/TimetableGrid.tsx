// Grille hebdomadaire des cours, en lecture ou en edition.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Input, Textarea } from "@/components/ui/Input";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { cn } from "@/utils/cn";
import { courseSubject, courseTeacher, type CourseInput, type TimetableCourse, type TimetableSubjectOption, type TimetableTeacherOption } from "@/services/timetableService";

/** Jours utilisés par la base (contrainte : minuscules, lundi → samedi). */
export const TIMETABLE_DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;

const DAY_LABELS: Record<string, string> = {
  lundi: "Lundi",
  mardi: "Mardi",
  mercredi: "Mercredi",
  jeudi: "Jeudi",
  vendredi: "Vendredi",
  samedi: "Samedi",
};

/** Amplitude de la maquette : 08:00 → 19:00, découpée en tranches de 30 minutes. */
const START_MINUTES = 8 * 60;
const END_MINUTES = 19 * 60;
const SLOT_MINUTES = 30;
const SLOT_COUNT = (END_MINUTES - START_MINUTES) / SLOT_MINUTES;

const PALETTE = [
  "bg-lime-soft text-forest",
  "bg-sky-50 text-sky-900",
  "bg-amber-50 text-amber-900",
  "bg-rose-50 text-rose-900",
  "bg-violet-50 text-violet-900",
  "bg-emerald-50 text-emerald-900",
];

// Petits convertisseurs entre "HH:MM" et minutes depuis minuit.
const toMinutes = (value: string): number => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const toTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const formatTime = (value: string): string => value.slice(0, 5);

const paletteFor = (subjectId: string): string => {
  let hash = 0;
  for (let i = 0; i < subjectId.length; i += 1) hash = (hash * 31 + subjectId.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
};

const TIME_OPTIONS = Array.from({ length: (END_MINUTES - START_MINUTES) / SLOT_MINUTES + 1 }, (_, index) => {
  const value = toTime(START_MINUTES + index * SLOT_MINUTES);
  return { value, label: value };
});

type PlacedCourse = { course: TimetableCourse; span: number };
type GridCell = PlacedCourse | "occupied" | null;

/** Place chaque cours sur la grille : un cours occupe toujours une seule case prédéfinie. */
function buildGrid(courses: TimetableCourse[]): GridCell[][] {
  return TIMETABLE_DAYS.map((day) => {
    const cells: GridCell[] = Array.from({ length: SLOT_COUNT }, () => null);
    const dayCourses = courses.filter((course) => course.day === day).sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));

    for (const course of dayCourses) {
      const start = Math.max(START_MINUTES, toMinutes(course.start_time));
      const end = Math.min(END_MINUTES, toMinutes(course.end_time));
      if (end <= start) continue;

      const startRow = Math.max(0, Math.min(SLOT_COUNT - 1, Math.floor((start - START_MINUTES) / SLOT_MINUTES)));
      if (cells[startRow] !== null) continue;

      // Un cours = une seule case, quelle que soit sa durée (début–fin indiqués à l'intérieur).
      cells[startRow] = { course, span: 1 };
    }

    return cells;
  });
}

interface TimetableGridProps {
  courses: TimetableCourse[];
  editable: boolean;
  subjects: TimetableSubjectOption[];
  teachers: TimetableTeacherOption[];
  onCreate: (input: CourseInput) => Promise<void>;
  onUpdate: (courseId: string, input: CourseInput) => Promise<void>;
  onDelete: (courseId: string) => Promise<void>;
}

// Formulaire vierge pour un nouveau cours, avec une heure de fin par defaut.
const emptyForm = (day: string, startTime: string): CourseInput => {
  const start = toMinutes(startTime);
  return {
    subjectId: "",
    teacherId: "",
    day,
    startTime,
    endTime: toTime(Math.min(start + 60, END_MINUTES)),
    room: "",
    description: "",
  };
};

// Grille de la semaine : cliquer une case ou un cours ouvre l'editeur.
export function TimetableGrid({ courses, editable, subjects, teachers, onCreate, onUpdate, onDelete }: TimetableGridProps) {
  const [form, setForm] = useState<CourseInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TimetableCourse | null>(null);
  const [deleting, setDeleting] = useState(false);

  const grid = useMemo(() => buildGrid(courses), [courses]);
  const canEdit = editable && subjects.length > 0;
  const hasTeachers = teachers.length > 0;

  const teacherOptions = teachers.map((teacher) => ({
    value: teacher.id,
    label: `${teacher.first_name} ${teacher.last_name}`.trim(),
  }));
  if (form?.teacherId && !teachers.some((teacher) => teacher.id === form.teacherId)) {
    teacherOptions.unshift({ value: form.teacherId, label: "Enseignant actuel" });
  }

  const openCreate = (day: string, startTime: string) => {
    if (!canEdit) return;
    setEditingId(null);
    setFormError(null);
    setForm(emptyForm(day, startTime));
  };

  const openEdit = (course: TimetableCourse) => {
    if (!editable) return;
    setEditingId(course.id);
    setFormError(null);
    setForm({
      subjectId: course.subject_id,
      teacherId: course.teacher_id,
      day: course.day,
      startTime: formatTime(course.start_time),
      endTime: formatTime(course.end_time),
      room: course.room ?? "",
      description: course.description ?? "",
    });
  };

  const closeEditor = () => {
    setForm(null);
    setEditingId(null);
    setFormError(null);
  };

  const save = async () => {
    if (!form) return;

    if (!form.subjectId) {
      setFormError("Choisissez une matière.");
      return;
    }
    // L'enseignant est optionnel : le cours peut être enregistré sans lui.
    if (toMinutes(form.endTime) <= toMinutes(form.startTime)) {
      setFormError("L'heure de fin doit être postérieure à l'heure de début.");
      return;
    }

    // Un cours occupe une seule case : seul un autre cours commençant dans la même case est un conflit.
    const overlap = courses.find(
      (course) =>
        course.id !== editingId &&
        course.day === form.day &&
        formatTime(course.start_time) === form.startTime,
    );
    if (overlap) {
      setFormError(
        `Cette case est déjà occupée par « ${courseSubject(overlap)} » (${formatTime(overlap.start_time)} – ${formatTime(overlap.end_time)}).`,
      );
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editingId) await onUpdate(editingId, form);
      else await onCreate(form);
      closeEditor();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
      closeEditor();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Suppression impossible.");
    } finally {
      setDeleting(false);
    }
  };

  const missingResources = editable && !subjects.length;

  return (
    <div>
      {missingResources && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Icon name="info" className="text-[20px]" />
          <p>Aucune matière n'est disponible pour cette école : ajoutez des matières avant de programmer des cours.</p>
        </div>
      )}

      {editable && subjects.length > 0 && !hasTeachers && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <Icon name="info" className="text-[20px]" />
          <p>
            Aucun enseignant enregistré : les cours seront liés à « Enseignant à définir ». Vous pourrez les affecter plus tard
            dans <Link to="/app/enseignants" className="font-semibold underline">Personnel</Link>.
          </p>
        </div>
      )}

      {editable && subjects.length > 0 && (
        <p className="mb-3 flex items-center gap-2 text-sm text-neutral-500">
          <Icon name="touch_app" className="text-[18px] text-forest/60" />
          Cliquez sur une case pour ajouter un cours, ou sur un cours pour le modifier.
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-neutral-200">
        <table className="w-full min-w-[860px] table-fixed border-collapse">
          <thead>
            <tr>
              {TIMETABLE_DAYS.map((day) => (
                <th
                  key={day}
                  className="border-b border-l border-neutral-200 bg-mist px-2 py-3 text-center text-xs font-bold uppercase tracking-wide text-forest"
                >
                  {DAY_LABELS[day]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: SLOT_COUNT }, (_, row) => {
              const slotStart = START_MINUTES + row * SLOT_MINUTES;
              const isHour = slotStart % 60 === 0;
              return (
                <tr key={slotStart} className="h-14">
                  {TIMETABLE_DAYS.map((day, dayIndex) => {
                    const cell = grid[dayIndex][row];
                    if (cell === "occupied") return null;

                    if (cell) {
                      const { course, span } = cell;
                      return (
                        <td key={day} rowSpan={span} className={cn("h-14 border-l border-neutral-200 p-0 align-top", isHour && "border-t")}>
                          <button
                            type="button"
                            disabled={!editable}
                            onClick={() => openEdit(course)}
                            title={`${courseSubject(course)} · ${formatTime(course.start_time)} – ${formatTime(course.end_time)}`}
                            className={cn(
                              "timetable-cell flex h-full w-full flex-col gap-0.5 overflow-hidden px-2 py-1.5 text-left transition",
                              paletteFor(course.subject_id),
                              editable ? "hover:brightness-[0.98] focus-visible:bg-lime-pale focus-visible:outline-none" : "cursor-default",
                            )}
                          >
                            <span className="line-clamp-2 text-xs font-bold leading-tight">{courseSubject(course)}</span>
                            <span className="text-[10px] font-semibold leading-tight">
                              {formatTime(course.start_time)} – {formatTime(course.end_time)}
                            </span>
                            <span className="line-clamp-1 text-[10px] leading-tight opacity-90">{courseTeacher(course)}</span>
                            {course.room && <span className="line-clamp-1 text-[10px] leading-tight opacity-70">{course.room}</span>}
                          </button>
                        </td>
                      );
                    }

                    return (
                      <td key={day} className={cn("h-14 border-l border-neutral-200 p-0 align-top", isHour && "border-t")}>
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => openCreate(day, toTime(slotStart))}
                            aria-label={`Ajouter un cours ${DAY_LABELS[day]} à ${toTime(slotStart)}`}
                            className="timetable-cell flex h-full w-full items-center justify-center text-transparent focus-visible:bg-lime-pale focus-visible:text-forest/60 focus-visible:outline-none"
                          >
                            <Icon name="add" className="text-[18px]" />
                          </button>
                        ) : (
                          <div className="h-full" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!form}
        onClose={closeEditor}
        title={editingId ? "Modifier le cours" : "Ajouter un cours"}
        size="md"
        footer={
          <>
            {editingId && (
              <Button
                variant="danger"
                icon="delete"
                className="mr-auto"
                onClick={() => {
                  const course = courses.find((item) => item.id === editingId);
                  if (course) setDeleteTarget(course);
                }}
              >
                Supprimer
              </Button>
            )}
            <Button variant="outline" onClick={closeEditor} disabled={saving}>
              Annuler
            </Button>
            <Button icon="save" loading={saving} onClick={save}>
              Enregistrer
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Jour"
                required
                options={TIMETABLE_DAYS.map((day) => ({ value: day, label: DAY_LABELS[day] }))}
                value={form.day}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, day: event.target.value } : prev))}
              />
              <Input
                label="Salle"
                placeholder="Ex. Salle 12"
                value={form.room ?? ""}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, room: event.target.value } : prev))}
              />
              <Select
                label="Début"
                required
                options={TIME_OPTIONS}
                value={form.startTime}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, startTime: event.target.value } : prev))}
              />
              <Select
                label="Fin"
                required
                options={TIME_OPTIONS}
                value={form.endTime}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, endTime: event.target.value } : prev))}
              />
            </div>

            <Select
              label="Matière"
              required
              searchable
              placeholder="Sélectionner une matière"
              options={subjects.map((subject) => ({ value: subject.id, label: subject.name }))}
              value={form.subjectId}
              onChange={(event) => setForm((prev) => (prev ? { ...prev, subjectId: event.target.value } : prev))}
            />

            {hasTeachers ? (
              <Select
                label="Enseignant (optionnel)"
                searchable
                placeholder="Sélectionner un enseignant (optionnel)"
                options={teacherOptions}
                value={form.teacherId}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, teacherId: event.target.value } : prev))}
              />
            ) : (
              <div className="rounded-2xl border border-neutral-200 bg-mist px-4 py-3 text-sm text-neutral-600">
                <span className="font-semibold text-ink">Enseignant : </span>
                à définir. Ajoutez des enseignants dans{" "}
                <Link to="/app/enseignants" className="font-semibold text-forest underline">
                  Personnel
                </Link>{" "}
                pour les affecter, ou enregistrez le cours tel quel.
              </div>
            )}

            <Textarea
              label="Précisions (facultatif)"
              rows={2}
              placeholder="Ex. Groupe B, salle informatique…"
              value={form.description ?? ""}
              onChange={(event) => setForm((prev) => (prev ? { ...prev, description: event.target.value } : prev))}
            />

            {formError && (
              <p role="alert" className="flex items-start gap-1 text-sm font-medium text-danger">
                <Icon name="error" className="text-[18px]" />
                {formError}
              </p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Supprimer ce cours"
        message={
          deleteTarget
            ? `« ${courseSubject(deleteTarget)} » (${DAY_LABELS[deleteTarget.day] ?? deleteTarget.day}, ${formatTime(
                deleteTarget.start_time,
              )} – ${formatTime(deleteTarget.end_time)}) sera retiré de l'emploi du temps.`
            : ""
        }
        loading={deleting}
        onConfirm={remove}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
