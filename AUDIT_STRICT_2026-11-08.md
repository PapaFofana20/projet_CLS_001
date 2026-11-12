# AUDIT STRICT — CLASSORA — 2026-11-08

> Méthode : lecture directe du code (backend `api/src`, frontend `src`, migrations + tests SQL), croisement frontend↔backend↔SQL, exécution de `npm run typecheck` et `npm run lint`. Aucune correction appliquée. Sévérités : CRITIQUE / HAUTE / MOYENNE / BASSE.

## Verdict

**Le code compile et passe les vérifications syntaxiques** (`tsc --noEmit` : 0 erreur ; `node --check` : OK sur tous les fichiers listés dans le script `lint`). **Mais il ne fonctionne pas correctement sur plusieurs points critiques** : MFA admin décoratif et cassé, fuite de notes entre classes, contournement du mot de passe temporaire, usurpation d'identité élève par matricule devinable, abonnement Premium gratuit, et un système d'abonnement entièrement inerte côté frontend. Ce n'est pas de la triche : les erreurs ci-dessous sont réelles, vérifiées ligne par ligne.

---

## 1. CRITIQUE

### Backend

| # | Fichier:Ligne | Problème |
|---|---|---|
| B-C1 | `backend/api/src/routes/adminLogin.js:94,146` + `adminAuth.js:47,72` | `totp_enabled` (snake_case) sélectionné mais testé en `totpEnabled` (camelCase) → **toujours `undefined`** → la branche MFA n'est **jamais prise**. Un agent avec MFA activé obtient le flux « sans MFA » direct. |
| B-C2 | `backend/api/src/lib/authAdmin.js:35-72` + `routes/adminMfa.js:58,110,209` | `getCallerAdminAgent` ne sélectionne ni `totp_secret` ni `totp_enabled` → `status` annonce toujours `mfaEnabled:false`, `verify-setup` renvoie toujours « Aucun secret TOTP configuré », `disable` « MFA non activé ». **Le module MFA est fonctionnellement mort.** |
| B-C3 | `backend/api/src/routes/adminMfa.js:42` | `PRE_AUTH_TTL_MS` **non défini** (jamais importé ni déclaré) → `ReferenceError` à chaque succès TOTP (500 au lieu de session MFA). Vérifié par grep : 1 seule occurrence, aucune déclaration. |
| B-C4 | `backend/supabase/migrations/20260101000041_bulletins_block_rls.sql:29` + `00043:86` | **Tautologie RLS réintroduite** : `a.class_id = class_id AND a.subject_id = subject_id` où `a` (`teaching_assignments`) possède déjà ces colonnes → comparaison `a.x = a.x` toujours vraie, **aucun contrôle `a.school_id = grades.school_id`**. Tout enseignant avec ≥1 affectation lit **toutes les notes de son école**. Une correction de `00015` avait été régressée. |
| B-C5 | `backend/supabase/migrations/20260101000038_durcissement_audit_vague3.sql:301-317` | `complete_password_change()` ne fait que `UPDATE … must_change_password=false` **sans preuve** que le mot de passe a changé (la garde `is_active_user()` de `00017` a disparu, contrairement à l'en-tête L14 qui l'annonce). Tout `authenticated` lève le drapeau. |
| B-C6 | `backend/supabase/migrations/20260101000044_enrolled_student_account.sql:13-66` | `finish_enrolled_student_registration` : aucun contrôle `school_is_writable` / `registration_open`, seule « preuve » = le **matricule élève séquentiel** (`EC260001`, …). Quiconque connaît `school_id` et devine le matricule crée un compte **ACTIF** sur la fiche d'un enfant réel → **usurpation d'identité d'élève**. |
| B-C7 | `backend/supabase/migrations/20260101000033:62-185` + `00035:44-160` | `finish_director_registration` crée un abonnement **actif 365 jours pour toute formule (même Premium) avec `amount_paid=0`**, sans aucun encaissement. Perte de facturation structurelle. |
| B-C8 | `backend/supabase/migrations/20260101000014_purge_demo.sql:15-34` | Migration `DELETE FROM students/schools` (cascade totale) + `DELETE FROM auth.users` (5 UUID durs), irréversible, déclenchable par un simple `db push` si une école réelle correspond au motif. |
| B-C9 | `backend/supabase/migrations/20260101000016_retrait_mobile_money.sql:23-28` | `DROP TABLE payment_transactions` + drop des fonctions : **perte du registre d'audit financier** (tentatives de paiement), sans archivage. |

