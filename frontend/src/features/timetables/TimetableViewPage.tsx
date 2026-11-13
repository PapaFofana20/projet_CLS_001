// Liste et detail des emplois du temps, avec publication.

import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button, LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonCards, SkeletonTable } from "@/components/ui/Skeleton";
import { useCurrentUser } from "@/context/AuthContext";
import { useFeature } from "@/utils/features";
import { useToast } from "@/context/ToastContext";
import { TimetableGrid } from "@/features/timetables/TimetableGrid";
import {
  createCourse,
  deleteCourse,
  deleteTimetable,
  ensurePlaceholderTeacher,
  getTimetable,
  listTimetableSubjects,
  listTimetableTeachers,
  listTimetables,
  publishTimetable,
  timetableClassLabel,
  timetableCourseCount,
  unpublishTimetable,
  updateCourse,
  type CourseInput,
  type Timetable,
  type TimetableCourse,
  type TimetableSubjectOption,
  type TimetableTeacherOption,
} from "@/services/timetableService";

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Brouillon", tone: "warning" },
  published: { label: "Publié", tone: "success" },
};

const DAY_ORDER = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

// Date courte en francais, ou un tiret si elle est absente.
const formatDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "—");

// Trie les cours par jour de semaine, puis par heure de debut.
const sortCourses = (courses: TimetableCourse[]) =>
  [...courses].sort((a, b) => {
    const dayDiff = DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
    return dayDiff !== 0 ? dayDiff : a.start_time.localeCompare(b.start_time);
  });

