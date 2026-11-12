// Racine de l'application : fournisseurs de contexte et toutes les routes.
import { lazy, type ReactElement, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { SuspenseOutlet } from "@/components/ui/PageSuspense";
import { AuthProvider } from "@/context/AuthContext";
import { AdminAuthProvider } from "@/context/AdminAuthContext";
import { PlatformProvider } from "@/context/PlatformContext";
import { SchoolProvider } from "@/context/SchoolContext";
import { ToastProvider } from "@/context/ToastContext";
import { MustChangePasswordGuard, ProtectedRoute, PublicOnlyRoute, RoleRoute, ScrollToTop, SubscriptionGuard } from "@/routes/guards";
import { AdminProtectedRoute, adminGuard } from "@/routes/adminGuards";
import { ROUTE_ROLES } from "@/routes/navigation";
import { SplashScreen } from "@/components/SplashScreen";
import HomePage from "@/pages/public/HomePage";

const FeaturesPage = lazy(() => import("@/pages/public/FeaturesPage"));
const PricingPage = lazy(() => import("@/pages/public/PricingPage"));
const SchoolsPage = lazy(() => import("@/pages/public/SchoolsPage"));
const AboutPage = lazy(() => import("@/pages/public/AboutPage"));
const ContactPage = lazy(() => import("@/pages/public/ContactPage"));
const TermsPage = lazy(() => import("@/pages/public/TermsPage"));
const PrivacyPage = lazy(() => import("@/pages/public/PrivacyPage"));
const NotFoundPage = lazy(() => import("@/pages/public/NotFoundPage"));
const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/auth/RegisterPage"));
const PremiumRegisterPage = lazy(() => import("@/pages/auth/PremiumRegisterPage"));
const SignupSentPage = lazy(() => import("@/pages/auth/SignupSentPage"));
const ForgotPasswordPage = lazy(() => import("@/pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("@/pages/auth/ResetPasswordPage"));
const ChangePasswordPage = lazy(() => import("@/pages/auth/ChangePasswordPage"));
const AdminLoginPage = lazy(() => import("@/pages/auth/AdminLoginPage"));
const DashboardPage = lazy(() => import("@/pages/app/DashboardPage"));
const StudentsPage = lazy(() => import("@/pages/app/StudentsPage"));
const StudentDetailPage = lazy(() => import("@/pages/app/StudentDetailPage"));
const PendingStudentsPage = lazy(() => import("@/pages/app/PendingStudentsPage"));
const StudentEnrollmentPage = lazy(() => import("@/pages/app/StudentEnrollmentPage"));
const ClassesPage = lazy(() => import("@/pages/app/ClassesPage"));
const StaffPage = lazy(() => import("@/pages/app/StaffPage"));
const AssignmentsPage = lazy(() => import("@/pages/app/AssignmentsPage"));
const NotesPage = lazy(() => import("@/pages/app/NotesPage"));
const AttendancesPage = lazy(() => import("@/pages/app/AttendancesPage"));
const BulletinsPage = lazy(() => import("@/pages/app/BulletinsPage"));
const PaymentsPage = lazy(() => import("@/pages/app/PaymentsPage"));
const SettingsPage = lazy(() => import("@/pages/app/SettingsPage"));
const SubscriptionPage = lazy(() => import("@/pages/app/SubscriptionPage"));
const TimetableViewPage = lazy(() => import("@/features/timetables/TimetableViewPage"));
const TimetableCreationPage = lazy(() => import("@/features/timetables/TimetableCreationPage"));
const AdminDashboardPage = lazy(() => import("@/pages/app/AdminDashboardPage"));
const AdminSchoolsPage = lazy(() => import("@/pages/app/AdminSchoolsPage"));
const AdminSchoolDetailPage = lazy(() => import("@/pages/app/AdminSchoolDetailPage"));
const AdminAgentsPage = lazy(() => import("@/pages/app/AdminAgentsPage"));
const AdminSubscriptionsPage = lazy(() => import("@/pages/app/AdminSubscriptionsPage"));
const AdminFinancesPage = lazy(() => import("@/pages/app/AdminFinancesPage"));
const AdminAnalyticsPage = lazy(() => import("@/pages/app/AdminAnalyticsPage"));
const AdminAuditPage = lazy(() => import("@/pages/app/AdminAuditPage"));
const AdminSecurityPage = lazy(() => import("@/pages/app/AdminSecurityPage"));
const AdminSettingsPage = lazy(() => import("@/pages/app/AdminSettingsPage"));

/** Wrapper : authentification scolaire (SchoolProvider). Ne s'applique qu'à /app/*. */
function SchoolAuthWrapper() {
  return (
    <SchoolProvider>
      <SuspenseOutlet />
    </SchoolProvider>
  );
}

/** Wrapper : authentification administrative (AdminAuthProvider). Ne s'applique qu'à /admin/*. */
function AdminAuthWrapper() {
  return (
    <AdminAuthProvider>
      <SuspenseOutlet />
    </AdminAuthProvider>
  );
}

const guard = (roles: keyof typeof ROUTE_ROLES, element: ReactElement) => <RoleRoute roles={ROUTE_ROLES[roles]}>{element}</RoleRoute>;

/** Wrapper pour la page d'accueil : splash screen à CHAQUE visite (forceShow) */
function HomePageWithSplash() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <>
      <SplashScreen
        onComplete={() => setSplashDone(true)}
        forceShow={true}
        storageKey="classora-home-splash"
      />
      {splashDone && <HomePage />}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        {/* AuthProvider enveloppe TOUTES les routes (comme dans le code original),
            afin que useAuth() fonctionne partout (PublicOnlyRoute, ProtectedRoute, etc.). */}
        <AuthProvider>
          <PlatformProvider>
            <ScrollToTop />
            {/* Pas de Suspense global autour de <Routes> : il remplaçait
                toute l'application (layouts compris) par des skeletons
                pendant le chargement du chunk d'une page. Chaque layout
                et chaque wrapper ci-dessous a désormais son propre
                Suspense local autour de son <Outlet /> (PageSuspense). */}
              <Routes>
            {/* PARTIE 1 : site public */}
            <Route element={<PublicLayout />}>
              <Route index element={<HomePageWithSplash />} />
              <Route path="fonctionnalites" element={<FeaturesPage />} />
              <Route path="tarifs" element={<PricingPage />} />
              <Route path="ecoles" element={<SchoolsPage />} />
              <Route path="a-propos" element={<AboutPage />} />
              <Route path="contact" element={<ContactPage />} />
              <Route path="cgu" element={<TermsPage />} />
              <Route path="confidentialite" element={<PrivacyPage />} />
              {/* 404 réelle (contenu + noindex) au lieu d'une redirection vers
                  l'accueil, qui fabriquait des « soft 404 ». */}
              <Route path="*" element={<NotFoundPage />} />
            </Route>

            {/* PARTIE 2 : authentification scolaire (pas de session requise)} */}
            <Route element={<SuspenseOutlet />}>
            <Route element={<PublicOnlyRoute />}>
              <Route path="connexion" element={<LoginPage />} />
              <Route path="inscription" element={<RegisterPage />} />
              <Route path="inscription/premium" element={<PremiumRegisterPage />} />
              <Route path="inscription-envoyee" element={<SignupSentPage />} />
              <Route path="mot-de-passe-oublie" element={<ForgotPasswordPage />} />
            </Route>
            </Route>

            <Route element={<SuspenseOutlet />}>
              <Route path="reinitialiser-mot-de-passe" element={<ResetPasswordPage />} />
            </Route>

            {/* PARTIE 3 : authentification administrative (isolée de l'auth scolaire) */}
            <Route path="admin" element={<AdminAuthWrapper />}>
              <Route path="connexion" element={<AdminLoginPage />} />
              {/* Garde réellement branchée : sans elle, /admin affichait une page vide
                  au lieu de rediriger vers /admin/connexion. */}
              <Route element={<AdminProtectedRoute />}>
                <Route element={<AdminLayout />}>
                  <Route index element={adminGuard("dashboard", <AdminDashboardPage />)} />
                  <Route path="ecoles" element={adminGuard("ecoles", <AdminSchoolsPage />)} />
                  <Route path="ecoles/:id" element={adminGuard("ecoles", <AdminSchoolDetailPage />)} />
                  <Route path="agents" element={adminGuard("agents", <AdminAgentsPage />)} />
                  <Route path="abonnements" element={adminGuard("abonnements", <AdminSubscriptionsPage />)} />
                  <Route path="abonnements/offres" element={adminGuard("abonnements", <AdminSubscriptionsPage />)} />
                  <Route path="finances" element={adminGuard("finances", <AdminFinancesPage />)} />
                  <Route path="finances/transactions" element={adminGuard("finances", <AdminFinancesPage />)} />
                  <Route path="finances/factures" element={adminGuard("finances", <AdminFinancesPage />)} />
                  <Route path="analyses" element={adminGuard("analyses", <AdminAnalyticsPage />)} />
                  <Route path="supervision/audit" element={adminGuard("audit", <AdminAuditPage />)} />
                  <Route path="supervision/securite" element={adminGuard("securite", <AdminSecurityPage />)} />
                  <Route path="parametres" element={adminGuard("parametres", <AdminSettingsPage />)} />
                  <Route path="*" element={<Navigate to="/admin" replace />} />
                </Route>
              </Route>
            </Route>

            {/* PARTIE 4 : tableau de bord scolaire protégé */}
            <Route path="app" element={<SchoolAuthWrapper />}>
              <Route element={<ProtectedRoute />}>
                <Route element={<MustChangePasswordGuard />}>
                  <Route path="mot-de-passe-temporaire" element={<ChangePasswordPage />} />
                  {/* Verrou d'abonnement (écoles bloquées/sans abonnement) :
                      il était défini mais jamais monté — les écrans dédiés
                      de SubscriptionScreens étaient du code mort. */}
                  <Route element={<SubscriptionGuard />}>
                  <Route path="" element={<DashboardLayout />}>
                      <Route index element={<DashboardPage />} />
                      <Route path="eleves" element={guard("eleves", <StudentsPage />)} />
                      <Route path="eleves/demandes" element={guard("demandes", <PendingStudentsPage />)} />
                      <Route path="eleves/:id" element={guard("eleve", <StudentDetailPage />)} />
                      <Route path="inscription-eleve" element={guard("inscription", <StudentEnrollmentPage />)} />
                      <Route path="classes" element={guard("classes", <ClassesPage />)} />
                      <Route path="enseignants" element={guard("enseignants", <StaffPage />)} />
                      <Route path="affectations" element={guard("affectations", <AssignmentsPage />)} />
                      <Route path="abonnement" element={guard("abonnement", <SubscriptionPage />)} />
                      <Route path="notes" element={guard("notes", <NotesPage />)} />
                      <Route path="presences" element={guard("presences", <AttendancesPage />)} />
                      <Route path="bulletins" element={guard("bulletins", <BulletinsPage />)} />
                      <Route path="paiements" element={guard("paiements", <PaymentsPage />)} />


                      <Route path="parametres" element={guard("parametres", <SettingsPage />)} />
                      <Route path="timetables" element={guard("timetables", <TimetableViewPage />)} />
                      <Route path="timetables/nouveau" element={guard("timetable_creation", <TimetableCreationPage />)} />
                      <Route path="timetables/:id" element={guard("timetables", <TimetableViewPage />)} />
                      <Route path="*" element={<Navigate to="/app" replace />} />
                    </Route>
                  </Route>
                </Route>
                </Route>
            </Route>
            {/* Le 404 racine est géré dans PublicLayout (catch-all ci-dessus). */}
            </Routes>
          </PlatformProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}