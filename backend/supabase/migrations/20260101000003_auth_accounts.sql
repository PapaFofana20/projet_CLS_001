-- ============================================================================
-- SCOLIA — Phase 2 : Auth & comptes
-- Politiques RLS d'isolation (profiles, école, personnes), garde
-- must_change_password, table de rate limiting, RPC changement de mot de passe.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Rate limiting (clé = {endpoint}:{ip}) : lisible uniquement par service_role.
-- ----------------------------------------------------------------------------
create table public.rate_limits (
  key          text primary key,
  count        int not null default 0,
  window_start timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.rate_limits enable row level security;

create or replace function public.user_can_query_data() returns boolean
language sql stable security definer set search_path = '' as $$
  -- Compte ACTIF (approuvé, pas désactivé) ET mot de passe temporaire déjà
  -- changé (équivalent serveur du MustChangePasswordGuard).
  select public.is_active_user() and public.password_changed()
$$;

-- ----------------------------------------------------------------------------
-- École / référentiels
-- ----------------------------------------------------------------------------

-- Lecture de la MA PROPRE école seulement ; school_id vient du JWT.
create policy "schools_select_proprie_ecole" on public.schools
  for select to authenticated
  using (is_active_user() and id = current_school_id());

-- Niveaux : référentiel public non sensible (libellés d'examen).
create policy "levels_select_public" on public.levels
  for select to anon, authenticated
  using (true);

-- Formules : page publique « Abonnement ».
create policy "plans_select_public" on public.plans
  for select to anon, authenticated
  using (true);

-- ----------------------------------------------------------------------------
-- Profiles : soi-même + direction (personnel), et mise à jour générique restreinte
-- ----------------------------------------------------------------------------
create policy "profiles_select_self_ou_direction" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (user_can_query_data()
        and school_id = current_school_id()
        and public.current_role() in ('directeur', 'econome', 'surveillant'))
  );

-- L'utilisateur ne modifie QUE sa propre ligne, et uniquement des colonnes
-- non sensibles (grants par colonnes ci-dessous) : rôle, statut, rattachements
-- et e-mail ne sont modifiables que côté serveur.
create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

revoke update on public.profiles from authenticated, anon;
grant update (first_name, last_name, phone) on public.profiles to authenticated;

-- ----------------------------------------------------------------------------
-- Personnel : entièrement en lecture pour les comptes actifs de l'école
-- (création / modification / désactivation passent par les Edge Functions).
-- ----------------------------------------------------------------------------
create policy "teachers_select_ecole" on public.teachers
  for select to authenticated
  using (user_can_query_data() and school_id = current_school_id());

create policy "parents_select_ecole" on public.parents
  for select to authenticated
  using (user_can_query_data() and school_id = current_school_id());

-- Élèves : périmètre par rôle (identique à visibleStudents côté front).
create policy "students_select_ecole" on public.students
  for select to authenticated
  using (
    user_can_query_data()
    and school_id = current_school_id()
    and (
      public.current_role() in ('directeur', 'econome', 'surveillant')
      or (public.current_role() = 'eleve' and id = current_student_id())
      or (public.current_role() = 'parent' and parent_id = current_parent_id())
      or (
        public.current_role() in ('instituteur', 'professeur')
        and (
          class_id in (
            select ta.class_id from public.teaching_assignments ta
            where ta.teacher_id = current_teacher_id()
              and ta.school_id = current_school_id()
          )
          or class_id in (
            select c.id from public.class_rooms c
            where c.head_teacher_id = current_teacher_id()
              and c.school_id = current_school_id()
          )
        )
      )
    )
  );

-- ----------------------------------------------------------------------------
-- Demandes d'inscription : l'auteur voit sa demande, la direction celle de l'école.
-- Création / décision : Edge Functions uniquement (aucune politique d'écriture).
-- ----------------------------------------------------------------------------
create policy "registration_requests_select" on public.registration_requests
  for select to authenticated
  using (
    user_id = auth.uid()
    or (user_can_query_data()
        and public.current_role() = 'directeur'
        and school_id = current_school_id())
  );

-- ----------------------------------------------------------------------------
-- Paramètres école, abonnement : lecture pour son école (écriture en phase 3+).
-- ----------------------------------------------------------------------------
create policy "school_settings_select_ecole" on public.school_settings
  for select to authenticated
  using (user_can_query_data() and school_id = current_school_id());

create policy "level_fees_select_ecole" on public.level_fees
  for select to authenticated
  using (user_can_query_data() and school_id = current_school_id());

create policy "subscriptions_select_proprie_ecole" on public.subscriptions
  for select to authenticated
  using (is_active_user() and school_id = current_school_id());

create policy "subscription_events_select_proprie_ecole" on public.subscription_events
  for select to authenticated
  using (is_active_user() and school_id = current_school_id());

-- ----------------------------------------------------------------------------
-- Confirmation de changement de mot de passe (compte créé par la direction).
-- Le client fait updateUser({ password }) via l'API Auth, puis appelle ce RPC
-- QUI NE FAIT QUE JOURNALISER : le drapeau must_change_password est levé par
-- le trigger sur auth.users (voir 00049), jamais par cette RPC (audit C3).
-- ----------------------------------------------------------------------------
create or replace function public.complete_password_change()
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Vous devez être connecté.';
  end if;
  if not public.is_active_user() then
    raise exception 'Votre compte n''est pas actif.';
  end if;
  insert into public.audit_log (school_id, actor_id, actor_role, action, entity, entity_id)
  values (public.current_school_id(), v_uid, public.current_role(), 'password_change', 'profiles', v_uid);
end;
$$;

grant execute on function public.complete_password_change() to authenticated;

-- Formulaire de contact public : insertion anonyme autorisée, jamais lisible.
create policy "contact_messages_insert_anon" on public.contact_messages
  for insert to anon
  with check (true);
