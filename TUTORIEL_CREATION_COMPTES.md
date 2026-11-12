# CLASSORA — Logique exacte de création de comptes Élève et Parent

> Document de référence pour la préparation des tutoriels vidéo.
> Sources vérifiées dans le code : `frontend/src/features/auth/*`, `frontend/src/features/students/EnrollmentWizard.tsx`, `backend/api/src/routes/*`, `backend/supabase/migrations/*`.

---

## 1. Vue d'ensemble : comment ça marche

Toutes les inscriptions élève/parent passent par la **même page publique** : `/inscription`.

Le parcours se fait en **2 étapes** :

1. **Étape 1 — Choix du rôle** (`RoleChoice.tsx`) : l'utilisateur choisit « Élève » ou « Parent ».
2. **Étape 1 bis — Matricule de l'école** (`MatriculeStep.tsx`) : l'utilisateur saisit le **matricule de l'école** (5 caractères, ex. `AB3K9`). Ce matricule identifie l'établissement. Il est vérifié par l'API (`POST /verify-matricule`). Si l'école est en **mode maintenance** ou si les **inscriptions sont fermées**, c'est ici que ça bloque.
3. **Étape 2 — Formulaire propre au rôle** : `StudentSignupForm.tsx` (élève) ou `ParentSignupForm.tsx` (parent).

### ⚠️ Principe fondamental (à expliquer en premier dans les tutos)

> **Un élève ou un parent ne crée JAMAIS sa fiche lui-même.**
> C'est la **direction** qui inscrit d'abord l'élève (fiche scolaire créée dans `/app/inscription-eleve`). C'est seulement **ensuite** que l'élève ou le parent crée son **compte d'accès** (login) sur `/inscription`.

Conséquence concrète :

- **Élève** : a besoin de son **matricule d'élève** (ex. `EC260001`) remis par l'école + sa **date de naissance** (preuve d'identité).
- **Parent** : a besoin du **code élève** (6 caractères) de son enfant, remis par l'école.

Il n'existe **aucune inscription libre sans ces codes**. C'est un choix de sécurité.

---

## 2. Conditions préalables (côté école, avant tout tuto)

Pour qu'un élève ou un parent puisse créer un compte, il faut que :

| Condition | Détail |
|---|---|
| ✅ L'école existe dans CLASSORA | Le directeur s'est inscrit (`/inscription` → Directeur) et a reçu son **matricule d'école à 5 caractères** |
| ✅ L'élève est déjà inscrit par la direction | Via `/app/inscription-eleve` (assistant 3 étapes) → il possède un **matricule d'élève** (`EC` + année + numéro, ex. `EC260001`) et un **code élève** (6 caractères, ex. `K7RQ2M`) |
| ✅ Les inscriptions sont ouvertes | Réglage `registration_open` de l'école (sinon blocage à l'étape matricule) |
| ✅ L'école n'est pas en maintenance | Sinon blocage à l'étape matricule |
| ✅ L'abonnement de l'école est actif / non saturé | Garde `school_is_writable` — si la formule est expirée ou si la limite d'élèves est atteinte, la création est refusée |
| ✅ Le parent est rattaché à l'élève | Lors de l'inscription de l'élève par la direction, le parent (nouveau ou existant) est enregistré et l'élève lui est rattaché. C'est ce qui garantit que le code élève du tuto fonctionne |

### Identifiants générés par le système (à montrer à l'écran dans les tutos)

| Identifiant | Format | Généré quand ? | Sert à quoi ? |
|---|---|---|---|
| **Matricule d'école** | 5 caractères (ex. `AB3K9`) | À l'inscription du directeur | À saisir par TOUS les utilisateurs (élèves, parents, personnel) à la connexion et à l'inscription |
| **Matricule d'élève** | `EC` + 2 chiffres d'année + 4 chiffres (ex. `EC260001`) | À l'inscription de l'élève par la direction | À saisir par l'élève pour créer son compte. Repart à 1 chaque année scolaire. Unique par école |
| **Code élève (child_code)** | 6 caractères (ex. `K7RQ2M`) | À l'inscription de l'élève par la direction | À saisir par le **parent** pour se rattacher à son enfant. Unique par école |

