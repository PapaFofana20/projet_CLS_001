// Page pour définir un nouveau mot de passe après réinitialisation.
import { AuthLayout } from "@/components/layout/AuthLayout";
import { ResetPasswordForm } from "@/features/auth/ResetPasswordForm";
import { usePageMeta } from "@/hooks/usePageMeta";

// Composant principal de la page.
export default function ResetPasswordPage() {
  usePageMeta({ title: "Nouveau mot de passe", noindex: true });
  return (
    <AuthLayout title="Nouveau mot de passe" subtitle="Définissez un nouveau mot de passe pour accéder à votre compte." showVisual={false} backgroundImage>
      <ResetPasswordForm />
    </AuthLayout>
  );
}
