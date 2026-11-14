// Inscription d'un directeur et creation de son ecole.

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { LegalConsent } from "@/features/auth/LegalConsent";
import { PasswordField } from "@/features/auth/PasswordField";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { CYCLES, CYCLE_LABELS } from "@/data/school";
import type { Cycle } from "@/types";
import { cn } from "@/utils/cn";
import { isValidEmail, isValidSnPhone } from "@/utils/format";
import { passwordError } from "@/utils/password";

const SENEGAL_CITIES = [
  "Dakar", "Pikine", "Guédiawaye", "Rufisque", "Bargny", "Sébikhotane", "Diamniadio", "Lac Rose",
  "Thiès", "Tivaouane", "Mbour", "Joal-Fadiouth", "Saly", "Sindia", "Popenguine", "Ngaparou",
  "Saint-Louis", "Richard-Toll", "Rosso", "Dagana", "Podor", "Matam", "Kanel", "Ourossogui",
  "Kaolack", "Kaffrine", "Kahone", "Ndoffane", "Guenie", "Malem Hodar", "Koungheul",
  "Ziguinchor", "Bignona", "Oussouye", "Cap Skirring", "Goudomp", "Sedhiou", "Marsassoum",
  "Tambacounda", "Kedougou", "Kolda", "Velinguara", "Medina Yoro Foulah", "Dabo",
  "Louga", "Linguere", "Kebemer", "Dara",
  "Fatick", "Foundiougne", "Gossas", "Dioffior",
  "Diourbel", "Bambey", "Mbacke", "Touba",
  "Kedougou", "Salemata", "Bandafassi", "Nindefa",
  "Sedhiou", "Goudomp", "Marsassoum",
];

export type SignupVariant = "decouverte" | "premium";

/**
 * Inscription du directeur : école + compte + abonnement activé immédiatement
 * (migration 00033), puis accès direct au tableau de bord.
 *
 * Deux variantes, pour un même formulaire :
 *  - « decouverte » (par défaut) : plan gratuit, l'école démarre sur UN SEUL
 *    cycle (radio). L'upgrade vers Premium se fait ensuite depuis l'onglet
 *    Abonnement du tableau de bord ;
 *  - « premium » (page /inscription/premium, bouton Premium de la page tarifs) :
 *    plan Premium, MULTIPLES cycles (cases à cocher, aucune restriction), limite
 *    portée à 600 élèves et abonnement accordé pour un an (pas de passerelle
 *    de paiement à ce jour).
 */
