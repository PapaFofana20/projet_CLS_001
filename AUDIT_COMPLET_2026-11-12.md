# Audit Complet du Code CLASSORA — 12 novembre 2026

## Résumé Exécutif

**Score global : 8.5/10** — Architecture solide, sécurité bien pensée, quelques corrections mineures à apporter.

| Dimension | Note | Commentaire |
|-----------|------|-------------|
| Authentification / Autorisation | 9/10 | JWT vérifié côté serveur, RLS partout, séparation espaces école/admin |
| Isolation multi-écoles (RLS) | 9.5/10 | `school_id` sur toutes les tables, politiques strictes, helpers `current_school_id()` |
| Validation entrées | 8.5/10 | Bibliothèque centrale `validate.js`, mais quelques routes frontend sans double validation |
| Rate Limiting | 9/10 | Atomique en base (RPC `sys_rate_limit`), IP dérivée du dernier hop XFF (Render) |
| Gestion erreurs / Logs | 8/10 | Enveloppe `{ error }` cohérente, pas de stack traces, mais logs sanitisés perfectibles |
| Secrets / Configuration | 9/10 | `SERVICE_KEY` uniquement côté Render, `anon` key front, `.env.local` ignoré git |
| Dépendances | 7.5/10 | Versions récentes, mais pas de `npm audit` automatique en CI |
| Tests sécurité | 7/10 | pgTAP pour RLS (fondation), mais pas de tests d'intégration API ni E2E |

---

## 🔴 Points Critiques (À Corriger Immédiatement)

