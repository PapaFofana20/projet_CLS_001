// Demande de reinitialisation du mot de passe par e-mail.

import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, LinkButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/context/ToastContext";
import { useForm } from "@/hooks/useForm";
import { requestPasswordReset } from "@/services/authService";
import { isValidEmail } from "@/utils/format";

// Envoie le lien de reinitialisation, puis affiche un ecran de confirmation.
export function ForgotForm() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const form = useForm({ email: "" }, (v) => (!isValidEmail(v.email) ? { email: "Saisissez une adresse e-mail valide." } : {}));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    form.touchAll();
    if (!form.isValid) return;
    setBusy(true);
    try {
      await requestPasswordReset(form.values.email);
      setSent(true);
      toast("Lien de réinitialisation envoyé.");
    } catch {
      toast("Envoi impossible. Veuillez réessayer.", "error");
    } finally {
      setBusy(false);
    }
  };

  if (sent)
    return (
      <div role="status" className="rounded-3xl bg-lime-soft p-8 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-forest text-lime">
          <Icon name="mark_email_read" fill className="text-[28px]" />
        </span>
        <h2 className="mt-4 text-xl font-bold">Vérifiez votre boîte mail.</h2>
        <p className="mt-2 text-sm text-neutral-700">
          Si un compte existe pour <strong>{form.values.email}</strong>, vous recevrez un lien pour choisir un nouveau mot de passe.
        </p>
        <LinkButton to="/connexion" variant="dark" className="mt-6">
          Retour à la connexion
        </LinkButton>
      </div>
    );

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Mot de passe oublié">
      <Input label="Adresse e-mail" type="email" icon="mail" required autoComplete="email" placeholder="vous@exemple.sn" {...form.field("email")} />
      <Button type="submit" size="lg" variant="dark" className="w-full" loading={busy}>
        Envoyer le lien
      </Button>
      <p className="text-center text-sm">
        <Link to="/connexion" className="font-bold text-forest underline-offset-4 hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </form>
  );
}