// Sans identifiant, liste les emplois du temps ; sinon affiche le detail.
export default function TimetableViewPage() {
  const user = useCurrentUser();
  const hasScheduling = useFeature("scheduling");
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [courses, setCourses] = useState<TimetableCourse[]>([]);
  const [subjects, setSubjects] = useState<TimetableSubjectOption[]>([]);
  const [teachers, setTeachers] = useState<TimetableTeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Timetable | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDirector = user.role === "directeur";

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setTimetable(null);
      setCourses([]);

      try {
        if (id) {
          const data = await getTimetable(id);
          if (cancelled) return;
          setTimetable(data.timetable);
          setCourses(sortCourses(data.courses));
        } else {
          const data = await listTimetables(user.schoolId);
          if (cancelled) return;
          setTimetables(data);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Impossible de charger les emplois du temps.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, user.schoolId]);

  useEffect(() => {
    if (!isDirector) return;
    let cancelled = false;

    (async () => {
      try {
        const [subjectRows, teacherRows] = await Promise.all([
          listTimetableSubjects(user.schoolId),
          listTimetableTeachers(user.schoolId),
        ]);
        if (cancelled) return;
        setSubjects(subjectRows);
        setTeachers(teacherRows);
      } catch (e) {
        if (!cancelled) toast(e instanceof Error ? e.message : "Impossible de charger les matières et enseignants.", "error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isDirector, user.schoolId, toast]);

  const refresh = useCallback(async () => {
    if (!id) return;
    const data = await getTimetable(id);
    setTimetable(data.timetable);
    setCourses(sortCourses(data.courses));
  }, [id]);

  /** Si aucun enseignant n'est choisi, on rattache le cours à l'enseignant « à définir ». */
  const resolveTeacher = async (input: CourseInput): Promise<CourseInput> => {
    if (input.teacherId) return input;
    const teacherId = await ensurePlaceholderTeacher(user.schoolId);
    setTeachers(await listTimetableTeachers(user.schoolId));
    return { ...input, teacherId };
  };

  const publish = async () => {
    if (!timetable) return;
    setPublishing(true);
    try {
      await publishTimetable(timetable.id, user.schoolId);
      setTimetable({ ...timetable, status: "published", published_at: new Date().toISOString() });
      toast("Emploi du temps publié : les classes concernées peuvent maintenant le consulter.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Publication impossible.", "error");
    } finally {
      setPublishing(false);
    }
  };

  const unpublish = async () => {
    if (!timetable) return;
    setPublishing(true);
    try {
      await unpublishTimetable(timetable.id, user.schoolId);
      setTimetable({ ...timetable, status: "draft", published_at: null });
      toast("Emploi du temps repassé en brouillon : il n'est plus visible par les classes.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Modification impossible.", "error");
    } finally {
      setPublishing(false);
    }
  };

  const handleCreateCourse = async (input: CourseInput) => {
    if (!id) return;
    const resolved = await resolveTeacher(input);
    await createCourse(id, user.schoolId, resolved);
    await refresh();
    toast("Cours ajouté à l'emploi du temps.");
  };

  const handleUpdateCourse = async (courseId: string, input: CourseInput) => {
    const resolved = await resolveTeacher(input);
    await updateCourse(courseId, user.schoolId, resolved);
    await refresh();
    toast("Cours modifié.");
  };

  const handleDeleteCourse = async (courseId: string) => {
    await deleteCourse(courseId, user.schoolId);
    await refresh();
    toast("Cours supprimé.");
  };

  const handleDeleteTimetable = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteTimetable(deleteTarget.id, user.schoolId);
      setTimetables((prev) => prev.filter((row) => row.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast("Emploi du temps supprimé.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Suppression impossible.", "error");
    } finally {
      setDeleting(false);
    }
  };

  /* ----------------------------- Liste ----------------------------- */
  if (!hasScheduling) {
    return (
      <>
        <PageHeader title="Emplois du temps" subtitle="Fonctionnalité disponible à partir du plan Pro." />
        <Card>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Icon name="workspace_premium" className="text-4xl text-neutral-300" />
            <p className="font-semibold text-ink">Emplois du temps réservés aux plans Pro et supérieurs.</p>
            <p className="max-w-sm text-sm text-neutral-500">Passez à un plan supérieur depuis l'onglet Abonnement pour débloquer les affectations et emplois du temps.</p>
          </div>
        </Card>
      </>
    );
  }
  if (!id) {
    const visibleTimetables = isDirector ? timetables : timetables.filter((row) => row.status === "published");

    return (
      <>
        <PageHeader
          title="Emplois du temps"
          subtitle="Plannings des classes de l'école"
          actions={
            isDirector ? (
              <LinkButton to="/app/timetables/nouveau" icon="add">
                Nouvel emploi du temps
              </LinkButton>
            ) : undefined
          }
        />

        {loading ? (
          <SkeletonCards count={3} className="lg:grid-cols-3" />
        ) : error ? (
          <Card>
            <p className="text-sm text-danger">{error}</p>
          </Card>
        ) : visibleTimetables.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Icon name="calendar_month" className="text-4xl text-neutral-300" />
              <p className="font-semibold text-ink">Aucun emploi du temps</p>
              <p className="max-w-sm text-sm text-neutral-500">
                {isDirector
                  ? "Créez le premier emploi du temps de votre école."
                  : "Aucun emploi du temps n'a encore été publié pour votre classe."}
              </p>
            </div>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleTimetables.map((row) => {
                const status = STATUS[row.status] ?? STATUS.draft;
                return (
                  <Card key={row.id} hover className="flex h-full flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link to={`/app/timetables/${row.id}`} className="text-lg font-bold text-ink hover:text-forest">
                          {row.name}
                        </Link>
                        <p className="mt-1 text-sm text-neutral-500">{timetableClassLabel(row)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge tone={status.tone}>{status.label}</Badge>
                        {isDirector && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(row)}
                            aria-label={`Supprimer l'emploi du temps ${row.name}`}
                            title="Supprimer cet emploi du temps"
                            className="grid size-9 place-items-center rounded-full text-danger transition hover:bg-red-50"
                          >
                            <Icon name="delete" className="text-[20px]" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-neutral-500">
                      {row.school_year} · {timetableCourseCount(row)} cours
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">Créé le {formatDate(row.created_at)}</p>
                    <Link
                      to={`/app/timetables/${row.id}`}
                      className="mt-3 inline-flex w-fit items-center gap-1 text-sm font-semibold text-forest"
                    >
                      Consulter <Icon name="arrow_forward" className="text-[18px]" />
                    </Link>
                  </Card>
                );
              })}
            </div>

            <ConfirmDialog
              open={!!deleteTarget}
              title="Supprimer cet emploi du temps ?"
              message={
                deleteTarget
                  ? `« ${deleteTarget.name} » (${timetableClassLabel(deleteTarget)}, ${timetableCourseCount(deleteTarget)} cours) sera définitivement supprimé, ainsi que tous ses cours. Cette action est irréversible.`
                  : ""
              }
              loading={deleting}
              onConfirm={() => void handleDeleteTimetable()}
              onCancel={() => setDeleteTarget(null)}
            />
          </>
        )}
      </>
    );
  }

  /* ---------------------------- Détail ----------------------------- */
  const status = timetable ? STATUS[timetable.status] ?? STATUS.draft : STATUS.draft;
  const hiddenFromViewer = timetable && !isDirector && timetable.status !== "published";

  return (
    <>
      <PageHeader
        title={timetable?.name ?? "Emploi du temps"}
        subtitle={timetable ? `${timetableClassLabel(timetable)} · ${timetable.school_year}` : undefined}
        actions={
          <>
            <LinkButton to="/app/timetables" variant="outline" icon="arrow_back">
              Retour
            </LinkButton>
            {timetable && isDirector && timetable.status !== "published" && (
              <Button icon="publish" loading={publishing} onClick={publish}>
                Publier
              </Button>
            )}
            {timetable && isDirector && timetable.status === "published" && (
              <Button variant="outline" icon="visibility_off" loading={publishing} onClick={unpublish}>
                Dépublier
              </Button>
            )}
          </>
        }
      />

      {loading ? (
        <SkeletonTable rows={5} />
      ) : error ? (
        <Card>
          <p className="text-sm text-danger">{error}</p>
        </Card>
      ) : !timetable || hiddenFromViewer ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Icon name="event_busy" className="text-4xl text-neutral-300" />
            <p className="font-semibold text-ink">Emploi du temps introuvable</p>
            <p className="text-sm text-neutral-500">Il a peut-être été supprimé, n'est pas encore publié ou vous n'y avez pas accès.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={status.tone}>{status.label}</Badge>
              <p className="text-sm text-neutral-600">{timetableClassLabel(timetable)}</p>
            </div>
            <dl className="mt-4 grid gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Année scolaire</dt>
                <dd className="mt-1 text-sm font-medium text-ink">{timetable.school_year}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Cours programmés</dt>
                <dd className="mt-1 text-sm font-medium text-ink">{courses.length}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Créé le</dt>
                <dd className="mt-1 text-sm font-medium text-ink">{formatDate(timetable.created_at)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Publié le</dt>
                <dd className="mt-1 text-sm font-medium text-ink">{formatDate(timetable.published_at)}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-ink">Maquette de l'emploi du temps</h2>
                <p className="text-sm text-neutral-500">Du lundi au samedi · 08:00 – 19:00</p>
              </div>
              {isDirector && timetable.status === "published" && (
                <Badge tone="success">Visible par les classes</Badge>
              )}
            </div>

            <TimetableGrid
              courses={courses}
              editable={isDirector}
              subjects={subjects}
              teachers={teachers}
              onCreate={handleCreateCourse}
              onUpdate={handleUpdateCourse}
              onDelete={handleDeleteCourse}
            />
          </Card>
        </div>
      )}
    </>
  );
}
