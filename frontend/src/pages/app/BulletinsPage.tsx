// Bulletins des élèves, imprimables, selon le cycle de la classe.
import { useEffect, useState } from "react";
import { AsyncView } from "@/components/ui/AsyncView";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { PeriodSelect } from "@/components/ui/PeriodSelect";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Icon } from "@/components/ui/Icon";
import { useCurrentUser } from "@/context/AuthContext";
import { useChild } from "@/context/ChildContext";
import { useSchool } from "@/context/SchoolContext";
import { useToast } from "@/context/ToastContext";
import { CONDUCT_OPTIONS, levels } from "@/data/school";
import { HeroBar, HeroCard, HeroLegend, KpiTile, PanelHeading } from "@/features/admin/adminUi";
import { ElementaryReport, SecondaryReport } from "@/features/reportCards/ReportCards";
import { useAsync } from "@/hooks/useAsync";
import { usePeriods } from "@/hooks/usePeriods";
import { bulletinClasses, getClassReportCards, updateReportMeta } from "@/services/reportService";
import { getSchoolOverview } from "@/services/schoolService";
import { listStudentRows, type StudentRow } from "@/services/studentService";
import type { ReportCardData } from "@/types";
import { formatNumber } from "@/utils/format";
import { averageTone } from "@/utils/grades";

function MetaEditor({ card, onSaved }: { card: ReportCardData; onSaved: () => void }) {
  const user = useCurrentUser();
  const { toast } = useToast();
  const [conduct, setConduct] = useState(card.meta?.conduct ?? "");
  const [absences, setAbsences] = useState(card.meta ? String(card.meta.absences) : "");
  const [comment, setComment] = useState(card.meta?.comment ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setConduct(card.meta?.conduct ?? "");
    setAbsences(card.meta ? String(card.meta.absences) : "");
    setComment(card.meta?.comment ?? "");
  }, [card.student.id, card.meta, card.meta?.conduct, card.meta?.absences, card.meta?.comment]);
  const abs = Number(absences);
  const absErr = !Number.isInteger(abs) || abs < 0 || abs > 200 ? "Nombre entier entre 0 et 200." : null;
  const elem = card.classRoom.cycle === "elementaire";

  const save = async () => {
    setBusy(true);
    try {
      await updateReportMeta(user, card.student.id, card.period.id, { conduct, absences: abs, comment: comment.trim() });
      toast("Appréciation enregistrée.");
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Enregistrement impossible.", "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="no-print">
      <PanelHeading
        icon={elem ? "child_care" : "forum"}
        title={elem ? "Appréciation de l'instituteur" : "Conseil de classe"}
        subtitle="Conduite, absences et appréciation du bulletin"
      />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Select label="Conduite" value={conduct} onChange={(e) => setConduct(e.target.value)} options={CONDUCT_OPTIONS.map((c) => ({ value: c, label: c }))} />
        <Input label="Absences (heures)" type="number" min={0} value={absences} onChange={(e) => setAbsences(e.target.value)} error={absErr} />
        <Textarea className="sm:col-span-2" label={elem ? "Appréciation (laisser vide pour la suggestion automatique)" : "Appréciation du conseil de classe (vide = suggestion automatique)"} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} />
      </div>
      <Button className="mt-4" variant="dark" icon="save" loading={busy} disabled={!!absErr} onClick={() => void save()}>Enregistrer</Button>
    </Card>
  );
}