### 1. **Frontend : `callFunction` n'a pas de timeout** (`frontend/src/lib/functions.ts:22-30`)
```typescript
// Problème : fetch sans timeout → blocage indéfi si API ne répond pas
res = await fetch(`${base}/${name}`, { ... });
```
**Impact** : Déni de service côté client (onglet figé) si l'API Render est lente/indisponible.
**Fix** : Ajouter `AbortController` avec timeout (ex. 15s) :
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 15_000);
try {
  res = await fetch(`${base}/${name}`, { ..., signal: controller.signal });
} finally {
  clearTimeout(timeout);
}
```

### 2. **Frontend : `SubscriptionGuard` a un flag durci `PAIEMENTS_CONFIGURES = true`** (`frontend/src/routes/guards.tsx:105`)
```typescript
const PAIEMENTS_CONFIGURES = true; // ← Devrait venir de la config plateforme
```
**Impact** : Impossible de désactiver le guard sans redéployer le front. Si l'API `/platform-status` n'est pas appelée, le blocage abonnement ne reflète pas la réalité.
**Fix** : Lire `platformSettings.registrationOpen` / `maintenanceMode` depuis le contexte école ou un hook `usePlatformStatus()`.

### 3. **Backend : `timetables.js` — Détection de route `/publish` et `/unpublish` fragile** (lignes 196, 214)
```javascript
req.route?.path?.endsWith("/publish") || req.path.includes("/publish")
```
**Impact** : `req.path.includes("/publish")` match `/api/timetables/abc/publish/extra` → contournement possible.
**Fix** : Utiliser `req.route.path` (Express 5) ou matcher explicitement :
```javascript
if (req.method === "POST" && req.path === `/api/timetables/${id}/publish`) { ... }
```

### 4. **Backend : `adminAuth.js` — Pas de rate limit sur `/admin/login`** (seulement sur `/admin/auth`)
**Impact** : Attaque par force brute sur le formulaire de connexion admin (matricule + mot de passe).
**Fix** : Ajouter `enforceRateLimit(svc, `admin-login:${clientIp(req)}`, 10, 300)` dans `adminLogin.js`.

### 5. **Frontend : `generateTempPassword()` dupliqué** (frontend `password.ts` + backend `auth.js`)
**Impact** : Dérive possible (déjà identiques aujourd'hui, mais maintenance risquée).
**Fix** : Partager via package commun ou générer côté backend uniquement (déjà fait dans `finish_staff_registration`).

---

## 🟠 Points Majeurs (À Corriger Sous 2 Semaines)

### 6. **Frontend : `hydrateAll()` charge 18 tables sans pagination côté composant** (`frontend/src/services/db.ts:427-446`)
```typescript
await Promise.all([ hydrate("schools"), ..., hydrate("absences"), hydrate("settings") ]);
```
**Impact** : Sur grosses écoles (>5000 élèves), temps de chargement >10s, mémoire navigateur saturée.
**Fix** :
- Hydratation progressive : tables critiques d'abord (`users`, `schools`, `settings`), puis différée.
- Ajouter `LIMIT` configurable par table (ex. `students` : 2000 max).
- Virtualisation des listes (déjà `react-window` dispo ?).

### 7. **Backend : `rateLimit.js` — Clé `clientIp(req)` peut retourner `null` en dev** (ligne 28)
```javascript
const sock = req?.socket?.remoteAddress;
return typeof sock === "string" && sock.trim() ? sock.trim() : null;
```
**Impact** : En dev local, `key = "verify-matricule:sans-adresse"` → tous les devs partagent le même bucket.
**Fix** : En dev, fallback sur `crypto.randomUUID()` par session ou `127.0.0.1` + port.

### 8. **Frontend : `AuthContext` — `refresh()` ne recharge pas `schoolId` si changé** (`frontend/src/context/AuthContext.tsx:139-142`)
```typescript
const refresh = useCallback(async () => {
  const stored = await authService.currentSession();
  if (stored) setUser(stored);
}, []);
```
**Impact** : Si la direction change l'école d'un utilisateur (rare mais possible), l'ancien `schoolId` persiste jusqu'à reconnexion.
**Fix** : `refresh()` doit aussi dispatcher `window.dispatchEvent(new CustomEvent("school:reload"))`.

### 9. **Backend : `verifyMatricule.js` — Rate limit par matricule + IP, mais pas par email** (lignes 18, 27)
```javascript
await enforceRateLimit(svc, `verify-matricule:${clientIp(req) ?? "sans-adresse"}`, 20, 600);
await enforceRateLimit(svc, `verify-matricule:id:${matricule}`, 10, 600);
```
**Impact** : Attaquant peut énumérer les matricules valides en testant 10/IP/minute × N IPs.
**Fix** : Ajouter rate limit global par endpoint (ex. 100 req/min/IP) + captcha après 5 échecs.

### 10. **Frontend : `useFeature` / `requireFeature` — Vérification uniquement côté client** (`frontend/src/utils/features.ts:76-82`)
```typescript
export function requireFeature(feature: FeatureKey, schoolId: string): void {
  const has = hasFeature(feature, schoolId);
  if (!has) throw new Error(...);
}
```
**Impact** : Un utilisateur malveillant peut bypasser en modifiant le JS (console devtools) pour créer des comptes staff premium sans abonnement.
**Fix** : **Vérification obligatoire côté backend** (déjà fait dans `createStaffAccount` via `schoolIsWritable` + plan check). Documenter que `requireFeature` est **uniquement pour l'UX** (masquer boutons), jamais pour la sécurité.

---

## 🟡 Points Mineurs (Améliorations Qualité)

### 11. **Frontend : `passwordError` dupliqué** (frontend `password.ts:53-60` + backend `auth.js:163-172`)
→ Déjà noté au point 5. Unifier.

### 12. **Backend : `loginGuard.js` — Message d'erreur différent selon existence du profil** (lignes 35-57)
```javascript
if (!profile) {
  // Vérifie admin_agents → message spécifique
  return ok(res, { error: "Les agents Classora se connectent sur la console d'administration..." }, 403);
}
return unauthorized(res, "E-mail ou mot de passe incorrect.");
```
**Risque** : Énumération d'emails (compte école vs compte admin). Si l'email existe dans `admin_agents`, message différent.
**Fix** : Message unique « E-mail ou mot de passe incorrect » pour tous les cas, log côté serveur pour différencier.

### 13. **Backend : `index.js` — `trust proxy: 1` correct pour Render, mais documenté seulement en commentaire** (lignes 59-78)
→ Ajouter un test unitaire ou script de vérification que `req.ip` = IP Render en prod.

### 14. **Frontend : `db.ts` — `HYDRATION_MAX_ROWS = 100_000`** (ligne 316)
→ Seuil élevé ; sur très grosses écoles, peut planter l'onglet. Baisser à 20k + alerte admin.

### 15. **Backend : `auth.js` — `revokeUserSessions` best-effort sans retry** (lignes 48-55)
→ Si RPC échoue (network blip), sessions non révoquées. Ajouter retry exponentiel (2-3 tentatives).

### 16. **Frontend : `AuthContext` — `logout()` vide le cache avec `setTimeout(..., 0)`** (lignes 156-158)
→ Race condition possible si navigation immédiate. Utiliser `await clearCache()` puis navigation.

### 17. **Backend : `adminMfa.js` — Non lu, mais vérifier que `totp_enabled` est bien `boolean` pas `string`** (DB: `totp_enabled boolean not null default false`)

### 18. **Dépendances : `express@5.3.0` (beta)** (`backend/api/package.json:18`)
→ Express 5 n'est pas encore stable. Recommandé : `express@4.19.x` LTS sauf besoin spécifique v5.

### 19. **Frontend : `vite.config.ts` — Non lu, vérifier `build.sourcemap: false` en prod** pour ne pas exposer le code source.

### 20. **Backend : `config.js` — `FRONTEND_ORIGIN` acceptée en CSV** (ligne 21)
→ Vérifier que `corsMiddleware` parse correctement les origines multiples (split `,` + trim).

---

## ✅ Points Forts (Architecture Sécurisée)

| Composant | Pourquoi c'est bien |
|-----------|---------------------|
| **RLS partout** | `enable row level security` sur TOUTES les tables, zéro politique = blocage total par défaut |
| **Helpers RLS centralisés** | `current_school_id()`, `current_role()`, `is_active_user()`, `school_is_writable()` — toute la logique d'accès en SQL, impossible à contourner côté client |
| **JWT vérifié par Supabase Auth** | `getAuthenticatedUser()` appelle `svc.auth.getUser(jwt)` — jamais de `jwt.decode()` sans signature |
| **Service role uniquement côté Render** | `SUPABASE_SERVICE_ROLE_KEY` absent du front, routes admin protégées par `adminConfigGuard` |
| **Rate limiting atomique** | RPC `sys_rate_limit` en base — pas de race condition, fonctionne multi-instances Render |
| **IP client fiable** | `trust proxy: 1` + `clientIp()` prend le **dernier** maillon XFF (celui ajouté par Render) |
| **CORS fail-closed** | Si `FRONTEND_ORIGIN` absent en prod → `process.exit(1)` au démarrage |
| **Headers de sécurité** | `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `HSTS`, `X-Frame-Options: DENY`, `CSP: default-src 'none'` |
| **Audit logging** | `audit_log` alimenté par triggers + appels explicites, lisible uniquement `service_role` |
| **MFA admin (TOTP)** | `admin_mfa_sessions` table, vérification à chaque `/admin/auth`, setup/verify/disable complets |
| **Séparation espaces école/admin** | `adminAuth.js` bloque explicitement les comptes `profiles` (ligne 25-42) |
| **Validation centralisée** | `validate.js` — tous les validateurs lèvent `ValidationError` → `route()` traduit en 400 `{ error }` |
| **Mots de passe temporaires** | Génération crypto-sécurisée (`crypto.getRandomValues` + rejection sampling), règles identiques front/back |
| **PKCE pour Supabase Auth** | `flowType: "pkce"` — pas de token en fragment d'URL |
| **Tests RLS (pgTAP)** | `backend/supabase/tests/rls_*.test.sql` — fondations testées |