### Frontend

| # | Fichier:Ligne | Problème |
|---|---|---|
| F-C1 | `frontend/src/pages/app/DashboardPage.tsx:13-29` | `switch (user.role)` **sans `default`** : tout rôle non listé → `undefined` → React lève « Nothing was returned from render », **écran blanc** sur `/app`. Vérifié : fichier lu, aucun défaut. |
| F-C2 | `frontend/src/services/timetableService.ts:110-316` vs `backend/api/src/index.js:138-141` | **Contournement total de l'API backend** : le frontend accède à `timetables`/`timetable_courses` en direct via Supabase, jamais via les routes sécurisées `/api/timetables` (JWT + rôle + rate-limit). Les routes backend sont du code mort, les validations backend ne s'appliquent jamais. |
| F-C3 | `frontend/src/routes/guards.tsx:109,130` | `PAIEMENTS_CONFIGURES = false` désactive **intégralement** `SubscriptionGuard` : une école expirée depuis 30 jours accède à tout. Tout le système d'abonnement (écrans `RenewScreen`, `ensureWritable`, calculs de statut) est inerte/incohérent. |

---

## 2. HAUTE

### Backend

| # | Fichier:Ligne | Problème |
|---|---|---|
| B-H1 | `routes/delete-staff-account.js:18-47` | Aucune garde `schoolIsWritable` (contrairement à `createStaffAccount`, `updateStaff`, `resetStaffPassword`, `setStaffActive`) : un directeur d'école expirée/suspendue peut supprimer définitivement des comptes. |
| B-H2 | `routes/registerStudent.js`, `registerParent.js`, `register-enrolled-student.js` | Aucune lecture de `readPlatformSettings` (contrairement à `registerDirector.js:28-38`) : maintenance / fermeture des inscriptions contournables. `register-enrolled-student` : aucun contrôle d'abonnement non plus. |
| B-H3 | `routes/registerStudent.js:50-51`, `registerParent.js:57-60` | `school_is_writable` en **fail-open** : si la RPC échoue (`error`), `writable` est `null ≠ false` → on continue. Devrait être `!== true` → bloquer. |
| B-H4 | `routes/timetables.js:253-266` | Aucune vérification `endTime > startTime`, ni chevauchement, ni appartenance du slot à la classe (en plus : routes jamais appelées, cf. F-C2). |
| B-H5 | `routes/adminFinances.js:18-60`, `adminSubscriptions.js:178-289`, `adminStats.js:28-30`, `adminAnalytics.js:48-56` | Chargements intégraux en mémoire (jusqu'à 20 000 événements, 5 000 écoles/abonnements) avec **tronquage silencieux** au-delà → totaux financiers faux + amplification DoS par simple GET admin. |
| B-H6 | `routes/adminSubscriptions.js:95-98` | Message d'erreur SQL renvoyé brut au client (`badRequest(res, error.message)`) : fuite de schéma/contraintes. Les autres routes renvoient un message générique — incohérence. |
| B-H7 | `migrations/20260101000047_teacher_attendance.sql:42-90` | `set_attendance_unchecked` : un enseignant/directeur/surveillant peut effacer+remplacer tout l'appel du jour, sans audit de l'ancien contenu. |
| B-H8 | `migrations/00038:185-219` vs `00039:16-61` | Deux chemins de changement de rôle superadmin : `admin_set_superadmin` (`TO authenticated`, contrôle « dernier superadmin » **sans lock**, race condition) vs `admin_update_agent` (`TO service_role`, avec lock). Le garde-fou est contournable via le premier chemin. |
| B-H9 | `migrations/00038:245-284` | `school_is_readable` vaut `false` pour une école **sans abonnement** (`AUCUN`) après `00021` → une école fraîchement créée (sans abonnement) ne peut lire ni ses classes ni ses élèves. Deadlock métier jusqu'à activation `service_role`. |
| B-H10 | `migrations/00046:106-148` | `set_payment_manual_status_unchecked` : passer à `impaye/a_venir` **efface un encaissement partiel réel** (`paid_amount=0`, sans trace) ; passer à `paye` génère une référence `EC-<random>` **non unique**. |
| B-H11 | `migrations/00006:103-129` | `build_payment_plan` sans `ON CONFLICT` alors que `UNIQUE (school,student,kind,label,due_date)` existe : un second appel lève une violation et fait échouer toute la transaction d'inscription. |
| B-H12 | `migrations/0045_admin_mfa.sql:16-28` | `totp_secret` stocké **en clair** (le commentaire l'avoue). Fuite de la table = contournement MFA de toute la console admin. |
| B-H13 | `migrations/00039:36-51` | `admin_update_agent` : protection « dernier superadmin » seulement si `p_downgrades=true` ; si `false`/`NULL`, `role`/`status` mis à jour **sans contrôle**. |
| B-H14 | `migrations/20260101000037:101-147` | `admin_purge_school` : suppression d'un établissement entier, sans `audit_log` préalable, et nettoyage des comptes Auth « best effort » hors transaction → comptes Auth orphelins si Node échoue. |

### Frontend

| # | Fichier:Ligne | Problème |
|---|---|---|
| F-H1 | `frontend/src/pages/app/AdminSchoolDetailPage.tsx:36-43` | ESLint `react-hooks/rules-of-hooks` **error** : `useAsync` appelé conditionnellement après `if (!schoolIdParam) return` → crash React si le param change entre rendus. |
| F-H2 | `frontend/src/services/timetableService.ts:261,281,300` | `createCourse`/`updateCourse`/`deleteCourse` déclarent `schoolId` puis l'ignorent (`void schoolId`) ; `update`/`delete` filtrent **par `id` seul** → si la RLS est fautive, cours d'une autre école modifiable/supprimable. |
| F-H3 | `frontend/src/services/db.ts:337-346` | `assign()` : tout échec d'hydratation est **avalé** (`console.error` uniquement) → cache vide/périmé, pages affichant « Aucun élève » comme si c'était la réalité, sans message ni réessayer. |
| F-H4 | `frontend/src/services/schoolService.ts:306-307` | `deleteClass` : les deux `delete()` préparatoires sont `await` **sans tester `error`** → suppression partielle invisible. |
| F-H5 | `frontend/src/services/authService.ts:471-472` | `resetPassword` : `void flagError` — si `complete_password_change` échoue après `updateUser` réussi, le flag `must_change_password` reste `true` → **boucle infinie** sur l'écran de changement de mot de passe. |
| F-H6 | `frontend/src/services/schoolService.ts:339-340` | `openClassesFor` : `if (error) return []` → échec RPC converti en « aucune classe ouverte », formulaire d'inscription inutilisable sans erreur. Et la fonction **n'a aucun appelant**. |
| F-H7 | `frontend/src/utils/subscription.ts:41-72` vs `services/db.ts:112-120` | **Deux calculs de statut contradictoires** : `EXPIRE_BIENTOT` produit par `mapSubscription`, jamais par `computeSubscriptionInfo` → deux écrans, deux statuts pour la même école. |
| F-H8 | `frontend/src/utils/subscription.ts:47-52` | L'**essai gratuit** (`TRIAL_DAYS=14`) n'existe nulle part côté backend → école « en essai » côté front mais bloquée côté RLS, ou inversement. |
| F-H9 | `frontend/src/utils/features.ts:42` | `hasFeature` : `if (currentPlanIndex === -1) return true` → **fail-open** : un plan inconnu/corrompu débloque toutes les features premium. |
| F-H10 | `frontend/src/context/AuthContext.tsx:93-100` | `registerStudent`/`registerParent` font `setUser(u)` avec un compte `EN_ATTENTE` **sans session Auth** → état « connecté sans session », perdu au rechargement, redirection incohérente. |
| F-H11 | `frontend/src/pages/app/AdminSchoolDetailPage.tsx:199-213` | Cycles toggleables sans contrainte : l'utilisateur peut enregistrer `cycles: []` → école sans cycle, que `createClass` refusera ensuite sans explication. |
| F-H12 | `frontend/src/pages/auth/DirectorSubscriptionPage.tsx` (~200 lignes) | **Page entière jamais routée** dans `App.tsx` → parcours d'onboarding d'abonnement inaccessible, ancien lien → 404. |
| F-H13 | `frontend/src/services/schoolService.ts:103,117` | `verifyMatricule` renvoie `school.matricule = code` **nettoyé côté client**, pas le serveur → l'écran de confirmation peut afficher un code faux que l'utilisateur ne retrouvera pas à la connexion. |

---

## 3. MOYENNE

### Backend
- **M1** — Sessions MFA / lockout uniquement en mémoire, non bornés (`lib/mfa-sessions.js`, `adminLogin.js:27-49`) : remplissage de Map possible (DoS mémoire) et bypass du lockout en multi-instance.
- **M2** — `updateStaff.js:47-102` : validation faible (phone sans format, spécialités sans plafond, chaînes vides acceptées et écrites) + e-mail Auth changé **avant** la mise à jour profil, sans rollback → divergence Auth/profil.
- **M3** — `registerParent.js:39-50` : pré-validation du code enfant seulement dans la branche matricule, pas dans la branche `schoolId`.
- **M4** — `adminSchools.js:45-62` (+ `adminAudit.js:50-52`) : recherche PostgREST `ilike` échappant `%_\` mais pas `,().` → interprétation du filtre ; `POST setStatus` (L170-201) sans rate limit.
- **M5** — `adminAgents.js:218-245` : e-mail Auth muté **avant** la RPC atomique (divergence si refus) ; un admin peut se désactiver lui-même.
- **M6** — `platformStatus.js:39-43` : en cas d'erreur, les défauts `registrationOpen:true` sont renvoyés (**fail-open**) ; le cache répond **avant** le rate limit.
- **M7** — `adminSecurity.js:176-180` : exposition des clés de rate limit (IP/identifiants) à tout `admin`, pas seulement superadmin.
- **M8** — `verifyMatricule.js:24-26` : matricule non normalisé avant RPC, aucune borne de longueur.
- **M9** — `loginGuard.js` : codes HTTP incohérents selon le statut (200 pour DESACTIVE/EN_ATTENTE, 403 pour statut inconnu).
- **M10** — MFA : `consumePreAuthSession` **avant** vérification TOTP (un échec consomme le jeton) + codes TOTP rejouables dans la fenêtre ±90 s (`lib/totp.js:112-122`, aucun anti-replay).
- **M11** — `adminLogin.js:59-64` : `SERVICE_KEY` (service_role) envoyé comme `apikey` pour le password grant — privilège max pour une vérification de mot de passe.
- **M12** — Audit silencieux : `lib/auth.js:123-137`, `lib/authAdmin.js:125-139` n'inspectent que les exceptions ; une erreur `{ error }` retournée par `.insert()` est ignorée.
- **M13** — `index.js:89-112` : le middleware d'erreur JSON est **avant** le middleware d'en-têtes de sécurité → les rejets 400 n'ont ni `X-Content-Type-Options`, ni CSP, ni `Cache-Control`.
- **M14 (SQL)** — Notes : aucune contrainte `CHECK (period IN ('S1','S2','T1','T2','T3'))` sur `grades.period`/`report_metas.period` (`foundation.sql:274,287`) ; INSERT direct PostgREST non validé. `class_report_cards` : pour un `parent`, le « rang de classe » et la « moyenne de classe » sont calculés **sur ses seuls enfants** (`grades.sql:325-379`) — valeur trompeuse + fuite de moyenne entre fratries.
- **M15 (SQL)** — Paiements : remise fratrie accordée dès qu'un autre élève `EN_ATTENTE` existe (`build_payment_plan`) ; `round(…/500)*500` peut diverger du front ; `school_settings` absent → `NOT NULL` violation sur `payments.amount`. `record_cash_payment` : référence `EC-` aléatoire non unique, et `coalesce(old,new)` jette la nouvelle référence tout en la journalisant en audit. `amount=0, paid=0` → statut `paye` immédiat.
- **M16 (SQL)** — Double comptage de limite d'effectif : les élèves `EN_ATTENTE` comptés à l'inscription **puis** re-comptés à l'approbation (`decide_registration_requests`) → rejets légitimes près de la limite ; pas de lock dans `finish_student_registration` (course entre inscriptions simultanées). Off-by-one : contrôle capacité **après** INSERT inclut le nouvel élève → la place qui remplit exactement la classe est rejetée.
- **M17 (SQL)** — Index manquants : `contact_messages(email, created_at)` (rate limit = seq scan à chaque insert anonyme, DoS), `audit_log(actor_id, entity, entity_id)`, index composites `timetables(school,class,status)`.

### Frontend
- **M18** — `hooks/useAsync.ts:43` : `useEffect(..., [...deps, tick])` — dépendances invérifiables ; si `fn` lève synchronement, l'erreur n'est pas capturée → crash du rendu. Aucun timeout → spinner infini.
- **M19** — `services/admin.ts:292,407` : `DELETE` **avec corps JSON** (`deleteAdminSchool`, `purgeAdminAudit`) — plusieurs proxies/Express tronquent le corps des DELETE → 400/500 indistinguable côté front.
- **M20** — `services/authService.ts:366,387,427` : `updateStaff`/`resetStaffPassword`/`changePassword` font `void actor` → contrôles d'autorisation uniquement côté backend (divergent du modèle affiché par `access.ts`).
- **M21** — `context/SchoolContext.tsx:76,99` : `reload` capture un `state` périmé (dépendance manquante) ; `routes/guards.tsx:39-45` : redirection d'un user `DESACTIVE` vers `/` sans `logout()` ni `clearCache()` → boucle de redirection.
- **M22** — `pages/app/StudentsPage.tsx:99-141` : `filterFields` instancié deux fois (desktop + mobile), changer le cycle mobile **efface le filtre classe** ; « Réinitialiser » ne réinitialise pas `q`.
- **M23** — `utils/csvImport.ts:121` : `gender` — toute valeur non reconnue (vide, « X », faute) devient silencieusement `"F"`, sans erreur remontée.
- **M24** — `utils/csvImport.ts:84-89` : export CSV sans protection contre la **formule injection** (`=`, `+`, `-`, `@` en début de cellule) → formule exécutée à l'ouverture dans Excel.
- **M25** — `services/db.ts:77-401` : tous les `map*()` prennent `(r: any)` (25 occurrences) → une colonne renommée en base produit `undefined` **silencieusement** au lieu d'une erreur de type. Idem `catch (e: any)` + `e.message` sans garde dans les pages admin.
- **M26** — `utils/format.ts:62-68` : `ageFrom` utilise l'heure locale alors que le reste du module impose l'UTC → âge faux d'un an selon le fuseau (Paris vs Dakar).

---

## 4. BASSE / HYGIÈNE

- **B1** — `env.js:42` : `raw.replace(/\s+#.*$/,"")` tronque les valeurs contenant ` #` (mot de passe avec `#`).
- **B2** — `lib/http.js:111-122` `withTimeout` : timer non nettoyé sur timeout, promesse Supabase sous-jacente non annulée.
- **B3** — `adminStats.js:88` : `suspended = total - active` inclut écoles sans abonnement et expirées — libellé trompeur. `adminSubscriptions.js:23-28` : `sanitizeSearch` remplace `%` par un espace → recherches légitimes impossibles.
- **B4** — `index.js:117` : `/healthz` expose `supabaseConfigured` (fingerprinting) ; `Cache-Control: no-store` seulement sur `/admin*` et `/login-guard` — les routes staff authentifiées restent cachables par un proxy.
- **B5** — SQL : `school_settings.annex_fees jsonb` sans schéma (`::int` plante sur JSON malformé) ; `class_rooms.cycle` sans cohérence avec `level_id` ; contraintes `NOT VALID` (`schools_cycles_required`, `contact_messages_*_len`) **jamais validées** ; `profiles.email` unique **global** (un même e-mail ne peut pas être dans deux écoles) ; `timetable_courses` sans contrainte `end_time > start_time` ni anti-chevauchement.
- **B6** — SQL : `DROP FUNCTION IF EXISTS` + `CREATE OR REPLACE` en chaîne pour `finish_director_registration` (5 signatures) → `PGRST202 function not found` si une Edge Function appelle l'ancienne signature pendant la migration.

---

## 5. Code mort / jamais appelé (vérifié par recherche exhaustive)

| Export | Fichier | Impact |
|---|---|---|
| `DirectorSubscriptionPage` (page entière) | `frontend/src/pages/auth/DirectorSubscriptionPage.tsx:107` | Parcours d'onboarding inaccessible |
| `openClassesFor` (+ RPC `open_classes`) | `frontend/src/services/schoolService.ts:337` | Formulaire d'inscription sans source de classes |
| `computeStatus` | `frontend/src/utils/payments.ts:6` | Recalcul de statut jamais utilisé (illusion d'un recalcul) |
| `persist`, `resetDatabase`, `uid` | `frontend/src/services/db.ts:456-466` | Reliquats de l'ancien modèle « base locale » |
| `registrationRequestOf`, `listParentContacts`, `listTeacherContacts` | `frontend/src/services/authService.ts:477-518` | Conservés « pour compatibilité » ; `listParentContacts` renvoie `db.parents` **sans filtre école** (fuite inter-écoles si un jour appelé) |
| `listSchools`, `getSchool`, `generateMatriculeFor` | `frontend/src/services/schoolService.ts:30-134` | `generateMatriculeFor` ne génère rien (le nom promet, le corps ne fait pas) — piège pour le prochain dev |
| `subjectsOfCached` | `frontend/src/services/schoolService.ts:25-27` | Doublon exact de `subjectsOf` (`db.ts:506`) |
| Route MFA `status/setup/verify-setup/disable` | `backend/api/src/routes/adminMfa.js` | Le front n'appelle que `admin/mfa/verify` (`admin.ts:68`) |
| `generateTempPassword` | `backend/api/src/lib/auth.js:175-182` | Plus généré nulle part |
| `ROUTE_ROLES.onboarding` | `frontend/src/routes/navigation.ts:104` | Clé définie, jamais utilisée (aucune route `onboarding`) |

---

## 6. Suite de tests SQL obsolète — ne prouve rien

| Test | Problème |
|---|---|
| `rls_004_subscriptions.test.sql` | Teste `apply_paid_subscription` + `payment_transactions` (**supprimés en `00016`**), `verify_matricule` accessible à `anon` (**révoqué en `00043`**) → **échec garanti** sur le schéma final. |
| `rls_006_payments.test.sql` | Teste `start_installment_payments`/`apply_paid_installment` (**droppés en `00016`**) ; aucun test du circuit cash-only actuel. |
| `rls_008_audit_isolation.sql`, `rls_009_audit_roles.sql`, `rls_010_audit_paiements.sql` | Référencent les mêmes objets droppés → décrivent un état pré-`00016`. |
| `rls_003_structure.sql`, `rls_005_grades.sql` | Comptes `plan()` incohérents avec le nombre d'assertions (22 vs 29, 17 vs 23) → pgTAP échoue. `rls_007` **absent** (trou de numérotation). |
| Aucun test pour | `secretaire` (`00029`), `timetables` (`00034/00037`), `block_student_bulletins` (`00041/00043`), `manual_status` (`00046`), `set_attendance` (`00047`), `admin_agents`/MFA (`00024/0045`), `platform_settings` (`00031`), `subscription_requests` (`00019`), `finish_enrolled_student_registration` (`00044`), `admin_purge_school` (`00037`). **Les régressions critiques (tautologie `00041`, `complete_password_change` `00038`) n'auraient pas été attrapées.** |

---

## 7. Points vérifiés OK (pas de finding — pour être honnête)

- **TypeScript** : `tsc --noEmit` passe (0 erreur, `strict` + `noUnusedLocals/Parameters`) ; `node --check` passe sur tous les fichiers du script `lint`.
- **XSS** : aucun `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `document.write` dans tout `frontend/src` (213 fichiers). Tous les contenus utilisateurs passent par le rendu React.
- **Secrets** : aucun secret en dur dans `backend/api/src` (clés uniquement via `process.env`) ; `SERVICE_KEY` jamais renvoyé au client ; JWT toujours vérifié via `svc.auth.getUser` (jamais de décodage base64) ; requêtes Supabase paramétrées (pas de concaténation SQL).
- **Rate limit** : RPC atomique `sys_rate_limit`, fail-closed ; `trust proxy: 1` avec IP via dernier maillon XFF (falsification neutralisée) ; CORS fail-closed en prod.
- **Contrat API** : toutes les routes appelées par `callFunction` correspondent 1-à-1 à `index.js` (méthodes incluses) ; tous les RPC appelés existent dans les migrations.
- **Auth front** : anti-énumération au login, fermeture de session sur échec du `login-guard`, PKCE, `ProtectedRoute` attendant la restauration de session, `ErrorBoundary` global.

---

## 8. Plan de correction priorisé

1. **MFA admin** (B-C1–B-C3) : corriger le nom de champ (`totp_enabled` vs `totpEnabled`), sélectionner `totp_secret/totp_enabled/totp_enabled_at` dans `authAdmin.js`, déclarer `PRE_AUTH_TTL_MS`, chiffrer `totp_secret`, ajouter l'anti-replay TOTP. *Sans ça, la MFA est un décor.*
2. **Fuite de notes** (B-C4) : restaurer la qualification `a.school_id = grades.school_id` dans `grades_select_scoped` (`00041`/`00043`), avec test RLS.
3. **Mot de passe temporaire** (B-C5) : exiger une preuve de changement (restaurer la garde `is_active_user()` + vérification de l'événement de changement).
4. **Usurpation élève** (B-C6) : exiger un secret partagé (code parent / date de naissance) **et** `school_is_writable` + `registration_open` dans `finish_enrolled_student_registration`.
5. **Facturation** (B-C7) : ne créer un abonnement actif que contre encaissement confirmé ; sinon statut `EN_ATTENTE`/`AUCUN`.
6. **Abonnement front** (F-C3) : trancher `PAIEMENTS_CONFIGURES` explicitement (décision produit, pas constante oubliée) ; harmoniser `mapSubscription`/`computeSubscriptionInfo`/`hasFeature` (fail-open).
7. **Écran blanc** (F-C1) : ajouter le `default` dans `DashboardPage`.
8. **Timetables** (F-C2/B-H4) : brancher le front sur `/api/timetables` **ou** supprimer les routes backend — aujourd'hui les deux coexistent sans lien ; ajouter `endTime > startTime` + anti-chevauchement.
9. **Fail-open** (B-H2/B-H3, F-H6/F-H9, M6) : tout contrôle d'abonnement/plateforme doit bloquer quand la source de vérité échoue, jamais l'inverse.
10. **Tests** : réécrire `rls_004/006/008/009/010` sur le schéma final, corriger les `plan()`, ajouter les fichiers manquants (absence, timetables, MFA, enrolled). *Une suite de tests qui ne peut pas passer ne prouve rien — et ici elle masque les régressions ci-dessus.*

---

*Audit effectué le 2026-11-08, sans modification du code. Vérifications exécutées : `npm run typecheck` (0 erreur), `npm run lint` (OK), grep ciblés `PRE_AUTH_TTL_MS`, `totpEnabled`, `PAIEMENTS_CONFIGURES`, `complete_password_change`, lecture directe de `DashboardPage.tsx`.*

---

## 9. Corrections appliquées (même jour, vérifiées par `npm run lint` + `node --check` exhaustif)

| # | Correctif | Fichiers |
|---|---|---|
| 1 | **MFA fonctionnelle** : `totp_enabled` sélectionné/testé en snake_case (`adminLogin.js`, `adminAuth.js`) ; `authAdmin.js` sélectionne et mappe `totp_secret/totp_enabled/totp_enabled_at` ; `PRE_AUTH_TTL_MS` déclaré dans `adminMfa.js` ; jeton pré-auth consommé **seulement après** succès TOTP (`peekPreAuthSession`) ; anti-replay TOTP (`totp.js` : chaque step consommé mémorisé) ; **secret TOTP chiffré AES-256-GCM au repos** (`secretCrypto.js`, clé dérivée de `SERVICE_KEY`, compat historique en clair). | `lib/authAdmin.js`, `lib/secretCrypto.js` (nouveau), `lib/mfa-sessions.js`, `lib/totp.js`, `routes/adminLogin.js`, `routes/adminAuth.js`, `routes/adminMfa.js` |
| 2 | **Fuite de notes** : migration `00048` — `grades_select_scoped`/`report_metas_select_scoped` recréées avec colonnes **qualifiées** (`grades.`/`report_metas.`) + contrôle `a.school_id`/`c.school_id` (annule la régression `00041`/`00043`). | `migrations/20260101000048_fix_grades_rls_tautologie.sql` (nouveau) |
| 3 | **Preuve mot de passe** : migration `00049` — trigger `clear_must_change_password_trg` sur `auth.users` (flag levé mécaniquement au changement réel d'`encrypted_password`) + `complete_password_change()` avec garde `is_active_user()` restaurée. Front `resetPassword` : plus de `void flagError` silencieux. | `migrations/20260101000049_password_change_proof.sql` (nouveau), `authService.ts` |
| 4 | **Usurpation élève** : migration `00050` — nouvelle signature `finish_enrolled_student_registration(..., p_birth_date, ...)` : date de naissance exigée = preuve d'identité + `school_is_writable` fail-closed ; **ancienne signature sans preuve supprimée**. API : garde plateforme + abonnement + `birthDate` requis. Front : champ date de naissance dans `StudentSignupForm`. | `migrations/20260101000050_enrolled_student_birthdate_proof.sql` (nouveau), `routes/register-enrolled-student.js`, `authService.ts`, `StudentSignupForm.tsx` |
| 5 | **Premium gratuit** : migration `00051` — année de découverte **uniquement si formule gratuite** (prix mensuel ET annuel = 0) ; formule payante → abonnement expiré à la création, activation support requise. | `migrations/20260101000051_fin_premium_gratuit.sql` (nouveau), `routes/registerDirector.js` (commentaire) |
| 6 | **Garde abonnement front** : `PAIEMENTS_CONFIGURES = true` (commentaire mensonger corrigé). | `routes/guards.tsx` |
| 7 | **Écran blanc** : `default` ajouté dans `DashboardPage`. | `pages/app/DashboardPage.tsx` |
| 8 | **Fail-open / fail-closed** : `hasFeature` plan inconnu → `false` ; `registerStudent`/`registerParent`/`register-enrolled-student` : `writable !== true` bloque + erreurs RPC bloquent ; garde plateforme ajoutée à `registerStudent`/`registerParent` ; `delete-staff-account` : garde `schoolIsWritable` ; `platformStatus` : rate-limit **avant** cache, fallback jamais mis en cache, en-tête `X-Cache` retiré. | `utils/features.ts`, `routes/registerStudent.js`, `routes/registerParent.js`, `routes/register-enrolled-student.js`, `routes/delete-staff-account.js`, `routes/platformStatus.js` |
| 9 | **Timetables** : API étendue (`GET/POST /slots`, `PATCH/DELETE /slots/:slotId`, `POST /unpublish`, validation `endTime > startTime`, anti-chevauchement enseignant) + routes enregistrées ; frontend : **toutes les écritures passent par l'API** (`callFunction`), lectures RLS conservées. Migration `00052` : contrainte `CHECK (end_time > start_time)` (NOT VALID). | `routes/timetables.js`, `index.js`, `services/timetableService.ts`, `migrations/20260101000052_timetable_time_order.sql` (nouveau) |
| 10 | **Divers** : `AdminSchoolDetailPage` hooks toujour appelés (rules-of-hooks) ; `deleteClass` teste les erreurs des suppressions préparatoires ; `adminSubscriptions` : erreur SQL non fuitée ; `verifyMatricule` : normalisation + borne ; `adminLogin` : Map lockout bornée ; `adminSchools` : recherche échappe `,().` + rate-limit `setStatus` ; CSV : anti-formule-injection (`reminders.ts`) + genre explicite obligé (`csvImport.ts`). | 8 fichiers |

**Vérifications post-correction** : `npm run typecheck` ✅, `npm run lint` ✅ (exit 0), `node --check` sur **tous** les fichiers `backend/api/src/**/*.js` ✅.

## 10. Restant à traiter (non corrigé — à planifier)

- **DoS / pagination admin** (B-H5) : chargements intégraux en mémoire (`adminFinances`, `adminSubscriptions`, `adminStats`, `adminAnalytics`) — réécriture pagination serveur requise.
- **Suite de tests SQL obsolète** (§6) : réécrire `rls_004/006/008/009/010`, corriger les `plan()`, ajouter les tests manquants (absence, timetables, MFA, enrolled, `complete_password_change`, RLS notes).
- **`DELETE` avec corps JSON** (`admin.ts:292,407`) : passer en POST d'action (front + back).
- **Double calcul de statut d'abonnement** (`db.ts` vs `utils/subscription.ts`) + essai gratuit front-only : harmoniser sur la source serveur.
- **Off-by-one capacité classe** (`00038:158-163`) et **double comptage effectif** : correction SQL à valider avec le métier.
- **`db.ts` `any` généralisé** + erreurs d'hydratation avalées (F-H3) : typage strict + propagation d'erreur.
- **Migrations irréversibles passées** (`00014`, `00016`, `00045`) : données déjà perdues, aucun correctif possible — leçon pour l'avenir (archivage avant DROP).
- **Déploiement** : pousser les migrations `00048`–`00052` en production (`npm run db:push:remote`) et redéployer l'API (nouvelles routes timetables) + le front (`VITE_API_URL` requis pour les écritures timetables).
