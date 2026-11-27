// Page de connexion à l'espace Classora.
import { AuthLayout } from "@/components/layout/AuthLayout";
import { LoginForm } from "@/features/auth/LoginForm";

export default function LoginPage() {
  return (
    <AuthLayout title={<>Bon retour, connectez-vous</>} subtitle="Accédez à votre espace Classora : école, classes, notes et paiements." showVisual={false} backgroundImage compact>
      <LoginForm />
    </AuthLayout>
  );
}
