// Page pour demander un lien de réinitialisation du mot de passe.
import { AuthLayout } from "@/components/layout/AuthLayout";
import { ForgotForm } from "@/features/auth/ForgotForm";

export default function ForgotPasswordPage() {
  return (
    <AuthLayout title="Mot de passe oublié ?" subtitle="Saisissez votre e-mail, nous vous envoyons un lien de réinitialisation." showVisual={false} backgroundImage>
      <ForgotForm />
    </AuthLayout>
  );
}
