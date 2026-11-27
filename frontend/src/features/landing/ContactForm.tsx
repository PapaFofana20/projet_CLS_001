// Formulaire de contact public (envoi d'un message a l'equipe).

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/context/ToastContext";
import { subjectsContact } from "@/data/pages";
import { useForm } from "@/hooks/useForm";
import { sendContactMessage } from "@/services/contactService";
import { isValidEmail, isValidSnPhone } from "@/utils/format";

const initial = { name: "", email: "", phone: "", school: "", subject: subjectsContact[0], message: "" };

// Valide le message, l'envoie, puis propose d'en ecrire un autre.
export function ContactForm() {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const form = useForm(initial, (v) => ({
    ...(v.name.trim().length < 3 ? { name: "Saisissez votre nom complet (3 caractères minimum)." } : {}),
    ...(!isValidEmail(v.email) ? { email: "Saisissez une adresse e-mail valide." } : {}),
    ...(v.phone && !isValidSnPhone(v.phone) ? { phone: "Format attendu : 77 123 45 67." } : {}),
    ...(v.message.trim().length < 10 ? { message: "Votre message doit contenir au moins 10 caractères." } : {}),
  }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Garde anti-double-clic : un second submit pendant l'envoi est ignoré.
    if (sending) return;
    form.touchAll();
    if (!form.isValid) return;
    setSending(true);
    try {
      await sendContactMessage(form.values);
      toast("Message envoyé. Nous vous répondons sous 24 heures.");
      setSent(true);
      form.reset();
    } catch {
      toast("L'envoi a échoué. Veuillez réessayer.", "error");
    } finally {
      setSending(false);
    }
  };

  if (sent)
    return (
      <div className="rounded-3xl bg-lime-soft p-10 text-center" role="status">
        <h2 className="text-2xl font-extrabold text-forest">Merci pour votre message !</h2>
        <p className="mt-2 text-neutral-700">Notre équipe vous recontacte très rapidement.</p>
        <Button className="mt-6" variant="dark" onClick={() => setSent(false)}>
          Envoyer un autre message
        </Button>
      </div>
    );

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 rounded-3xl bg-mist p-6 sm:grid-cols-2 sm:p-8" aria-label="Formulaire de contact">
      <Input label="Nom complet" required autoComplete="name" {...form.field("name")} />
      <Input label="E-mail" type="email" required autoComplete="email" {...form.field("email")} />
      <Input label="Téléphone" type="tel" placeholder="77 123 45 67" autoComplete="tel" {...form.field("phone")} />
      <Input label="École" placeholder="Nom de votre établissement" {...form.field("school")} />
      <Select className="sm:col-span-2" label="Sujet" options={subjectsContact.map((s) => ({ value: s, label: s }))} {...form.field("subject")} />
      <Textarea className="sm:col-span-2" label="Message" required placeholder="Décrivez votre besoin…" {...form.field("message")} />
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" variant="dark" loading={sending} disabled={sending} icon="send">
          {sending ? "Envoi en cours…" : "Envoyer le message"}
        </Button>
      </div>
    </form>
  );
}