export function DirectorSignupForm({ variant = "decouverte" }: { variant?: SignupVariant }) {
  const premium = variant === "premium";
  const { registerDirector } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  // Plan découverte : un seul cycle (radio, préselectionné) ; Premium :
  // sélection libre d'un ou plusieurs cycles (aucune restriction).
  const [cycle, setCycle] = useState<Cycle>("elementaire");
  const [cycles, setCycles] = useState<Cycle[]>(premium ? [] : ["elementaire"]);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", schoolName: "", city: "Dakar", address: "", password: "", confirm: "" });
  const [terms, setTerms] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = {
    firstName: form.firstName.trim().length < 2 ? "Le prénom est obligatoire." : null,
    lastName: form.lastName.trim().length < 2 ? "Le nom est obligatoire." : null,
    email: !isValidEmail(form.email) ? "Saisissez une adresse e-mail valide." : null,
    phone: !isValidSnPhone(form.phone) ? "Format attendu : 77 123 45 67." : null,
    schoolName: form.schoolName.trim().length < 3 ? "Indiquez le nom de votre école." : null,
    city: form.city.trim().length < 2 ? "Indiquez la ville." : null,
    address: form.address.trim().length < 3 ? "Indiquez l'adresse de l'école." : null,
    password: passwordError(form.password, form.confirm),
    confirm: form.confirm !== form.password ? "Les mots de passe ne correspondent pas." : null,
    cycle: premium && cycles.length === 0 ? "Sélectionnez au moins un cycle." : null,
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
      // Payload explicite : sans "confirm" (le mot de passe de confirmation
      // n'a pas à voyager jusqu'à l'API). La variante Premium transmet la
      // formule « premium » : la RPC finish_director_registration active
      // l'abonnement immédiatement pour un an (migration 00035) et la
      // validation backend accepte toujours 1 à 3 cycles.
      await registerDirector({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        schoolName: form.schoolName,
        city: form.city,
        address: form.address,
        password: form.password,
        plan: premium ? "premium" : "essentiel",
        cycles: premium ? cycles : [cycle],
      });
      toast(premium ? "Compte Premium créé. Bienvenue sur Classora !" : "Compte créé. Bienvenue sur Classora !");
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création du compte impossible.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Inscription du directeur">
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
        <Input label="Nom de l'école" required icon="school" placeholder="Ex. Groupe Scolaire Les Baobabs" value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value })} onBlur={() => touch("schoolName")} error={show("schoolName")} />
        <Select label="Ville" required options={SENEGAL_CITIES.map((c) => ({ value: c, label: c }))} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} onBlur={() => touch("city")} error={show("city")} />
        <Input label="Adresse de l'école" required icon="location_on" placeholder="Ex. Quartier, rue, numéro" hint="Quartier, rue et numéro : cette adresse aide les parents à vous localiser." value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} onBlur={() => touch("address")} error={show("address")} />
        <Input label="Adresse e-mail" type="email" required autoComplete="email" placeholder="vous@ecole.sn" hint="Cette adresse sera votre identifiant de connexion." value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} onBlur={() => touch("email")} error={show("email")} />
        <Input label="Téléphone" type="tel" required placeholder="77 123 45 67" autoComplete="tel" hint="Numéro sénégalais à 9 chiffres." value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} onBlur={() => touch("phone")} error={show("phone")} />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Cycle{premium ? "s" : ""} de votre école</legend>
        <p className="text-xs text-neutral-600 mb-3">
          {premium
            ? "Sur le plan Premium, sélectionnez un ou plusieurs cycles — aucune restriction."
            : "Sur le plan Découverte (gratuit), votre école démarre sur un seul cycle. Vous pourrez en ajouter d’autres depuis votre tableau de bord."}
        </p>
        {show("cycle") && (
          <p role="alert" className="mb-2 text-xs font-medium text-danger">
            {show("cycle")}
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-3">
          {CYCLES.map((c) => {
            const selected = premium ? cycles.includes(c) : cycle === c;
            return (
              <label key={c} className={cn("flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition-colors", selected ? "border-forest bg-lime text-forest" : "border-neutral-200 text-neutral-700 hover:border-forest/40")}>
                <input
                  type={premium ? "checkbox" : "radio"}
                  name="cycle"
                  className="sr-only"
                  checked={selected}
                  onChange={() => (premium ? setCycles((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c])) : setCycle(c))}
                  aria-label={CYCLE_LABELS[c]}
                />
                {premium && <Icon name={selected ? "check_box" : "check_box_outline_blank"} className="shrink-0 text-[20px] text-forest" />}
                {CYCLE_LABELS[c]}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="grid gap-4">
        {premium ? (
          <div className="flex items-center gap-3 rounded-2xl bg-lime p-4">
            <div className="shrink-0">
              <Icon name="workspace_premium" className="text-[22px] text-forest" />
            </div>
            <div className="text-sm min-w-0">
              <p className="font-bold text-forest">Plan Premium — élèves illimités</p>
              <p className="text-neutral-600">
                Tous les modules débloqués : emploi du temps, comptes du personnel, exports et accompagnement dédié. Votre abonnement Premium est activé immédiatement pour un an.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl bg-lime-soft p-4">
            <div className="shrink-0">
              <Icon name="workspace_premium" className="text-[22px] text-forest" />
            </div>
            <div className="text-sm min-w-0">
              <p className="font-bold text-forest">Plan Découverte — gratuit</p>
              <p className="text-neutral-600">
                Votre école démarre gratuitement, avec les fonctionnalités essentielles. Vous pourrez passer à Premium depuis l'onglet Abonnement de votre tableau de bord.
              </p>
            </div>
          </div>
        )}
        <PasswordField value={form.password} placeholder="••••••••" onChange={(v) => setForm({ ...form, password: v })} error={show("password")} />
        <PasswordField label="Confirmer" showStrength={false} hint="Ressaisissez le même mot de passe." placeholder="••••••••" value={form.confirm} onChange={(v) => setForm({ ...form, confirm: v })} error={show("confirm")} />
      </div>
      <LegalConsent checked={terms} onChange={setTerms} error={show("terms")} />
      <Button type="submit" size="lg" variant="dark" className="w-full" loading={busy} disabled={busy}>
        {premium ? "Créer mon école Premium" : "Créer mon école sur Classora"}
      </Button>
    </form>
  );
}