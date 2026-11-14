/**
 * API SCOLIA — point d'entrée.
 *
 * Rôle : remplacer les Edge Functions Deno lorsque le backend est hébergé
 *   sur Render. Supabase reste les données (PostgreSQL + RLS) et l'Auth
 *   (mots de passe de connexion) : cette API n'accède aux données qu'avec
 *   le service_role, pour la logique privilégiée (inscriptions, gestion du
 *   personnel) ;
 *
 *   - routes publiques : verify-matricule, register-* (rate limité par IP) ;
 *   - routes authentifiées : login-guard, staff-* (JWT vérifié auprès de
 *     Supabase Auth).
 *
 *   NB : les routes de paiement (start-subscription,
 *   pay-installment, payment-webhook) sont retirées pour l'instant —
 *   elles seront réintroduites plus tard.
 */

// Doit rester le premier import : charge .env.local / .env avant config.js.
import "./env.js";
import express from "express";

import { PORT, SERVICE_KEY, SUPABASE_URL } from "./config.js";
import { corsMiddleware } from "./lib/http.js";
import loginGuard from "./routes/loginGuard.js";
import verifyMatricule from "./routes/verifyMatricule.js";
import registerDirector from "./routes/registerDirector.js";
import registerStudent from "./routes/registerStudent.js";
import registerParent from "./routes/registerParent.js";
import registerEnrolledStudent from "./routes/register-enrolled-student.js";
import createStaffAccount from "./routes/createStaffAccount.js";
import updateStaff from "./routes/updateStaff.js";
import resetStaffPassword from "./routes/resetStaffPassword.js";
import setStaffActive from "./routes/setStaffActive.js";
import deleteStaffAccount from "./routes/delete-staff-account.js";
import timetables from "./routes/timetables.js";
import adminAuth from "./routes/adminAuth.js";
import adminLogin from "./routes/adminLogin.js";
import adminMfa from "./routes/adminMfa.js";
import adminAgents from "./routes/adminAgents.js";
import adminSchools from "./routes/adminSchools.js";
import adminStats from "./routes/adminStats.js";
import adminSubscriptions from "./routes/adminSubscriptions.js";
import adminFinances from "./routes/adminFinances.js";
import adminAnalytics from "./routes/adminAnalytics.js";
import adminAudit from "./routes/adminAudit.js";
import adminSecurity from "./routes/adminSecurity.js";
import adminSettings from "./routes/adminSettings.js";
import platformStatus from "./routes/platformStatus.js";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.warn(
    "[scolia-api] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absents : " +
      "les routes admin et privilégiées répondront 503. Renseignez .env.local (local) " +
      "ou les variables du Web Service (Render).",
  );
}

// Render ajoute EXACTEMENT un hop de proxy de confiance. Avec `trust proxy:
// true`, Express accepterait TOUTE la chaîne X-Forwarded-For, y compris une
// entrée falsifiée par le client (req.ip = maillon le plus à gauche), ce qui
// annulerait tout le rate limiting par IP. On fait donc confiance à un seul
// hop ; clientIp() (lib/rateLimit.js) dérive du DERNIER maillon XFF.
if (process.env.NODE_ENV === "production" && !process.env.FRONTEND_ORIGIN) {
  console.warn(
    "[scolia-api] FRONTEND_ORIGIN absente en production : démarrage refusé (CORS fail-closed).",
  );
  process.exit(1);
}

const app = express();

// Rejets déguisés en réponses 400 { error } (jamais d'HTML d'erreur Express).
app.disable("x-powered-by");
// Render ajoute EXACTEMENT un hop de proxy de confiance : on ignore le reste
// de la chaîne X-Forwarded-For (falsifiable) via `trust proxy: 1`, et
// lib/rateLimit.js dérive l'IP du dernier maillon / du socket.
app.set("trust proxy", 1);

// CORS AVANT le parseur JSON : un corps invalide doit aussi renvoyer les
// en-têtes CORS, sinon le front sur une autre origine ne peut pas lire le
// message d'erreur.
app.use(corsMiddleware);

// Corps JSON limité.
app.use(express.json({ limit: "64kb" }));

// Parseur JSON défaillant ou corps absent → même enveloppe 400 que le front.
app.use((err, _req, res, next) => {
  if (err?.type === "entity.parse.failed" || err?.type === "entity.too.large") {
    return res.status(400).json({ error: "Requête invalide." });
  }
  return next(err);
});