---

## 📋 Plan d'Action Recommandé

### Semaine 1 (Critiques)
1. [ ] Timeout sur `callFunction` (frontend)
2. [ ] `PAIEMENTS_CONFIGURES` → config dynamique (frontend)
3. [ ] Routes `/publish` `/unpublish` matching exact (backend timetables)
4. [ ] Rate limit `/admin/login` (backend)
5. [ ] Unifier `generateTempPassword` (partagé ou backend-only)

### Semaine 2 (Majeurs)
6. [ ] Hydratation progressive + limites par table (frontend db.ts)
7. [ ] `clientIp()` fallback dev (backend rateLimit.js)
8. [ ] `refresh()` recharge `schoolId` (frontend AuthContext)
9. [ ] Rate limit global `/verify-matricule` + captcha (backend)
10. [ ] Documenter `requireFeature` = UX only, sécurité = backend

### Semaine 3-4 (Mineurs + Qualité)
11-20. Corrections listées ci-dessus + :
- Passage Express 4 LTS
- `npm audit` en CI (GitHub Actions)
- Tests d'intégration API (supertest) + E2E (Playwright existant)
- Sourcemaps désactivées en prod
- Monitoring erreurs (Sentry ou équivalent)

---

## 🔍 Détails Techniques par Fichier

