// Creation du compte d'un eleve a partir de son matricule.

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { SchoolMark } from "@/components/ui/Brand";
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

/** ÉTAPE 2 élève : création du compte à partir du matricule d'élève unique
 *  (généré à l'inscription par la direction, ex. EC260001). Le compte est
 *  rattaché à la fiche déjà inscrite ; il ne sert ensuite plus qu'à se
 *  connecter avec matricule d'école + e-mail + mot de passe. */
export function StudentSignupForm({ school, onBack }: Props) {
  const { registerEnrolledStudent, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ studentMatricule: "", birthDate: "", email: "", phone: "", password: "", confirm: "" });
  const [terms, setTerms] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanMatricule = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);

  const errors = {
    studentMatricule: form.studentMatricule.trim().length < 4 ? "Saisissez votre matricule d'élève (ex. EC260001)." : null,
    birthDate: (() => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.birthDate)) return "Saisissez votre date de naissance (elle prouve votre identité).";
      const d = new Date(form.birthDate + "T00:00:00Z");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (d > today) return "La date de naissance ne peut pas être dans le futur.";
      const age = today.getFullYear() - d.getFullYear();
      if (age < 3) return "L'élève doit avoir au moins 3 ans.";
      return null;
    })(),
    email: !isValidEmail(form.email) ? "Saisissez une adresse e-mail valide." : null,
    phone: !isValidSnPhone(form.phone) ? "Format attendu : 77 123 45 67." : null,
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
      const { user } = await registerEnrolledStudent({
        schoolId: school.id,
        studentMatricule: form.studentMatricule.trim().toUpperCase(),
        birthDate: form.birthDate,
        email: form.email,
        phone: form.phone,
        password: form.password,
      });
      logout();
      toast(`Compte créé pour ${user.firstName} ${user.lastName} : connectez-vous avec le matricule de l'école, votre e-mail et votre mot de passe.`);
      navigate("/connexion", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création du compte impossible.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Création du compte élève">
      <div className="flex items-center gap-3 rounded-2xl bg-lime-soft p-4">
        <SchoolMark name={school.name} size={40} />
        <span className="text-sm font-semibold text-forest">Inscription à {school.name}</span>
      </div>
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl bg-red-50 p-4 text-sm font-medium text-danger">
          <Icon name="error" className="text-[20px]" />
          {error}
        </div>
      )}
      <div className="grid gap-4">
        <Input
          label="Matricule de l'élève"
          required
          icon="confirmation_number"
          inputMode="text"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="EC260001"
          hint="Matricule unique donné par l'école lors de votre inscription. Il ne sert qu'à créer votre compte."
          value={form.studentMatricule}
          onChange={(e) => setForm((f) => ({ ...f, studentMatricule: cleanMatricule(e.target.value) }))}
          onBlur={() => touch("studentMatricule")}
          error={show("studentMatricule")}
        />
        <Input
          label="Date de naissance"
          type="date"
          required
          max={new Date().toISOString().slice(0, 10)}
          hint="Elle doit correspondre à celle de votre fiche d'inscription : elle prouve que le compte vous appartient."
          value={form.birthDate}
          onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
          onBlur={() => touch("birthDate")}
          error={show("birthDate")}
        />
        <Input label="Adresse e-mail" type="email" required autoComplete="email" placeholder="vous@exemple.sn" hint="Cette adresse servira à vous connecter." value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} onBlur={() => touch("email")} error={show("email")} />
        <Input label="Téléphone" type="tel" required placeholder="77 123 45 67" hint="Numéro sénégalais à 9 chiffres." value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} onBlur={() => touch("phone")} error={show("phone")} />
        <PasswordField value={form.password} placeholder="••••••••" onChange={(v) => setForm((f) => ({ ...f, password: v }))} error={show("password")} />
        <PasswordField label="Confirmer" showStrength={false} hint="Ressaisissez le même mot de passe." placeholder="••••••••" value={form.confirm} onChange={(v) => setForm((f) => ({ ...f, confirm: v }))} error={show("confirm")} />
      </div>
      <p className="flex items-start gap-2 rounded-2xl bg-mist p-4 text-xs text-neutral-600">
        <Icon name="info" className="text-[18px]" />
        Votre compte est rattaché à votre fiche d'inscription : vos matières, notes et emplois du temps apparaîtront directement dans votre espace. Pour vous connecter, utilisez ensuite le matricule de l'école, votre e-mail et votre mot de passe.
      </p>
      <LegalConsent checked={terms} onChange={setTerms} error={show("terms")} />
      <div className="flex gap-3">
        <Button type="button" variant="outline" size="lg" onClick={onBack} disabled={busy}>
          Retour
        </Button>
        <Button type="submit" size="lg" variant="dark" className="flex-1" loading={busy}>
          Créer mon compte
        </Button>
      </div>
    </form>
  );
}
