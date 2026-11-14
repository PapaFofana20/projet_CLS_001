-- ============================================================================
-- SCOLIA — Fondation du schéma (phase 1)
-- Tables métier, index, contraintes. Toutes les tables porteuses de données
-- portent school_id (isolation multi-écoles). RLS activée partout ; les
-- politiques d'accès sont ajoutées par les migrations suivantes.
-- ============================================================================

-- Extensions -----------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

-- Domaines -------------------------------------------------------------------
create domain app_cycle      as text check (value in ('elementaire', 'moyen', 'secondaire'));
create domain app_role       as text check (value in ('directeur','econome','surveillant','instituteur','professeur','eleve','parent'));
create domain app_user_status as text check (value in ('ACTIF','EN_ATTENTE','DESACTIVE'));
create domain app_period_type as text check (value in ('semestre','trimestre'));
create domain app_pay_method as text check (value in ('wave','orange_money','free_money','especes'));
create domain app_payment_kind as text check (value in ('inscription','mensualite','tenue'));
create domain app_payment_status as text check (value in ('paye','partiel','en_retard','a_venir'));
create domain app_absence_type as text check (value in ('absence','retard','discipline'));
create domain app_request_status as text check (value in ('EN_ATTENTE','APPROUVEE','REFUSEE'));
create domain app_teacher_kind as text check (value in ('instituteur','professeur'));
create domain app_gender      as text check (value in ('F','M'));
create domain app_plan_id     as text check (value in ('essentiel','pro','premium','illimite'));

-- Vérification de listes de cycles (utilisable dans une contrainte CHECK) -----
create or replace function app_valid_cycles(cycles text[]) returns boolean
language sql immutable parallel safe
as $$
  select exists (
    select 1 from unnest(cycles) c
    where c in ('elementaire','moyen','secondaire')
    having count(distinct c) = cardinality(cycles)
  );
$$;

-- ============================================================================
-- Référentiels globaux (sans school_id)
-- ============================================================================

-- Niveaux (CI … Terminale) : référentiel partagé, jamais muté par les écoles.
create table public.levels (
  id     text primary key,
  label  text not null unique,
  cycle  app_cycle not null,
  level_order int not null,
  exam   text
);

-- Plans d'abonnement (prix en FCFA).
create table public.plans (
  id            app_plan_id primary key,
  name          text not null,
  tagline       text not null default '',
  student_limit int check (student_limit > 0), -- null = illimité
  monthly_price int not null check (monthly_price >= 0),
  yearly_price  int not null check (yearly_price >= 0),
  features      text[] not null default '{}',
  highlight     boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- Écoles et abonnements
-- ============================================================================

create table public.schools (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  -- Matricule à 5 caractères : null tant qu'aucun paiement n'est confirmé,
  -- jamais modifié ensuite (écriture réservée au webhook de paiement).
  matricule            text unique check (matricule is null or length(matricule) = 5),
  city                 text not null default '',
  address              text not null default '',
  phone                text not null default '',
  email                text not null default '',
  logo_url             text,
  cycles               app_cycle[] not null default '{}',
  registration_open    boolean not null default true,
  auto_approve_students boolean not null default false,
  created_at           timestamptz not null default now()
);

-- NOT VALID n'est accepté que dans ALTER TABLE ... ADD CONSTRAINT (pas dans
-- CREATE TABLE) : la contrainte est créée non validée, puis validée après le
-- backfill des écoles existantes.
alter table public.schools
  add constraint schools_cycles_required check (app_valid_cycles(cycles)) not valid;

create table public.school_settings (
  school_id        uuid primary key references public.schools (id) on delete cascade,
  school_year      text not null default '2026-2027' check (school_year ~ '^\d{4}-\d{4}$'),
  period_type      app_period_type not null default 'semestre',
  current_period   text not null default 'S1',
  -- Frais annexes annuels, en FCFA. Le front lit {cantine, transport, tenue}.
  annex_fees       jsonb not null default '{"cantine": 0, "transport": 0, "tenue": 0}'::jsonb,
  sibling_discount numeric not null default 10 check (sibling_discount between 0 and 100),
  created_at       timestamptz not null default now()
);

