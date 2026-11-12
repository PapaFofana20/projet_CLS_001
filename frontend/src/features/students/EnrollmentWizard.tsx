// Inscription d'un eleve en trois etapes (eleve, parent, classe et frais).

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useCurrentUser } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { CYCLE_LABELS } from "@/data/school";
import { useForm } from "@/hooks/useForm";
import { enrollStudent } from "@/services/studentService";
import type { Cycle, Parent, StudentOptions } from "@/types";
import type { SchoolOverview } from "@/services/schoolService";
import { cn } from "@/utils/cn";
import { formatCurrency, isValidEmail, isValidSnPhone, parseFrDate } from "@/utils/format";
import { discountedMonthly } from "@/utils/payments";

const STEPS = ["Élève", "Parents", "Classe et frais"];
type Mode = "new" | "existing";

interface Props {
  overview: SchoolOverview;
  parents: Parent[];
  childrenByParent: Record<string, number>;
}

// Guide l'inscription eleve par eleve, avec le recapitulatif des frais.
export function EnrollmentWizard({ overview, parents, childrenByParent }: Props) {
  const user = useCurrentUser();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("new");
  const [parentId, setParentId] = useState("");
  const [cycle, setCycle] = useState<Cycle | "">("");
  const [options, setOptions] = useState<StudentOptions>({ cantine: false, transport: false, tenue: true });
  const [error, setError] = useState<string | null>(null);

  const form = useForm(
    { firstName: "", lastName: "", gender: "F", birthDate: "", pFirst: "", pLast: "", pPhone: "", pEmail: "", pAddress: "", classId: "" },
    (v) => ({
      ...(v.firstName.trim().length < 2 ? { firstName: "Le prénom est obligatoire." } : {}),
      ...(v.lastName.trim().length < 2 ? { lastName: "Le nom est obligatoire." } : {}),
      ...(!parseFrDate(v.birthDate) ? { birthDate: "Date invalide. Format attendu : JJ/MM/AAAA." } : {}),
      ...(mode === "new" && v.pFirst.trim().length < 2 ? { pFirst: "Le prénom du parent est obligatoire." } : {}),
      ...(mode === "new" && v.pLast.trim().length < 2 ? { pLast: "Le nom du parent est obligatoire." } : {}),
      ...(mode === "new" && !isValidSnPhone(v.pPhone) ? { pPhone: "Numéro invalide (ex. 77 123 45 67)." } : {}),
      ...(mode === "new" && !isValidEmail(v.pEmail) ? { pEmail: "E-mail invalide." } : {}),
      ...(mode === "new" && v.pAddress.trim() && v.pAddress.trim().length < 3 ? { pAddress: "L'adresse doit contenir au moins 3 caractères." } : {}),
      ...(!v.classId ? { classId: "Choisissez une classe." } : {}),
    }),
  );

  const enabledCycles = overview.settings.cycles;
  const classOptions = overview.classes.filter((c) => c.cycle === cycle);
  const chosenClass = overview.classes.find((c) => c.id === form.values.classId);
  const fees = chosenClass ? overview.settings.fees[chosenClass.levelId] : undefined;
  const siblings = mode === "existing" && parentId ? childrenByParent[parentId] ?? 0 : 0;
  const discount = siblings > 0 ? overview.settings.siblingDiscount : 0;

  const recap = useMemo(() => {
    if (!fees) return null;
    const mens = discountedMonthly(fees.mensualite, discount);
    const extra = (options.cantine ? overview.settings.annexFees.cantine : 0) + (options.transport ? overview.settings.annexFees.transport : 0);
    return { inscription: fees.inscription, mens, extra, tenue: options.tenue ? overview.settings.annexFees.tenue : 0, monthly: mens + extra };
  }, [fees, discount, options, overview.settings.annexFees]);

  const stepValid = (s: number) => {
    const keys: Record<number, (keyof typeof form.values)[]> = {
      0: ["firstName", "lastName", "birthDate"],
      1: mode === "new" ? ["pFirst", "pLast", "pPhone", "pEmail"] : [],
      2: ["classId"],
    };
    return keys[s].every((k) => !form.errors[k]) && (s !== 1 || mode === "new" || !!parentId);
  };

  const next = () => {
    form.touchAll();
    if (stepValid(step)) setStep(step + 1);
  };

  const submit = async () => {
    form.touchAll();
    if (!stepValid(2) || !chosenClass) return;
    const v = form.values;
    setBusy(true);
    setError(null);
    try {
      const s = await enrollStudent(user, {
        firstName: v.firstName,
        lastName: v.lastName,
        gender: v.gender === "M" ? "M" : "F",
        birthDate: parseFrDate(v.birthDate) ?? "",
        classId: chosenClass.id,
        options,
        parent: mode === "existing" ? { mode: "existing", parentId } : { mode: "new", firstName: v.pFirst, lastName: v.pLast, phone: v.pPhone, email: v.pEmail, address: v.pAddress },
      });
      toast(`${s.firstName} ${s.lastName} est inscrit(e) en ${s.className}. Matricule de l'élève : ${s.matricule} — à lui communiquer pour créer son compte.`);
      navigate(`/app/eleves/${s.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Inscription impossible.");
      setBusy(false);
    }
  };

  const toggle = (k: keyof StudentOptions) => setOptions((o) => ({ ...o, [k]: !o[k] }));
  const optionLabels: Record<keyof StudentOptions, string> = { cantine: "Cantine", transport: "Transport", tenue: "Tenue scolaire" };
  const optionPrices = overview.settings.annexFees;

  return (
    <div className="mx-auto max-w-3xl">
      <ol className="mb-6 grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2" aria-label="Étapes de l'inscription">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className={cn("flex items-center gap-2 rounded-full px-3 py-2.5 text-xs font-bold sm:text-sm", i === step ? "bg-forest text-white" : i < step ? "bg-lime text-forest" : "bg-white text-neutral-500")}>
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-xs", i === step ? "bg-lime text-forest" : "bg-mist text-forest")}>{i < step ? <Icon name="check" className="text-[14px]" /> : i + 1}</span>
            <span className="truncate">{s}</span>
          </li>
        ))}
      </ol>
      <Card className="space-y-5">
        {error && (
          <div role="alert" className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-danger">
            {error}
          </div>
        )}
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Prénom" required placeholder="Ex. Aminata" {...form.field("firstName")} />
            <Input label="Nom" required placeholder="Ex. Diop" {...form.field("lastName")} />
            <Select label="Genre" options={[{ value: "F", label: "Fille" }, { value: "M", label: "Garçon" }]} {...form.field("gender")} />
            <Input label="Date de naissance" required placeholder="JJ/MM/AAAA" inputMode="numeric" hint="Format attendu : JJ/MM/AAAA." {...form.field("birthDate")} />
          </div>
        )}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex gap-2" role="radiogroup" aria-label="Parent">
              {(["new", "existing"] as Mode[]).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cn("min-h-11 flex-1 rounded-full px-4 text-sm font-semibold", mode === m ? "bg-forest text-white" : "bg-mist")}>
                  {m === "new" ? "Nouveau parent" : "Parent déjà inscrit (fratrie)"}
                </button>
              ))}
            </div>
            {mode === "new" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Prénom du parent" required placeholder="Ex. Aminata" {...form.field("pFirst")} />
                <Input label="Nom du parent" required placeholder="Ex. Diop" {...form.field("pLast")} />
                <Input label="Téléphone" required placeholder="77 123 45 67" hint="Numéro sénégalais à 9 chiffres." {...form.field("pPhone")} />
                <Input label="E-mail" type="email" required placeholder="vous@exemple.sn" hint="Cette adresse servira à créer le compte parent." {...form.field("pEmail")} />
                <Input className="sm:col-span-2" label="Adresse" icon="location_on" placeholder="Ex. Quartier, rue, numéro" hint="Adresse du domicile des parents." {...form.field("pAddress")} />
              </div>
            ) : (
              <div className="space-y-3">
                <Select label="Parent" required placeholder="Rechercher un parent" value={parentId} onChange={(e) => setParentId(e.target.value)} options={parents.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName} · ${p.phone}` }))} />
                {siblings > 0 && <p className="rounded-2xl bg-lime-soft p-4 text-sm font-medium text-forest">Réduction fratrie de {overview.settings.siblingDiscount} % appliquée sur la mensualité ({siblings} élève{siblings > 1 ? "s" : ""} déjà inscrit{siblings > 1 ? "s" : ""}).</p>}
              </div>
            )}
          </div>
        )}
        {step === 2 && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Cycle" required placeholder="Choisir un cycle" value={cycle} onChange={(e) => { setCycle(e.target.value as Cycle); form.set("classId", ""); }} options={enabledCycles.map((c) => ({ value: c, label: CYCLE_LABELS[c] }))} />
              <Select label="Classe" required placeholder={cycle ? "Choisir une classe" : "Choisissez d'abord un cycle"} disabled={!cycle} {...form.field("classId")} options={classOptions.map((c) => ({ value: c.id, label: c.name }))} />
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Frais annexes (optionnels)</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(Object.keys(optionLabels) as (keyof StudentOptions)[]).map((k) => (
                  <label key={k} className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border p-3 text-sm font-semibold", options[k] ? "border-forest bg-lime-soft" : "border-neutral-200")}>
                    <input type="checkbox" className="size-5 accent-forest" checked={options[k]} onChange={() => toggle(k)} />
                    <span>
                      {optionLabels[k]}
                      <span className="block text-xs font-normal text-neutral-500">
                        {formatCurrency(optionPrices[k])}
                        {k === "tenue" ? "" : " / mois"}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {recap && (
              <div className="rounded-2xl bg-forest p-5 text-white">
                <h3 className="mb-3 font-bold">Récapitulatif des frais</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt>Inscription</dt><dd className="font-semibold">{formatCurrency(recap.inscription)}</dd></div>
                  <div className="flex justify-between"><dt>Mensualité{discount ? ` (−${discount} % fratrie)` : ""}</dt><dd className="font-semibold">{formatCurrency(recap.mens)}</dd></div>
                  {recap.extra > 0 && <div className="flex justify-between"><dt>Cantine / transport</dt><dd className="font-semibold">{formatCurrency(recap.extra)}</dd></div>}
                  {recap.tenue > 0 && <div className="flex justify-between"><dt>Tenue scolaire (une fois)</dt><dd className="font-semibold">{formatCurrency(recap.tenue)}</dd></div>}
                  <div className="flex justify-between border-t border-white/20 pt-2 text-base"><dt>Mensualité totale × 10</dt><dd className="font-extrabold text-lime">{formatCurrency(recap.monthly)} × 10</dd></div>
                </dl>
              </div>
            )}
            {chosenClass && <p className="text-xs text-neutral-500">Capacité de {chosenClass.name} : {chosenClass.capacity} places.</p>}
          </div>
        )}
        <div className="flex justify-between gap-3 border-t border-neutral-100 pt-5">
          <Button variant="outline" onClick={() => (step === 0 ? navigate("/app/eleves") : setStep(step - 1))} disabled={busy}>
            {step === 0 ? "Annuler" : "Retour"}
          </Button>
          {step < 2 ? (
            <Button variant="dark" onClick={next}>
              Continuer
              <Icon name="arrow_forward" className="text-[20px]" />
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void submit()} loading={busy} disabled={!form.values.classId}>
              Valider l'inscription
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
