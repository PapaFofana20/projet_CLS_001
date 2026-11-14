// Inscription d'un parent rattache a un eleve deja inscrit.

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { SchoolMark } from "@/components/ui/Brand";
import { ChildCodeInput } from "@/features/auth/MatriculeStep";
import { LegalConsent } from "@/features/auth/LegalConsent";
import { PasswordField } from "@/features/auth/PasswordField";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import type { School } from "@/types";
import { isValidEmail, isValidSnPhone } from "@/utils/format";
import { passwordError } from "@/utils/password";

interface Props {
  school: School;
  onBack: () => void;
}

/** ÉTAPE 2 parent : identité + matricule de l'élève fourni par l'école. */
export function ParentSignupForm({ school, onBack }: Props) {
  const { registerParent, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", email: "", studentMatricule: "", birthDate: "", password: "", confirm: "" });
  const [terms, setTerms] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = {
    firstName: form.firstName.trim().length < 2 ? "Le prénom est obligatoire." : null,
    lastName: form.lastName.trim().length < 2 ? "Le nom est obligatoire." : null,
    phone: !isValidSnPhone(form.phone) ? "Format attendu : 77 123 45 67." : null,
    email: !isValidEmail(form.email) ? "Saisissez une adresse e-mail valide." : null,
    studentMatricule: form.studentMatricule.trim().length < 4 ? "Saisissez le matricule de l'élève (ex. EC260001)." : null,
    birthDate: !/^\d{4}-\d{2}-\d{2}$/.test(form.birthDate) ? "Saisissez la date de naissance de l'élève (elle prouve son identité)." : null,
    password: passwordError(form.password, form.confirm),
    confirm: form.confirm !== form.password ? "Les mots de passe ne correspondent pas." : null,
    terms: terms ? null : "Vous devez accepter les CGU et la politique de confidentialité.",
  };
  const valid = Object.values(errors).every((e) => e === null);
  const show = (key: keyof typeof errors) => (touched[key] ? errors[key] : null);
  const touch = (key: string) => setTouched((t) => ({ ...t, [key]: true }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(Object.keys(errors).reduce((acc, k) => ({ ...acc, [k]: true }), {}));
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      // Payload explicite : ne pas transmettre le champ "confirm" (le mot de
      // passe de confirmation n'a pas à voyager jusqu'à l'API).
      const { childName } = await registerParent({
        schoolId: school.id,
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        email: form.email,
        studentMatricule: form.studentMatricule.trim().toUpperCase(),
        birthDate: form.birthDate,
        password: form.password,
      });
      logout();
      toast("Demande envoyée à l'école.");
      navigate("/inscription-envoyee", { replace: true, state: { role: "parent", eleve: childName } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inscription impossible.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Inscription du parent">
      <div className="flex items-center gap-3 rounded-2xl bg-lime-soft p-4">
        <SchoolMark name={school.name} size={40} />
        <span className="text-sm font-semibold text-forest">Espace parent · {school.name}</span>
      </div>
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl bg-red-50 p-4 text-sm font-medium text-danger">
          <Icon name="error" className="text-[20px]" />
          {error}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Prénom" required autoComplete="given-name" placeholder="Ex. Aminata" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} onBlur={() => touch("firstName")} error={show("firstName")} />
        <Input label="Nom" required autoComplete="family-name" placeholder="Ex. Diop" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} onBlur={() => touch("lastName")} error={show("lastName")} />
      </div>
      <div className="grid gap-4">
        <Input label="Téléphone" type="tel" required placeholder="77 123 45 67" autoComplete="tel" hint="Numéro sénégalais à 9 chiffres." value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} onBlur={() => touch("phone")} error={show("phone")} />
        <Input label="Adresse e-mail" type="email" required autoComplete="email" placeholder="vous@exemple.sn" hint="Cette adresse servira à vous connecter." value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} onBlur={() => touch("email")} error={show("email")} />
        <ChildCodeInput value={form.studentMatricule} onChange={(v) => setForm({ ...form, studentMatricule: v })} error={form.studentMatricule ? show("studentMatricule") : null} />
        <Input
          label="Date de naissance de l'élève"
          type="date"
          required
          max={new Date().toISOString().slice(0, 10)}
          hint="Elle doit correspondre à la fiche de l'élève : le matricule seul ne suffit pas à prouver le lien de parenté."
          value={form.birthDate}
          onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
          onBlur={() => touch("birthDate")}
          error={show("birthDate")}
        />
        <PasswordField value={form.password} placeholder="••••••••" onChange={(v) => setForm({ ...form, password: v })} error={show("password")} />
        <PasswordField label="Confirmer" showStrength={false} hint="Ressaisissez le même mot de passe." placeholder="••••••••" value={form.confirm} onChange={(v) => setForm({ ...form, confirm: v })} error={show("confirm")} />
      </div>
      <p className="flex items-start gap-2 rounded-2xl bg-mist p-4 text-xs text-neutral-600">
        <Icon name="family_restroom" className="text-[18px]" />
        Le matricule de l'élève permet de rattacher votre compte à votre élève dans cette école. Vous pourrez ajouter d'autres élèves depuis votre espace.
      </p>
      <LegalConsent checked={terms} onChange={setTerms} error={show("terms")} />
      <div className="flex gap-3">
        <Button type="button" variant="outline" size="lg" onClick={onBack} disabled={busy}>
          Retour
        </Button>
        <Button type="submit" size="lg" variant="dark" className="flex-1" loading={busy}>
          Envoyer ma demande
        </Button>
      </div>
    </form>
  );
}