-- Frais par niveau (remplace settings.fees côté front).
create table public.level_fees (
  school_id   uuid not null references public.schools (id) on delete cascade,
  level_id    text not null references public.levels (id),
  inscription int not null check (inscription >= 0),
  mensualite  int not null check (mensualite >= 0),
  created_at  timestamptz not null default now(),
  primary key (school_id, level_id)
);

-- Un ABO NEMENT COURANT par école ; l'historique complet vit dans
-- subscription_events. Aucune politique d'écriture client : seul le webhook
-- (service_role) insère / met à jour.
create table public.subscriptions (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null unique references public.schools (id) on delete cascade,
  plan_id       app_plan_id not null references public.plans (id),
  -- Statut calculé (voir subscription_info) : jamais stocké « ACTIF » par le client.
  ends_at       date,
  starts_at     date,
  student_limit int check (student_limit > 0),
  amount_paid   int not null default 0 check (amount_paid >= 0),
  payment_ref   text not null default '',
  method        app_pay_method,
  paid_at       timestamptz,
  created_at    timestamptz not null default now()
);

-- Historique immuable des mouvements d'abonnement.
create table public.subscription_events (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  event_type  text not null check (event_type in ('purchase','renewal','plan_change','expiration_warning')),
  plan_id     app_plan_id,
  amount_paid int,
  payment_ref text,
  method      app_pay_method,
  starts_at   date,
  ends_at     date,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Compteur par école / nom / année (matricules élèves EC<année><n°>).
create table public.counters (
  school_id uuid not null references public.schools (id) on delete cascade,
  counter   text not null,
  year      text not null,
  value     int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (school_id, counter, year)
);

-- ============================================================================
-- Personnes : comptes, enseignants, parents, élèves
-- ============================================================================

create table public.teachers (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  kind        app_teacher_kind not null,
  first_name  text not null,
  last_name   text not null,
  email       text not null,
  phone       text not null default '',
  specialties text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create table public.parents (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools (id) on delete cascade,
  first_name text not null,
  last_name  text not null,
  phone      text not null default '',
  email      text not null default '',
  address    text not null default '',
  created_at timestamptz not null default now()
);

create table public.class_rooms (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools (id) on delete cascade,
  name            text not null,
  level_id        text not null references public.levels (id),
  cycle           app_cycle not null,
  series          text,
  head_teacher_id uuid references public.teachers (id) on delete set null,
  capacity        int not null default 40 check (capacity between 1 and 500),
  created_at      timestamptz not null default now(),
  unique (school_id, name)
);

create table public.students (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  matricule   text not null,
  child_code  text not null check (child_code ~ '^[2-9A-HJ-NP-Z]{6}$'),
  first_name  text not null,
  last_name   text not null,
  gender      app_gender not null,
  birth_date  date,
  class_id    uuid not null references public.class_rooms (id) on delete restrict,
  parent_id   uuid references public.parents (id) on delete set null,
  options     jsonb not null default '{"cantine": false, "transport": false, "tenue": false}'::jsonb,
  enrolled_at date not null default current_date,
  created_at  timestamptz not null default now(),
  unique (school_id, matricule),
  unique (school_id, child_code)
);

create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  school_id            uuid not null references public.schools (id) on delete cascade,
  role                 app_role not null,
  status               app_user_status not null default 'EN_ATTENTE',
  first_name           text not null,
  last_name            text not null,
  phone                text not null default '',
  email                text not null unique,
  must_change_password boolean not null default false,
  teacher_id           uuid references public.teachers (id) on delete set null,
  parent_id            uuid references public.parents (id) on delete set null,
  student_id           uuid references public.students (id) on delete set null,
  created_at           timestamptz not null default now()
);

-- ============================================================================
-- Structure pédagogique
-- ============================================================================

create table public.subjects (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools (id) on delete cascade,
  name       text not null,
  cycles     app_cycle[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

-- Idem schools_cycles_required : NOT VALID uniquement via ALTER TABLE.
alter table public.subjects
  add constraint subjects_cycles_valid check (app_valid_cycles(cycles)) not valid;

create table public.class_subjects (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  class_id    uuid not null references public.class_rooms (id) on delete cascade,
  subject_id  uuid not null references public.subjects (id) on delete cascade,
  coefficient numeric not null default 1 check (coefficient >= 1 and coefficient <= 10),
  created_at  timestamptz not null default now(),
  unique (school_id, class_id, subject_id)
);

create table public.teaching_assignments (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools (id) on delete cascade,
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  class_id   uuid not null references public.class_rooms (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (school_id, teacher_id, class_id, subject_id)
);

-- ============================================================================
-- Notes et bulletins
-- ============================================================================

create table public.grades (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  class_id    uuid not null references public.class_rooms (id) on delete cascade,
  subject_id  uuid not null references public.subjects (id) on delete cascade,
  period      text not null,
  devoir1     numeric(4,2) check (devoir1 between 0 and 20),
  devoir2     numeric(4,2) check (devoir2 between 0 and 20),
  composition numeric(4,2) check (composition between 0 and 20),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (school_id, student_id, class_id, subject_id, period)
);

create table public.report_metas (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  period     text not null,
  conduct    text not null default '',
  absences   int not null default 0 check (absences >= 0),
  comment    text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, student_id, period)
);

-- ============================================================================
-- Paiements
-- ============================================================================

-- Échéancier d'une famille. status est matérialisé et maintenu par un trigger
-- (phase paiements) ; il reflète toujours paid_amount / due_date.
create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  kind        app_payment_kind not null,
  label       text not null,
  due_date    date not null,
  amount      int not null check (amount >= 0),
  paid_amount int not null default 0 check (paid_amount between 0 and amount),
  status      app_payment_status not null default 'a_venir',
  method      app_pay_method,
  paid_at     timestamptz,
  reference   text,
  created_at  timestamptz not null default now(),
  unique (school_id, student_id, kind, label, due_date)
);

-- Toute tentative de paiement : le registre qui fait foi.
create table public.payment_transactions (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools (id) on delete cascade,
  -- 'subscription' (abonnement école) ou 'installment' (échéance famille).
  tx_kind      text not null check (tx_kind in ('subscription','installment')),
  payment_id   uuid references public.payments (id) on delete set null,
  provider     text not null,
  provider_ref text not null,
  amount       int not null check (amount > 0),
  method       app_pay_method not null,
  phone        text not null,
  status       text not null default 'pending' check (status in ('pending','succeeded','failed')),
  payload      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (provider, provider_ref)
);

-- ============================================================================
-- Messagerie, annonces, absences
-- ============================================================================

create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  teacher_id  uuid not null references public.teachers (id) on delete cascade,
  parent_id   uuid not null references public.parents (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  subject     text not null default '',
  created_at  timestamptz not null default now(),
  unique (school_id, teacher_id, parent_id, student_id)
);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null,
  text            text not null check (length(text) between 1 and 4000),
  created_at      timestamptz not null default now()
);

create table public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  actor_id        uuid not null,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, actor_id)
);

