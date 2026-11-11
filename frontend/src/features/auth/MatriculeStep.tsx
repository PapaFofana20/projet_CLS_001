// Verification du matricule d'ecole avant l'inscription eleve ou parent.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SchoolMark } from "@/components/ui/Brand";
import type { School } from "@/types";
import { verifyMatricule } from "@/services/schoolService";
import { formatMatriculeInput, isValidMatricule, MATRICULE_LENGTH } from "@/utils/matricule";

type State = "idle" | "checking" | "found" | "error";

interface Props {
  initial?: string;
  onFound: (school: School) => void;
  onBack?: () => void;
}

/**
 * ÉTAPE 1 élève / parent : saisie du matricule d'école.
 * Majuscules automatiques, espaces et tirets tolérés, vérification instantanée.
 */
export function MatriculeStep({ initial = "", onFound, onBack }: Props) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<State>("idle");
  const [school, setSchool] = useState<School | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  // Séquence des vérifications : seule la DERNIÈRE requête lancée peut
  // modifier l'état (sans elle, une réponse lente d'un premier code
  // écrasait le résultat d'un code saisi ensuite).
  const checkSeq = useRef(0);

  const check = async (raw: string) => {
    const code = formatMatriculeInput(raw);
    if (!isValidMatricule(code)) {
      // Saisie incomplète : aucun message d'erreur pendant la frappe.
      setState("idle");
      setError(null);
      return;
    }
    const seq = ++checkSeq.current;
    setState("checking");
    setError(null);
    try {
      const result = await verifyMatricule(code);
      if (seq !== checkSeq.current) return; // une saisie plus récente a pris le relais
      if (result.ok && result.school) {
        setSchool(result.school);
        setState("found");
      } else {
        setSchool(null);
        setState("error");
        setError(result.message ?? "Matricule introuvable.");
      }
    } catch {
      // Panne réseau/API : sans ce catch, la promesse rejetée laissait
      // l'étant bloqué sur « Vérification… » pour toujours.
      if (seq !== checkSeq.current) return;
      setSchool(null);
      setState("error");
      setError("Vérification impossible pour le moment. Réessayez.");
    }
  };

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (isValidMatricule(value)) timer.current = window.setTimeout(() => void check(value), 400);
    else {
      // Pendant la frappe (code incomplet), le champ reste neutre : l'erreur
      // ne s'affiche que si la vérification d'un code complet échoue.
      setState("idle");
      setError(null);
      setSchool(null);
    }
    return () => window.clearTimeout(timer.current);

  }, [value]);

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-lg font-extrabold text-ink">Matricule de votre école</h2>
        <p className="mt-1 text-sm text-neutral-600">
          L'école vous a communiqué un code de {MATRICULE_LENGTH} caractères. Collez-le ici, même depuis WhatsApp.
        </p>
      </div>
      <Input
        label="Matricule de l'école"
        required
        autoFocus
        icon="key"
        inputMode="text"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="X7K9Q"
        value={value}
        maxLength={MATRICULE_LENGTH + 3}
        onChange={(e) => setValue(formatMatriculeInput(e.target.value))}
        error={state === "error" ? error : null}
        hint="5 caractères, sans 0, O, 1 ni I."
      />
      {state === "checking" && (
        <p role="status" className="flex items-center gap-2 text-sm font-medium text-forest">
          <span className="size-4 animate-spin rounded-full border-2 border-forest border-t-transparent" />
          Vérification du matricule…
        </p>
      )}
      {state === "found" && school && (
        <div className="popover-enter rounded-2xl border-2 border-leaf bg-lime-pale p-5">
          <div className="flex items-center gap-4">
            <SchoolMark name={school.name} matricule={school.matricule} size={52} />
          </div>
          <p className="mt-3 text-sm font-semibold text-forest">
            {school.city} · {school.cycles.length} cycle(s) · matricule vérifié
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="dark" icon="how_to_reg" onClick={() => onFound(school)}>
              C'est mon école
            </Button>
            <Button variant="ghost" onClick={() => { setValue(""); setSchool(null); setState("idle"); }}>
              Changer de matricule
            </Button>
          </div>
        </div>
      )}
      {/* L'erreur (ex. « Matricule introuvable… ») s'affiche une seule fois,
          sous le champ via la prop error de Input — pas de second encadré. */}
      {onBack && (
        <Button variant="ghost" icon="arrow_back" onClick={onBack}>
          Changer de rôle
        </Button>
      )}
    </Card>
  );
}

/** Saisie du matricule de l'élève (étape 2 du parent). */
export function ChildCodeInput({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string | null }) {
  return (
    <Input
      label="Matricule de l'élève"
      required
      icon="confirmation_number"
      inputMode="text"
      autoCapitalize="characters"
      spellCheck={false}
      placeholder="EC260001"
      value={value}
      maxLength={20}
      onChange={(e) => onChange(formatMatriculeInput(e.target.value, 20))}
      error={error}
      hint="Matricule unique de l'enfant, donné par l'école (ex. EC260001)."
    />
  );
}