// Composant principal de la page.
export default function BulletinsPage() {
  const user = useCurrentUser();
  const { periods, period, setPeriod } = usePeriods();
  const { activeChild } = useChild();
  const { settings } = useSchool();
  const isParent = user.role === "parent";
  const isStudent = user.role === "eleve";
  const isRestricted = (isParent || isStudent) && (settings?.blockStudentBulletins ?? false);
  // Sources indépendantes : requêtes en parallèle (et non en séquence).
  // On charge les classes autorisées pour les bulletins, en parallèle.
  const classes = useAsync(async () => {
    const [list, overview, own] = await Promise.all([
      bulletinClasses(user),
      getSchoolOverview(user.schoolId),
      isStudent ? listStudentRows(user) : Promise.resolve([] as StudentRow[]),
    ]);
    // `bulletinClasses` autorise toutes les classes de l'école à un élève :
    // on le restreint à sa propre classe (via son dossier), sinon il ne
    // verrait aucun bulletin (la liste commencerait par une autre classe).
    const restricted = isStudent && own[0]?.classId ? list.filter((c) => c.id === own[0].classId) : list;
    return { list: restricted, overview };
  }, [user.id, isStudent]);
  const [classId, setClassId] = useState("");
  const [idx, setIdx] = useState(0);

  const list = classes.data?.list ?? [];
  const effectiveClass = isParent ? activeChild?.classId ?? "" : list.some((c) => c.id === classId) ? classId : list[0]?.id ?? "";
  const cards = useAsync(() => (effectiveClass ? getClassReportCards(user, effectiveClass, period) : Promise.resolve([] as ReportCardData[])), [effectiveClass, period, user.id]);
  useEffect(() => setIdx(0), [effectiveClass]);

  const data = cards.data ?? [];
  const current = isParent || isStudent ? data.find((c) => c.student.id === (isStudent ? user.studentId : activeChild?.id)) : data[Math.min(idx, data.length - 1)];

  // Statistiques de la classe pour le bandeau de synthèse (personnel uniquement).
  const classAvgs = data.map((c) => c.generalAverage).filter((v): v is number => v !== null);
  const classAverage = classAvgs.length ? classAvgs.reduce((a, b) => a + b, 0) / classAvgs.length : null;
  const belowTen = classAvgs.filter((a) => a < 10).length;
  const bestAvg = classAvgs.length ? Math.max(...classAvgs) : null;
  const showBand = !isParent && !isStudent && data.length > 0;

  return (
    <>
      <PageHeader
        title="Bulletins"
        subtitle={isRestricted ? "L'accès aux bulletins est temporairement désactivé par la direction." : isStudent ? "Votre bulletin du semestre, imprimable en PDF." : isParent ? "Bulletin de votre élève, imprimable en PDF." : "Aperçu imprimable des bulletins. Le modèle dépend du cycle de la classe."}
        actions={current && !isRestricted ? <><PeriodSelect periods={periods} value={period} onChange={setPeriod} /><Button icon="print" variant="dark" onClick={() => window.print()}>Imprimer / PDF</Button></> : <>{!isRestricted && periods.length > 0 && <PeriodSelect periods={periods} value={period} onChange={setPeriod} />}</>}
      />
      {isRestricted ? (
        <Card className="p-8 text-center">
          <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-neutral-100">
            <Icon name="lock" className="text-3xl text-neutral-500" />
          </div>
          <h2 className="text-lg font-bold">Bulletins indisponibles</h2>
          <p className="mt-1 text-sm text-neutral-500">La direction a temporairement masqué les bulletins pour les élèves et les parents. Veuillez réessayer ultérieurement.</p>
        </Card>
      ) : (
        <AsyncView state={classes} skeleton={<Skeleton className="h-96 w-full" />}>
          {({ list: allowed, overview }) =>
            allowed.length === 0 ? (
              <EmptyState icon="description" title="Aucun bulletin disponible" text={user.role === "professeur" ? "Les bulletins sont réservés au professeur principal de la classe." : "Aucune classe n'est disponible pour votre compte."} />
            ) : (
              <div className="space-y-4">
                {!isParent && !isStudent && (
                  <Card className="no-print">
                    <PanelHeading
                      icon="description"
                      title="Aperçu des bulletins"
                      subtitle={`${allowed.length} classe${allowed.length > 1 ? "s" : ""} autorisée${allowed.length > 1 ? "s" : ""} · modèle selon le cycle`}
                    />
                    <div className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end">
                      {allowed.length > 1 ? <Select label="Classe" value={effectiveClass} onChange={(e) => setClassId(e.target.value)} options={allowed.map((c) => ({ value: c.id, label: c.name }))} /> : <div><p className="mb-1.5 text-sm font-semibold">Classe</p><p className="min-h-12 rounded-2xl bg-mist px-4 py-3 text-sm font-bold">{allowed[0].name}</p></div>}
                      <Select label="Élève" value={String(Math.min(idx, Math.max(0, data.length - 1)))} onChange={(e) => setIdx(Number(e.target.value))} options={data.map((c, i) => ({ value: String(i), label: `${c.student.firstName} ${c.student.lastName}` }))} />
                      <div className="flex gap-2">
                        <Button variant="outline" aria-label="Élève précédent" icon="chevron_left" disabled={idx <= 0} onClick={() => setIdx(idx - 1)} />
                        <Button variant="outline" aria-label="Élève suivant" icon="chevron_right" disabled={idx >= data.length - 1} onClick={() => setIdx(idx + 1)} />
                      </div>
                    </div>
                  </Card>
                )}

                {showBand && (
                  <div className="no-print grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                    <HeroCard
                      eyebrow={`Bulletins · ${allowed.find((c) => c.id === effectiveClass)?.name ?? "classe"}`}
                      icon="description"
                      value={classAverage === null ? "—" : formatNumber(classAverage)}
                      label={`moyenne de classe · ${data.length} élève${data.length > 1 ? "s" : ""}`}
                      footnote={current ? `Bulletin affiché : ${current.student.firstName} ${current.student.lastName} · ${current.period.label}` : undefined}
                    >
                      <HeroBar
                        segments={[
                          { pct: classAvgs.length ? Math.round(((classAvgs.length - belowTen) / classAvgs.length) * 100) : 0, className: "bg-lime" },
                          { pct: classAvgs.length ? Math.round((belowTen / classAvgs.length) * 100) : 0, className: "bg-red-400/80" },
                        ]}
                      />
                      <HeroLegend
                        items={[
                          { dot: "bg-lime", label: `≥ 10 · ${classAvgs.length - belowTen}` },
                          { dot: "bg-red-400", label: `< 10 · ${belowTen}` },
                        ]}
                        trailing={
                          <>
                            <Icon name="military_tech" className="text-[14px]" />
                            Major {bestAvg === null ? "—" : formatNumber(bestAvg)}
                          </>
                        }
                      />
                    </HeroCard>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <KpiTile tone="lime" icon="description" label="Bulletins" value={data.length} note="Élèves évalués" />
                      <KpiTile tone="sky" icon="trending_up" label="Moyenne de classe" value={classAverage === null ? "—" : formatNumber(classAverage)} note="Toutes matières" />
                      <KpiTile tone={belowTen > 0 ? "red" : "neutral"} icon="warning" label="Sous la moyenne" value={`${belowTen} / ${data.length}`} note="Moyenne < 10" />
                      <KpiTile tone="violet" icon="military_tech" label="Meilleure moyenne" value={bestAvg === null ? "—" : formatNumber(bestAvg)} note="Major de classe" />
                    </div>
                  </div>
                )}
                {cards.loading && !cards.error ? (
                  <Skeleton className="h-[600px] w-full" />
                ) : cards.error ? (
                  <EmptyState icon="cloud_off" title="Chargement impossible" text={cards.error} action={<Button onClick={cards.reload} icon="refresh">Réessayer</Button>} />
                ) : !current ? (
                  <EmptyState icon="description" title="Pas de bulletin" text="Aucun élève dans cette classe pour cette période." />
                ) : (
                  <>
                    {/* Bandeau élève / parent : ses propres résultats, sur le modèle de la console admin. */}
                    {(isParent || isStudent) && current && (
                      <div className="no-print grid gap-4 sm:grid-cols-3">
                        <HeroCard
                          eyebrow="Moyenne générale"
                          icon="grade"
                          value={current.generalAverage === null ? "—" : formatNumber(current.generalAverage)}
                          label={`sur ${current.classRoom.cycle === "elementaire" ? 10 : 20}`}
                          badge={
                            current.generalAverage == null
                              ? null
                              : <Badge tone={averageTone(current.generalAverage)} className="px-2 py-0.5 text-[10px]">{formatNumber(current.generalAverage)}</Badge>
                          }
                        />
                        <KpiTile icon="emoji_events" label="Rang" value={current.rank ?? "—"} note={`sur ${current.classSize}`} tone="sky" />
                        <KpiTile icon="description" label="Période" value={current.period.label} tone="neutral" />
                      </div>
                    )}
                    {current.classRoom.cycle === "elementaire" ? (
                      <ElementaryReport card={current} schoolName={overview.settings.name} exam={levels.find((l) => l.id === current.classRoom.levelId)?.exam} />
                    ) : (
                      <SecondaryReport card={current} schoolName={overview.settings.name} exam={levels.find((l) => l.id === current.classRoom.levelId)?.exam} />
                    )}
                    {!isParent && !isStudent && <MetaEditor card={current} onSaved={cards.reload} />}
                  </>
                )}
              </div>
            )
          }
        </AsyncView>
      )}
    </>
  );
}