create table public.announcements (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools (id) on delete cascade,
  title          text not null check (length(title) between 1 and 200),
  body           text not null check (length(body) between 1 and 4000),
  author         text not null default 'Direction',
  -- audience_all = true → visible de tous ; sinon liste de rôles ciblés.
  audience_all   boolean not null default true,
  audience_roles text[] not null default '{}',
  created_at     timestamptz not null default now()
);

create table public.absences (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  absence_date date not null,
  absence_type app_absence_type not null,
  motif      text not null default '',
  justified  boolean not null default false,
  sanction   text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Demandes d'inscription, contact public, audit
-- ============================================================================

create table public.registration_requests (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('eleve','parent')),
  first_name  text not null,
  last_name   text not null,
  email       text not null,
  phone       text not null default '',
  gender      app_gender,
  birth_date  date,
  class_id    uuid references public.class_rooms (id) on delete set null,
  child_code  text,
  status      app_request_status not null default 'EN_ATTENTE',
  decided_at  date,
  reason      text,
  created_at  timestamptz not null default now()
);

-- Formulaire public : insert-only, jamais lisible par anon/authenticated.
create table public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone      text not null default '',
  school     text,
  subject    text not null,
  message    text not null,
  created_at timestamptz not null default now()
);

-- Audit : qui, quoi, quand ; alimenté par triggers, lisible par service_role.
create table public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid,
  actor_id   uuid,
  actor_role text,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Index