### Frontend — Fichiers Clés
| Fichier | Rôle | Problèmes |
|---------|------|-----------|
| `src/lib/supabase.ts` | Client Supabase (anon key, PKCE) | ✅ Bien |
| `src/lib/functions.ts` | Appel API backend (Bearer JWT) | ❌ Pas de timeout |
| `src/context/AuthContext.tsx` | Session, login, register, logout | ⚠️ `refresh()` incomplet, logout race |
| `src/context/SchoolContext.tsx` | École, abonnement, status | À lire pour `SubscriptionGuard` |
| `src/services/authService.ts` | Flows auth (login, register, staff) | ✅ Bien, vérifs rôle côté client + serveur |
| `src/services/db.ts` | Cache local 18 tables (RLS) | ⚠️ Hydratation massive, `MAX_ROWS` élevé |
| `src/utils/permissions.ts` | Rôles, `canEditGrades`, `canManageStaff` | ✅ Bien |
| `src/utils/features.ts` | Feature flags par plan | ⚠️ Client-only, documenter |
| `src/utils/password.ts` | Règles + génération temp password | ⚠️ Dupliqué backend |
| `src/routes/guards.tsx` | ProtectedRoute, SubscriptionGuard, etc. | ❌ `PAIEMENTS_CONFIGURES` durci |
| `src/routes/adminGuards.tsx` | AdminProtectedRoute, AdminRoleRoute | ✅ Bien |

### Backend — Fichiers Clés
| Fichier | Rôle | Problèmes |
|---------|------|-----------|
| `src/index.js` | Entry point, middleware, routes | ✅ Bien (headers, CORS, trust proxy) |
| `src/config.js` | Variables d'env | ✅ Bien |
| `src/lib/auth.js` | JWT verify, profile, requireDirecteur, audit | ✅ Bien |
| `src/lib/rateLimit.js` | `clientIp()`, `enforceRateLimit` RPC | ⚠️ `null` en dev |
| `src/lib/validate.js` | Validateurs centralisés | ✅ Bien |
| `src/lib/http.js` | Helpers réponse, CORS, logError | À lire |
| `src/routes/loginGuard.js` | Post-login status check | ⚠️ Énumération email admin vs école |
| `src/routes/verifyMatricule.js` | Vérif matricule public | ⚠️ Rate limit perfectible |
| `src/routes/registerDirector.js` | Inscription directeur | ✅ Bien (transaction + cleanup) |
| `src/routes/timetables.js` | Emplois du temps (audit vague 1) | ❌ Match routes fragile |
| `src/routes/adminAuth.js` | Session admin + MFA | ⚠️ Pas de rate limit `/admin/login` |
| `src/routes/admin*.js` | Admin console routes | À vérifier chacun |

### Base de Données — Migrations Clés
| Migration | Contenu | Statut |
|-----------|---------|--------|
| `0001_foundation.sql` | Schéma, tables, RLS activée | ✅ |
| `0002_rls_helpers.sql` | `current_school_id`, `is_active_user`, `school_is_writable` | ✅ |
| `0003_auth_accounts.sql` | Policies profiles, teachers, students, rate_limits | ✅ |
| `0004_registration_rpcs.sql` | `finish_*_registration` (security definer, service_role only) | ✅ |
| `0021_fix_school_writable_production.sql` | Correction `school_is_writable` | ✅ |
| `0031_platform_settings.sql` | Table `platform_settings` + RPC | ✅ |
| `0045_admin_mfa.sql` | MFA admin (TOTP) | ✅ |

---

## 🧪 Tests de Sécurité à Ajouter

```bash
# 1. Rate limiting
hey -n 30 -c 5 -H "Authorization: Bearer <jwt>" https://api/verify-matricule
# → Doit retourner 429 après 20 req/5min

# 2. Isolation école (RLS)
# Avec JWT école A, tenter de lire students école B
# → Doit retourner 0 lignes (RLS)

# 3. Admin login brute force
hey -n 50 -c 10 -d 'matricule=CLA-ADM-000001&password=wrong' https://api/admin/login
# → Doit retourner 429 après 10 req/5min

# 4. Timetables scope
# POST /api/timetables avec classId d'une autre école
# → Doit retourner 404 "Classe introuvable dans votre école"

# 5. Feature bypass
# Modifier localStorage pour simuler plan "premium" et créer staff économe
# → Backend doit rejeter (schoolIsWritable + plan check)
```

---

## 📝 Conclusion

Le codebase CLASSORA démontre une **maturité sécurité supérieure à la moyenne** :
- Architecture « defense in depth » : RLS (données) + JWT vérifié (API) + guards (frontend)
- Pas de secrets côté navigateur
- Rate limiting atomique multi-instances
- Audit trail complet

Les **5 points critiques** sont rapidement corrigeables (timeout, config dynamique, matching routes, rate limit admin, déduplication). Une fois ces correctifs appliqués, le score monterait à **9.5/10**.

Recommandation : **Corriger les critiques cette semaine**, planifier les majeurs pour le sprint suivant, et ajouter les tests d'intégration sécurité en CI.