> 🔡 Les codes sont générés avec un alphabet **sans 0, O, 1, I** (pour éviter toute confusion à la lecture). C'est pourquoi le formulaire refuse (ou normalise) ces caractères à la saisie.

---

## 3. Créer un compte ÉLÈVE — procédure exacte

### Étape 0 — Ce que l'élève doit avoir en main

1. **Le matricule de l'école** (5 caractères) — donné par l'école.
2. **Son matricule d'élève** (ex. `EC260001`) — donné par l'école lors de son inscription.
3. **Sa date de naissance exacte** — elle doit correspondre à celle de sa fiche d'inscription (c'est la **preuve d'identité** : si elle ne correspond pas, le compte est refusé).

### Étape 1 — Accéder au formulaire

- URL : `/inscription`
- Choisir le rôle **Élève**.
- Saisir le **matricule de l'école** (5 caractères). Le nom de l'école s'affiche pour confirmation.

### Étape 2 — Remplir le formulaire (`StudentSignupForm`)

Champs, dans l'ordre, **tous obligatoires** :

| # | Champ | Règle exacte | Message d'erreur si invalide |
|---|---|---|---|
| 1 | **Matricule de l'élève** | Minimum 4 caractères ; converti automatiquement en MAJUSCULES ; seuls A-Z et 0-9 acceptés (max 20) | « Saisissez votre matricule d'élève (ex. EC260001). » |
| 2 | **Date de naissance** | Format AAAA-MM-JJ (champ type `date`) ; pas de date future ; **doit être identique à la fiche d'inscription** | « Saisissez votre date de naissance (elle prouve votre identité). » |
| 3 | **Adresse e-mail** | Format e-mail valide ; servira d'identifiant de connexion ; **doit être unique** (jamais utilisée sur CLASSORA) | « Saisissez une adresse e-mail valide. » / « Un compte existe déjà avec cet e-mail. » |
| 4 | **Téléphone** | Numéro sénégalais à 9 chiffres, préfixe mobile 70 / 75 / 76 / 77 / 78, avec ou sans +221 (ex. `77 123 45 67`) | « Format attendu : 77 123 45 67. » |
| 5 | **Mot de passe** | Minimum 8 caractères, avec au moins 1 minuscule, 1 majuscule et 1 chiffre (max 72) | Indicateur de force affiché (faible / moyen / fort) |
| 6 | **Confirmation** | Doit être identique au mot de passe | « Les mots de passe ne correspondent pas. » |
| 7 | **CGU + confidentialité** | Case obligatoire à cocher | « Vous devez accepter les CGU et la politique de confidentialité. » |

Puis cliquer sur **« Créer mon compte »**.

### Étape 3 — Ce qui se passe côté système (transparent pour l'utilisateur)

Ordre exact du traitement (`POST /register-enrolled-student` → RPC SQL `finish_enrolled_student_registration`) :