-- ============================================================================

create index idx_teachers_school      on public.teachers   (school_id);
create index idx_parents_school       on public.parents    (school_id);
create index idx_class_rooms_school   on public.class_rooms(school_id);
create index idx_class_rooms_level    on public.class_rooms(school_id, level_id);
create index idx_class_rooms_head     on public.class_rooms(head_teacher_id);
create index idx_students_school      on public.students   (school_id);
create index idx_students_class       on public.students   (school_id, class_id);
create index idx_students_parent      on public.students   (school_id, parent_id);
create index idx_students_matricule   on public.students   (school_id, matricule);
create index idx_students_child_code  on public.students   (school_id, child_code);
create index idx_profiles_school      on public.profiles   (school_id);
create index idx_profiles_role        on public.profiles   (school_id, role, status);
create index idx_profiles_teacher     on public.profiles   (teacher_id);
create index idx_profiles_parent      on public.profiles   (parent_id);
create index idx_profiles_student     on public.profiles   (student_id);
create index idx_subjects_school      on public.subjects   (school_id);
create index idx_class_subjects_class on public.class_subjects (school_id, class_id);
create index idx_class_subjects_subj  on public.class_subjects (school_id, subject_id);
create index idx_assignments_teacher  on public.teaching_assignments (school_id, teacher_id);
create index idx_assignments_class    on public.teaching_assignments (school_id, class_id);
create index idx_grades_lookup        on public.grades     (school_id, class_id, subject_id, period);
create index idx_grades_student       on public.grades     (school_id, student_id, period);
create index idx_report_metas_student on public.report_metas (school_id, student_id, period);
create index idx_payments_school      on public.payments   (school_id);
create index idx_payments_student     on public.payments   (school_id, student_id);
create index idx_payments_status      on public.payments   (school_id, status, due_date);
create index idx_transactions_school  on public.payment_transactions (school_id, created_at desc);
create index idx_conversations_school on public.conversations (school_id);
create index idx_conversations_teacher on public.conversations (teacher_id);
create index idx_conversations_parent  on public.conversations (parent_id);
create index idx_conversations_student on public.conversations (student_id);
create index idx_messages_conversation on public.messages (conversation_id, created_at);
create index idx_messages_school        on public.messages (school_id);
create index idx_announcements_school   on public.announcements (school_id, created_at desc);
create index idx_absences_school        on public.absences (school_id, absence_date);
create index idx_absences_student       on public.absences (school_id, student_id);
create index idx_requests_school        on public.registration_requests (school_id, status, created_at);
create index idx_requests_user          on public.registration_requests (user_id);
create index idx_audit_log_school       on public.audit_log (school_id, created_at desc);
create index idx_subscription_events    on public.subscription_events (school_id, created_at desc);
create index idx_schools_matricule      on public.schools (lower(matricule) nulls last);

-- ============================================================================
-- RLS : activée immédiatement, sans politique = blocage total par défaut.
-- Les politiques arrivent phase par phase, jamais l'inverse.
-- ============================================================================

alter table public.levels                  enable row level security;
alter table public.plans                   enable row level security;
alter table public.schools                 enable row level security;
alter table public.school_settings         enable row level security;
alter table public.level_fees              enable row level security;
alter table public.subscriptions           enable row level security;
alter table public.subscription_events     enable row level security;
alter table public.counters                enable row level security;
alter table public.teachers                enable row level security;
alter table public.parents                 enable row level security;
alter table public.class_rooms             enable row level security;
alter table public.students                enable row level security;
alter table public.profiles                enable row level security;
alter table public.subjects                enable row level security;
alter table public.class_subjects          enable row level security;
alter table public.teaching_assignments    enable row level security;
alter table public.grades                  enable row level security;
alter table public.report_metas            enable row level security;
alter table public.payments                enable row level security;
alter table public.payment_transactions    enable row level security;
alter table public.conversations           enable row level security;
alter table public.messages                enable row level security;
alter table public.conversation_reads      enable row level security;
alter table public.announcements           enable row level security;
alter table public.absences                enable row level security;
alter table public.registration_requests   enable row level security;
alter table public.contact_messages        enable row level security;
alter table public.audit_log               enable row level security;