// Durcissement des réponses (l'API ne sert que du JSON). HSTS : le site est
// en HTTPS sur Render ; X-Frame-Options : l'API ne doit jamais être en
// iframe ; no-store sur tout ce qui est authentifié ou admin.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  res.setHeader("X-Frame-Options", "DENY");
  // Content-Security-Policy restrictive : l'API ne sert que du JSON, aucun
  // script n'est exécuté côté client depuis cette origine.
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none';");
  // Routes authentifiées/admin : jamais en cache (plateforme, proxies, navigateur).
  if (req.path.startsWith("/admin") || req.path === "/login-guard") {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});

// Sonde Render (keep-alive / déploiement) et état de configuration.
// Route : GET /healthz — indique si l'API et la configuration Supabase sont prêtes.
app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "scolia-api", supabaseConfigured: Boolean(SUPABASE_URL && SERVICE_KEY) });
});

// Routes 1-à-1 avec les anciennes Edge Functions (contrat inchangé). Les
// méthodes non admises sont rejetées PAR LE HANDLER (405 { error }), comme
// dans les Deno : app.all garantit ce comportement pour toute méthode.
app.all("/login-guard", loginGuard);
app.all("/verify-matricule", verifyMatricule);
app.all("/register-director", registerDirector);
app.all("/register-student", registerStudent);
app.all("/register-parent", registerParent);
app.all("/register-enrolled-student", registerEnrolledStudent);
app.all("/create-staff-account", createStaffAccount);
app.all("/update-staff", updateStaff);
app.all("/reset-staff-password", resetStaffPassword);
app.all("/set-staff-active", setStaffActive);
app.all("/delete-staff-account", deleteStaffAccount);

// Routes de gestion d'emploi du temps — SÉCURISÉES : JWT vérifié + rôle +
// school_id du profil jamais du client + validations + rate limit
// (voir routes/timetables.js — vagues 1 de l'audit). Les ids sont des UUID.
app.all("/api/timetables", timetables);
app.all("/api/timetables/:id", timetables);
app.all("/api/timetables/:id/publish", timetables);
app.all("/api/timetables/:id/unpublish", timetables);
app.all("/api/timetables/:id/slots", timetables);
app.all("/api/timetables/:id/slots/:slotId", timetables);

// Routes administratives Classora (protégées, service_role côté serveur).
// Une configuration absente provoquerait un 500 opaque : on répond un 503
// explicite, affiché tel quel par la page de connexion admin.
const adminConfigGuard = (_req, res, next) => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(503).json({
      error:
        "Service d'administration non configuré : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont absents côté serveur.",
    });
  }
  return next();
};

app.all("/admin/auth", adminConfigGuard, adminAuth);
app.all("/admin/login", adminConfigGuard, adminLogin);
app.all("/admin/agents", adminConfigGuard, adminAgents);
app.all("/admin/schools", adminConfigGuard, adminSchools);
app.all("/admin/stats", adminConfigGuard, adminStats);
app.all("/admin/subscriptions", adminConfigGuard, adminSubscriptions);
app.all("/admin/finances", adminConfigGuard, adminFinances);
app.all("/admin/analytics", adminConfigGuard, adminAnalytics);
app.all("/admin/audit", adminConfigGuard, adminAudit);
app.all("/admin/security", adminConfigGuard, adminSecurity);
app.all("/admin/settings", adminConfigGuard, adminSettings);

// MFA / TOTP console d'administration (protégé par adminConfigGuard).
// Chaque route est enregistre individuellement car Express ne supporte pas
// le joker '*' dans app.all sur cette version.
app.all("/admin/mfa/status", adminConfigGuard, adminMfa);
app.all("/admin/mfa/setup", adminConfigGuard, adminMfa);
app.all("/admin/mfa/verify-setup", adminConfigGuard, adminMfa);
app.all("/admin/mfa/verify", adminConfigGuard, adminMfa);
app.all("/admin/mfa/disable", adminConfigGuard, adminMfa);

// État public (bandeau maintenance, inscription ouverte), sans authentification.
app.all("/platform-status", platformStatus);

// Chemins inconnus : JSON 404 cohérent avec l'enveloppe { error } (l'HTML
// par défaut d'Express fuirait la stack).
app.use((_req, res) => {
  res.status(404).json({ error: "Ressource introuvable." });
});

// Dernière barrière : enveloppe { error } même sur une exception imprévue.
app.use((err, _req, res, _next) => {
  // Log sanitisé : on ne consigne que le message, jamais l'objet d'erreur
  // complet (évite de fuiter des fragments de requête ou du schéma dans les logs).
  console.error("[api] erreur non gérée :", err?.message ?? String(err));
  if (res.headersSent) return; // réponse déjà partielle : ne pas relancer ERR_HTTP_HEADERS_SENT
  res.status(500).json({ error: "Une erreur inattendue est survenue. Réessayez dans un instant." });
});

app.listen(PORT, () => {
  console.log(`[scolia-api] en écoute sur :${PORT}`);
});
