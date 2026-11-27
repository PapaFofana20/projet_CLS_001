// Parametres de tarification : coefficients, frais et reductions.

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { useSchool } from "@/context/SchoolContext";
import { HeroBar, HeroCard, HeroLegend, KpiTile, PanelHeading } from "@/features/admin/adminUi";
import { setClassSubject, updateSettings, type SchoolOverview } from "@/services/schoolService";
import type { Cycle, LevelFees } from "@/types";
import { formatCurrency } from "@/utils/format";
import { CYCLES, CYCLE_LABELS } from "@/data/school";

interface TabProps {
  overview: SchoolOverview;
  onSaved: () => void;
}

/** Coefficients par classe (et par série) : ClassSubject { classId, subjectId, coefficient }. */
export function CoefficientsTab({ overview, onSaved }: TabProps) {
  const { toast } = useToast();
  const { schoolId } = useAuth();
  const school = useSchool();
  const [classId, setClassId] = useState(overview.classes[0]?.id ?? "");
  const [draft, setDraft] = useState<Record<string, string>>({});

  /** Sur le plan gratuit (essentiel), seuls le cycle choisi sont autorisés. */
  const isFreePlan = school.plan?.id === "essentiel";
  const freeCycle = isFreePlan ? (school.school?.cycles?.[0] ?? (school.settings?.cycles?.[0])) : undefined;
  const allowedCycles = isFreePlan && freeCycle ? [freeCycle] : (isFreePlan ? (school.school?.cycles ?? school.settings?.cycles ?? CYCLES) : CYCLES);

  /** Classes filtrées selon les cycles autorisés. */
  const eligibleClasses = overview.classes.filter((c) => allowedCycles.includes(c.cycle));
  const selectedClass = eligibleClasses.find((c) => c.id === classId) ?? eligibleClasses[0];

  const cycleLabel = selectedClass ? CYCLE_LABELS[selectedClass.cycle] : "";

  /** Matières de l'école restreintes aux cycles autorisés ET au cycle de la classe sélectionnée. */
  const eligible = overview.subjects.filter((s) =>
    allowedCycles.includes(selectedClass?.cycle ?? s.cycles[0]) && (!selectedClass || s.cycles.includes(selectedClass.cycle))
  );

  const apply = async (subjectId: string, value: number | null, ok: string) => {
    if (!selectedClass) return;
    try {
      await setClassSubject(schoolId, selectedClass.id, subjectId, value);
      toast(ok);
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Enregistrement impossible.", "error");
    }
  };

  return (
    <div className="space-y-4">
      {(() => {
        const rows = selectedClass ? overview.classSubjects.filter((cs) => cs.classId === selectedClass.id) : [];
        const subjectsOfCycle = overview.subjects.filter((s) => !selectedClass || s.cycles.includes(selectedClass.cycle));
        const covered = subjectsOfCycle.filter((s) => rows.some((r) => r.subjectId === s.id)).length;
        const pct = subjectsOfCycle.length ? Math.round((covered / subjectsOfCycle.length) * 100) : 0;
        return (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <HeroCard
              eyebrow={`Coefficients · ${selectedClass?.name ?? "aucune classe"}`}
              icon="balance"
              value={`${covered}/${subjectsOfCycle.length}`}
              label={`matière${subjectsOfCycle.length > 1 ? "s" : ""} coefficientée${subjectsOfCycle.length > 1 ? "s" : ""} · ${cycleLabel || "—"}`}
              footnote={
                isFreePlan
                  ? "Plan Découverte : coefficients limités au cycle de l'école."
                  : "Les coefficients dépendent de la classe et de la série. À l'élémentaire, tous valent 1."
              }
            >
              <HeroBar segments={[{ pct, className: "bg-lime" }, { pct: Math.max(0, 100 - pct), className: "bg-white/20" }]} />
              <HeroLegend
                items={[
                  { dot: "bg-lime", label: `Configurées · ${covered}` },
                  { dot: "bg-white/40", label: `À définir · ${Math.max(0, subjectsOfCycle.length - covered)}` },
                ]}
                trailing={
                  <>
                    <Icon name="menu_book" className="text-[14px]" />
                    {overview.subjects.length} matières
                  </>
                }
              />
            </HeroCard>
            <div className="grid gap-3 sm:grid-cols-2">
              <KpiTile tone="lime" icon="meeting_room" label="Classes" value={eligibleClasses.length} />
              <KpiTile tone="sky" icon="menu_book" label="Matières" value={overview.subjects.length} />
              <KpiTile tone={pct < 100 ? "amber" : "neutral"} icon="balance" label="Couverture" value={`${pct} %`} />
              <KpiTile tone="violet" icon="stairs" label="Cycle" value={cycleLabel || "—"} valueClassName="text-lg" />
            </div>
          </div>
        );
      })()}

      <Card>
        <PanelHeading
          icon="balance"
          title="Coefficients par classe"
          subtitle={
            isFreePlan
              ? `Plan Découverte (gratuit) : coefficients réservés au cycle ${cycleLabel} seul. Passez à un plan payant pour gérer tous les cycles.`
              : "Les coefficients dépendent de la classe et de la série. À l'élémentaire, tous valent 1."
          }
          action={selectedClass ? <Badge tone="dark">{selectedClass.name}</Badge> : undefined}
        />
        {eligibleClasses.length === 0 && (
          <p className="mt-4 text-sm text-neutral-500">Aucune classe dans les cycles autorisés.</p>
        )}
        {eligibleClasses.length > 0 && (
          <>
            <Select compact className="mt-4 mb-2 w-56" aria-label="Classe" value={classId} onChange={(e) => { setClassId(e.target.value); setDraft({}); }} options={eligibleClasses.map((c) => ({ value: c.id, label: `${c.name}${c.series ? ` (série ${c.series})` : ""}` }))} />
          <ul className="divide-y divide-neutral-100">
            {eligible.map((s) => {
              if (selectedClass && !s.cycles.includes(selectedClass.cycle)) return null;
              const cs = overview.classSubjects.find((x) => x.classId === selectedClass.id && x.subjectId === s.id);
              const key = s.id;
              const val = draft[key] ?? String(cs?.coefficient ?? "");
              const n = Number(val);
              const err = cs && (!Number.isInteger(n) || n < 1 || n > 10) ? "Entier de 1 à 10." : null;
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                  <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 font-semibold">
                    <input type="checkbox" className="size-5 accent-forest" checked={!!cs} onChange={() => void apply(s.id, cs ? null : 1, cs ? `${s.name} retirée de la classe.` : `${s.name} ajoutée à la classe.`)} />
                    {s.name}
                  </label>
                  {cs && (
                    <div>
                      <label className="sr-only" htmlFor={`coef-${s.id}`}>Coefficient de {s.name}</label>
                      <input id={`coef-${s.id}`} type="number" min={1} max={10} value={val} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} onBlur={() => { if (!err && n !== cs.coefficient) void apply(s.id, n, "Coefficient enregistré."); }} aria-invalid={!!err} className={`min-h-11 w-24 rounded-xl border px-3 text-center font-bold ${err ? "border-danger bg-red-50" : "border-neutral-300"}`} />
                      {err && <p role="alert" className="mt-1 text-xs text-danger">{err}</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {eligible.length > 0 && selectedClass && !eligible.some((s) => s.cycles.includes(selectedClass.cycle)) && (
            <p className="mt-3 text-xs text-neutral-500">Aucune matière éligible pour cette classe.</p>
          )}
        </>
      )}
      </Card>
    </div>
  );
}

/** Tarifs par niveau, frais annexes et réduction fratrie. */
export function FeesTab({ overview, onSaved }: TabProps) {
  const { toast } = useToast();
  const { schoolId } = useAuth();
  const school = useSchool();
  const s = overview.settings;
  const [fees, setFees] = useState<Record<string, { inscription: string; mensualite: string }>>(() => Object.fromEntries(Object.entries(s.fees).map(([k, v]) => [k, { inscription: String(v.inscription), mensualite: String(v.mensualite) }])));
  const [annex, setAnnex] = useState({ cantine: String(s.annexFees.cantine), transport: String(s.annexFees.transport), tenue: String(s.annexFees.tenue) });
  const [discount, setDiscount] = useState(String(s.siblingDiscount));
  const [busy, setBusy] = useState(false);

  /** Cycles couverts par l'abonnement : un seul sur le plan gratuit (Découverte). */
  const isFreePlan = school.plan?.id === "essentiel";
  const freeCycle = isFreePlan ? (school.school?.cycles?.[0] ?? s.cycles?.[0]) : undefined;
  const allowedCycles: Cycle[] = isFreePlan && freeCycle
    ? [freeCycle]
    : (s.cycles?.length ? s.cycles : (school.school?.cycles?.length ? school.school.cycles : CYCLES));
  /** Niveaux tarifables : uniquement les classes des cycles de l'abonnement. */
  const eligibleLevels = overview.levels.filter((l) => allowedCycles.includes(l.cycle));

  const bad = (v: string) => !(Number(v) >= 0) || v === "" || Number(v) > 1_000_000;
  const invalid = eligibleLevels.some((l) => {
    const f = fees[l.id];
    return f && (bad(f.inscription) || bad(f.mensualite));
  }) || Object.values(annex).some(bad) || bad(discount) || Number(discount) > 50;

  const save = async () => {
    // Un champ vide donnerait 0 avec Number("") : on refuse la sauvegarde.
    if (invalid) {
      toast("Corrigez les champs invalides avant d'enregistrer.", "error");
      return;
    }
    setBusy(true);
    try {
      const nextFees: Record<string, LevelFees> = Object.fromEntries(Object.entries(fees).map(([k, v]) => [k, { inscription: Number(v.inscription), mensualite: Number(v.mensualite) }]));
      await updateSettings(schoolId, { fees: nextFees, annexFees: { cantine: Number(annex.cantine), transport: Number(annex.transport), tenue: Number(annex.tenue) }, siblingDiscount: Number(discount) });
      toast("Tarifs enregistrés.");
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Enregistrement impossible.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {(() => {
        const levelCount = eligibleLevels.length;
        const totals = eligibleLevels.map((l) => {
          const f = fees[l.id];
          return f ? Number(f.inscription) + Number(f.mensualite) * 10 : 0;
        });
        const avg = levelCount ? Math.round(totals.reduce((a, b) => a + b, 0) / levelCount) : 0;
        const min = totals.length ? Math.min(...totals) : 0;
        const max = totals.length ? Math.max(...totals) : 0;
        const cycleNote = isFreePlan
          ? `cycle ${freeCycle ? CYCLE_LABELS[freeCycle] : "—"} seul (offre gratuite)`
          : `${allowedCycles.length} cycle${allowedCycles.length > 1 ? "s" : ""} · ${allowedCycles.map((c) => CYCLE_LABELS[c]).join(", ")}`;
        return (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <HeroCard
              eyebrow="Tarification annuelle"
              icon="sell"
              value={formatCurrency(avg)}
              label={`coût annuel moyen · ${levelCount} niveau${levelCount > 1 ? "x" : ""} tarifé${levelCount > 1 ? "s" : ""}`}
              footnote={`De ${formatCurrency(min)} à ${formatCurrency(max)} par an · ${cycleNote} · réduction fratrie ${discount || 0} %`}
              valueClassName="text-2xl sm:text-3xl"
            >
              <HeroBar
                segments={eligibleLevels.map((l, index) => {
                  const f = fees[l.id];
                  const t = f ? Number(f.inscription) + Number(f.mensualite) * 10 : 0;
                  return { pct: max > 0 ? Math.round((t / max) * 100) : 0, className: index % 3 === 0 ? "bg-lime" : index % 3 === 1 ? "bg-emerald-300/90" : "bg-amber-300/90" };
                })}
              />
              <HeroLegend
                items={eligibleLevels.slice(0, 4).map((l, index) => {
                  const f = fees[l.id];
                  const t = f ? Number(f.inscription) + Number(f.mensualite) * 10 : 0;
                  return { dot: index % 3 === 0 ? "bg-lime" : index % 3 === 1 ? "bg-emerald-300" : "bg-amber-300", label: `${l.label} · ${formatCurrency(t)}` };
                })}
                trailing={
                  <>
                    <Icon name="receipt_long" className="text-[14px]" />
                    10 mensualités
                  </>
                }
              />
            </HeroCard>
            <div className="grid gap-3 sm:grid-cols-2">
              <KpiTile tone="lime" icon="sell" label="Tarif moyen" value={formatCurrency(avg)} note="Par an, par élève" valueClassName="text-lg" />
              <KpiTile tone="sky" icon="trending_up" label="Tarif le plus élevé" value={formatCurrency(max)} note="Niveau supérieur" valueClassName="text-lg" />
              <KpiTile tone="amber" icon="percent" label="Réduction fratrie" value={`${discount || 0} %`} note="Familles nombreuses" />
              <KpiTile tone="violet" icon="payments" label="Cantine" value={formatCurrency(Number(annex.cantine))} note="Par mois" valueClassName="text-lg" />
            </div>
          </div>
        );
      })()}

      <Card padded={false} className="overflow-hidden px-2 pb-2">
        <div className="px-3 pt-4 sm:px-4">
          <PanelHeading
            icon="receipt_long"
            title="Tarifs par niveau"
            subtitle={
              isFreePlan
                ? `Inscription et mensualité sur 10 mois, en FCFA. Offre gratuite : cycle ${freeCycle ? CYCLE_LABELS[freeCycle] : "—"} uniquement.`
                : "Inscription (une fois) et mensualité sur 10 mois (octobre à juillet), en FCFA."
            }
          />
        </div>
        {eligibleLevels.length === 0 && (
          <p className="px-4 pb-4 text-sm text-neutral-500">Aucun niveau dans les cycles de votre abonnement.</p>
        )}
        {eligibleLevels.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">Tarifs par niveau des cycles de l'abonnement</caption>
              <thead><tr className="text-left text-xs uppercase tracking-wide text-neutral-500"><th className="px-4 py-3">Niveau</th><th className="px-2 py-3">Inscription</th><th className="px-2 py-3">Mensualité</th><th className="px-2 py-3 text-right">Total annuel</th></tr></thead>
              <tbody>
                {eligibleLevels.map((l) => {
                  const f = fees[l.id] ?? { inscription: "0", mensualite: "0" };
                  return (
                    <tr key={l.id} className="border-t border-neutral-100">
                      <th scope="row" className="px-4 py-2 text-left font-bold">{l.label}</th>
                      <td className="px-2 py-2"><input aria-label={`Inscription ${l.label}`} type="number" min={0} step={500} value={f.inscription} onChange={(e) => setFees({ ...fees, [l.id]: { ...f, inscription: e.target.value } })} className="min-h-11 w-32 rounded-xl border border-neutral-300 px-3" /></td>
                      <td className="px-2 py-2"><input aria-label={`Mensualité ${l.label}`} type="number" min={0} step={500} value={f.mensualite} onChange={(e) => setFees({ ...fees, [l.id]: { ...f, mensualite: e.target.value } })} className="min-h-11 w-32 rounded-xl border border-neutral-300 px-3" /></td>
                      <td className="px-2 py-2 text-right font-semibold">{formatCurrency(Number(f.inscription) + Number(f.mensualite) * 10)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card>
        <PanelHeading icon="add_card" title="Frais annexes et réduction fratrie" subtitle="Services optionnels facturés en complément de la scolarité" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input label="Cantine (par mois)" type="number" value={annex.cantine} onChange={(e) => setAnnex({ ...annex, cantine: e.target.value })} error={bad(annex.cantine) ? "Montant invalide." : null} />
          <Input label="Transport (par mois)" type="number" value={annex.transport} onChange={(e) => setAnnex({ ...annex, transport: e.target.value })} error={bad(annex.transport) ? "Montant invalide." : null} />
          <Input label="Tenue (une fois)" type="number" value={annex.tenue} onChange={(e) => setAnnex({ ...annex, tenue: e.target.value })} error={bad(annex.tenue) ? "Montant invalide." : null} />
          <Input label="Réduction fratrie (%)" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} error={bad(discount) || Number(discount) > 50 ? "Entre 0 et 50 %." : null} />
        </div>
        <Button className="mt-5" variant="dark" icon="save" loading={busy} disabled={invalid} onClick={() => void save()}>Enregistrer les tarifs</Button>
      </Card>
    </div>
  );
}