1. Vérifications : limite de tentatives (10 / 5 min), maintenance, inscriptions ouvertes, abonnement de l'école valide.
2. L'école est retrouvée grâce au matricule saisi à l'étape 1.
3. Création de la session d'authentification avec le rôle `eleve`.
4. **Vérification d'identité** : recherche de la fiche élève par matricule **dans cette école**, puis comparaison de la **date de naissance** :
   - matricule introuvable OU date différente → **refus** avec message volontairement générique (« Vérification d'identité échouée ») pour empêcher de deviner les données d'un autre élève ;
   - l'élève a déjà un compte → « Un compte existe déjà pour cet élève. »
5. Si tout est bon : création du **profil**, immédiatement **ACTIF**, rattaché à la fiche scolaire existante (matières, notes, emplois du temps apparaissent tout de suite).
6. Si une étape échoue, le compte d'accès est **automatiquement supprimé** (jamais de compte « fantôme »).

### Étape 4 — Après la création

- L'utilisateur est déconnecté automatiquement et redirigé vers `/connexion`.
- Message affiché : « Compte créé pour [Prénom Nom] : connectez-vous avec le matricule de l'école, votre e-mail et votre mot de passe. »

### 🔑 Connexion élève (à montrer en fin de tuto)

La connexion (`/connexion`) demande **3 champs** : **matricule de l'école** + **e-mail** + **mot de passe**.
> Le matricule d'élève ne sert qu'à la création du compte ; ensuite on se connecte avec le matricule de l'**école**.

---

## 4. Créer un compte PARENT — procédure exacte

### Étape 0 — Ce que le parent doit avoir en main

1. **Le matricule de l'école** (5 caractères).
2. **Le code élève de son enfant** (6 caractères) — remis par l'école lors de l'inscription de l'enfant.

### Étape 1 — Accéder au formulaire

- URL : `/inscription`
- Choisir le rôle **Parent**.
- Saisir le **matricule de l'école** (5 caractères).

### Étape 2 — Remplir le formulaire (`ParentSignupForm`)

Champs, dans l'ordre, **tous obligatoires** :

| # | Champ | Règle exacte | Message d'erreur si invalide |
|---|---|---|---|
| 1 | **Prénom** | Minimum 2 caractères (après suppression des espaces) | « Le prénom est obligatoire. » |
| 2 | **Nom** | Minimum 2 caractères | « Le nom est obligatoire. » |
| 3 | **Téléphone** | Numéro sénégalais à 9 chiffres (70/75/76/77/78, avec ou sans +221) | « Format attendu : 77 123 45 67. » |
| 4 | **Adresse e-mail** | Format valide ; servira d'identifiant ; **doit être unique** | « Saisissez une adresse e-mail valide. » / « Un compte existe déjà avec cet e-mail. » |
| 5 | **Code élève** | Exactement **6 caractères**, MAJUSCULES (alphabet sans 0/O/1/I) ; doit correspondre à un élève de cette école | « Le code comporte 6 caractères. » / « Code élève introuvable dans cette école. Vérifiez le code reçu auprès de l'école. » |
| 6 | **Mot de passe** | Min. 8 caractères : 1 minuscule + 1 majuscule + 1 chiffre (max 72) | Indicateur de force affiché |
| 7 | **Confirmation** | Identique au mot de passe | « Les mots de passe ne correspondent pas. » |
| 8 | **CGU + confidentialité** | Case obligatoire | « Vous devez accepter les CGU et la politique de confidentialité. » |

Puis cliquer sur **« Envoyer ma demande »** (⚠️ ce n'est PAS « Créer mon compte » — différence importante à souligner dans le tuto).

### Étape 3 — Ce qui se passe côté système

Ordre exact (`POST /register-parent` → RPC `finish_parent_registration`) :

1. Mêmes vérifications que pour l'élève (limite, maintenance, inscriptions ouvertes, abonnement).
2. **Pré-vérification du code élève** : le code doit correspondre à un élève de cette école, sinon refus immédiat.
3. Création de la session d'authentification avec le rôle `parent`.
4. Création de la **fiche parent** (prénom, nom, téléphone, e-mail) et **rattachement immédiat à l'enfant** correspondant au code élève.
5. Création du **profil parent** avec le statut **EN_ATTENTE** (contrairement à l'élève qui est actif tout de suite).
6. Création d'une **demande d'inscription** adressée à la direction.
7. **Validation automatique possible** : si l'école a activé l'option « auto-approbation des élèves/parents », le compte passe directement en **ACTIF** sans intervention de la direction.

### Étape 4 — Après l'envoi

- Redirection vers `/inscription-envoyee` avec le message : « Demande envoyée à l'école. »
- Le parent reçoit le nom de l'enfant rattaché à l'écran.

### Étape 5 — Validation par la direction (si pas d'auto-approbation)

- La direction voit la demande dans **Espace direction → Élèves → Demandes** (`/app/eleves/demandes`).
- Elle peut **Approuver** (compte → ACTIF) ou **Refuser** (avec motif).
- **Tant que la demande est EN_ATTENTE, le parent ne peut PAS se connecter** : le message affiché est « Votre demande d'inscription est en attente de validation par votre école. »

### 🔑 Connexion parent (fin de tuto)

Identique à l'élève : **matricule de l'école** + **e-mail** + **mot de passe**.

### 👨‍👩‍👧 Ajouter un autre enfant (fratrie)

Une fois connecté, le parent peut rattacher un autre enfant depuis son espace via la fonction **« Lier un enfant »** : il saisit simplement le **code élève** du second enfant (6 caractères). Aucune nouvelle inscription n'est nécessaire ; la même fiche parent est réutilisée. Message si l'enfant est déjà rattaché : « Cet enfant est déjà rattaché à votre compte. »

---

## 5. Règles communes à connaître pour les tutos

### Mot de passe (identique partout)

- Minimum **8 caractères**
- Au moins **1 minuscule**, **1 majuscule**, **1 chiffre**
- Maximum 72 caractères
- Confirmation obligatoire à la saisie

### E-mail

- Unique sur toute la plateforme (pas seulement par école) → « Un compte existe déjà avec cet e-mail. »
- Sert d'identifiant de connexion
- En cas d'oubli : « Mot de passe oublié » envoie un e-mail de réinitialisation (sans révéler si le compte existe).

### Téléphone

- Sénégal uniquement : 9 chiffres, préfixes mobiles 70 / 75 / 76 / 77 / 78, `+221` facultatif.

### Statuts de compte (3 états possibles)

| Statut | Signification | Connexion possible ? |
|---|---|---|
| **ACTIF** | Validé | ✅ Oui |
| **EN_ATTENTE** | Demande en cours (parent, ou élève via l'ancien flux) | ❌ Non — « en attente de validation par votre école » |
| **DESACTIVE** | Désactivé par la direction | ❌ Non — « Ce compte a été désactivé par la direction de votre école » |

### Ce qui n'existe PAS (important pour ne pas induire en erreur dans les tutos)

- ❌ Pas d'inscription élève/parent **sans code** (matricule d'élève ou code élève) : impossible.
- ❌ Pas de mot de passe temporaire généré ni envoyé par e-mail pour élèves/parents : **chacun choisit son mot de passe** lui-même. (Seul le personnel créé par le directeur reçoit un mot de passe défini par lui, à changer à la 1ʳᵉ connexion.)
- ❌ Pas d'invitation par lien e-mail.
- ❌ Un élève ne choisit pas sa classe à la création de compte : sa classe vient de sa **fiche d'inscription** faite par la direction.

---

## 6. Résumé visuel pour le scénario vidéo

```
┌──────────────────────────── ÉLÈVE ────────────────────────────┐
│ Direction : inscrit l'élève → remet matricule élève EC…      │
│ Élève : /inscription → rôle Élève → matricule ÉCOLE (5 car.) │
│   → matricule ÉLÈVE + date de naissance + e-mail + tél.      │
│   + mot de passe (+ confirmation) + CGU                      │
│   → « Créer mon compte » → compte ACTIF immédiatement        │
│ Connexion : matricule ÉCOLE + e-mail + mot de passe          │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────── PARENT ───────────────────────────┐
│ École : remet le CODE ÉLÈVE de l'enfant (6 car.)             │
│ Parent : /inscription → rôle Parent → matricule ÉCOLE (5 car)│
│   → prénom + nom + tél. + e-mail + CODE ÉLÈVE                │
│   + mot de passe (+ confirmation) + CGU                      │
│   → « Envoyer ma demande » → statut EN_ATTENTE               │
│ Direction : approuve la demande (ou auto-approbation active) │
│   → compte ACTIF                                             │
│ Connexion : matricule ÉCOLE + e-mail + mot de passe          │
│ Fratrie : espace parent → « Lier un enfant » → code élève    │
└──────────────────────────────────────────────────────────────┘
```

### Différences clés Élève vs Parent (récapitulatif tableau)

| Point | Élève | Parent |
|---|---|---|
| Code requis | Matricule d'élève (`EC…`) | Code élève de l'enfant (6 car.) |
| Preuve d'identité | Date de naissance (doit correspondre à la fiche) | — (le code élève suffit) |
| Identité déclarée | Non (vient de la fiche) | Prénom + nom + tél. + e-mail |
| Statut à la création | **ACTIF** immédiatement | **EN_ATTENTE** (validation direction, sauf auto-approbation) |
| Bouton du formulaire | « Créer mon compte » | « Envoyer ma demande » |
| Rattachement enfant | Automatique (fiche existante) | Via le code élève ; autres enfants via « Lier un enfant » |
