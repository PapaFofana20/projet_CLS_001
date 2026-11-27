// Formulaire de connexion (matricule d'ecole, e-mail et mot de passe).

import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useForm } from "@/hooks/useForm";
import { isValidEmail } from "@/utils/format";
import { formatMatriculeInput, isValidMatricule, MATRICULE_LENGTH } from "@/utils/matricule";

// Formulaire de connexion de l'espace ecole.
export function LoginForm() {
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({ matricule: "", email: "", password: "" }, (v) => ({
    ...(!isValidMatricule(v.matricule) ? { matricule: `Saisissez le matricule à ${MATRICULE_LENGTH} caractères de votre école.` } : {}),
    ...(!isValidEmail(v.email) ? { email: "Saisissez une adresse e-mail valide." } : {}),
    ...(v.password.length < 1 ? { password: "Saisissez votre mot de passe." } : {}),
  }));

  const doLogin = async (matricule: string, email: string, password: string) => {
    setBusy(email);
    setError(null);
    try {
      const u = await login(email, password, matricule);
      toast(`Bienvenue, ${u.firstName} !`);
      navigate("/app", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion impossible.");
      setBusy(null);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    form.touchAll();
    if (form.isValid) void doLogin(form.values.matricule, form.values.email, form.values.password);
  };

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-4 lg:space-y-2" aria-label="Formulaire de connexion">
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-2xl bg-red-50 p-4 text-sm font-medium text-danger">
            <Icon name="error" className="text-[20px]" />
            {error}
          </div>
        )}
        <Input
          label="Matricule de l'école"
          required
          icon="key"
          inputMode="text"
          autoCapitalize="characters"
          spellCheck={false}
          autoComplete="off"
          placeholder="X7K9Q"
          maxLength={MATRICULE_LENGTH + 3}
          {...form.field("matricule")}
          onChange={(e) => form.set("matricule", formatMatriculeInput(e.target.value))}
        />
        <Input label="Adresse e-mail" type="email" icon="mail" autoComplete="email" placeholder="vous@ecole.sn" required {...form.field("email")} />
        <div className="relative">
          <Input label="Mot de passe" type={show ? "text" : "password"} icon="lock" autoComplete="current-password" placeholder="••••••••" required {...form.field("password")} />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"} className="absolute right-1 top-[29px] grid size-11 place-items-center rounded-full text-forest/70 hover:bg-mist">
            <Icon name={show ? "visibility_off" : "visibility"} className="text-[20px]" />
          </button>
        </div>
        <div className="flex justify-end">
          <Link to="/mot-de-passe-oublie" className="inline-flex min-h-11 items-center text-sm font-semibold text-forest underline-offset-4 hover:underline lg:min-h-9">
            Mot de passe oublié ?
          </Link>
        </div>
        <Button type="submit" size="lg" variant="dark" className="w-full" loading={busy !== null && busy === form.values.email} disabled={busy !== null}>
          Se connecter
        </Button>
        <p className="text-center text-sm text-neutral-600">
          Pas encore de compte ?{" "}
          <Link to="/inscription" className="font-bold text-forest underline-offset-4 hover:underline">
            Créer un compte
          </Link>
        </p>
      </form>
    </>
  );
}
