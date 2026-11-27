-- ============================================================================
-- SCOLIA — Fonctions utilitaires RLS (phase 1)
-- Toutes les politiques s'appuient sur ces fonctions. Elles déduisent
-- l'identité du JWT / des profils, JAMAIS des paramètres fournis par le client.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Identité (stable, déduite du auth.uid())
-- ----------------------------------------------------------------------------

-- SCOLIA (audit) : la source de vérité est le PROFIL, pas le JWT. Un jeton
-- émis avant une révocation / un changement de rôle resterait sinon valable
-- jusqu'à son expiration. Le claim app_metadata ne sert plus que de fallback
-- (profil pas encore créé, par exemple pendant l'inscription).
create or replace function public.current_school_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.school_id from public.profiles p where p.id = auth.uid()),
    nullif(auth.jwt() -> 'app_metadata' ->> 'school_id', '')::uuid
  )
$$;

create or replace function public.current_role() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = auth.uid()),
    nullif(auth.jwt() -> 'app_metadata' ->> 'role', '')
  )
$$;

create or replace function public.current_teacher_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.teacher_id from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.current_parent_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.parent_id from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.current_student_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.student_id from public.profiles p where p.id = auth.uid()
$$;

-- Un profil ACTIF ET rattaché à une école : sinon rien n'est lisible.
create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'ACTIF'
      and p.school_id is not null
  )
$$;

-- Un compte avec mot de passe temporaire ne lit/écrit rien tant qu'il n'a pas
-- changé son mot de passe (équivalent serveur du MustChangePasswordGuard).
create or replace function public.password_changed() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select not p.must_change_password from public.profiles p where p.id = auth.uid()), false)
$$;

-- ----------------------------------------------------------------------------
-- Abonnement (mêmes règles que src/utils/subscription.ts)
-- READ_ONLY_DAYS = 7 : après l'échéance, lecture seule ≤ 7 jours, puis blocage.
-- ----------------------------------------------------------------------------

create or replace function public.subscription_status_of(
  p_school_id uuid,
  p_ends_at date,
  p_today date default current_date
) returns text
language sql stable parallel safe as $$
  -- Identique à computeSubscriptionInfo (frontend/src/utils/subscription.ts) :
  -- ACTIF tant que l'échéance n'est pas passée, EXPIRE dès qu'elle l'est.
  select case
    when p_ends_at is null then 'AUCUN'
    when p_ends_at < p_today then 'EXPIRE'
    else 'ACTIF'
  end
$$;

create type public.subscription_info_result as (
  status text,
  days_left int,
  read_only boolean,
  blocked boolean,
  student_limit int,
  active_students int,
  limit_reached boolean,
  plan_id text,
  plan_name text
);

-- Retourne toujours une ligne (AUCUN si pas d'abonnement), comme le front.
create or replace function public.subscription_info(p_school_id uuid)
returns public.subscription_info_result
language sql stable security definer set search_path = '' as $$
  select
    coalesce(public.subscription_status_of(s.school_id, s.ends_at), 'AUCUN'),
    coalesce(s.ends_at - current_date, 0),
    coalesce(s.ends_at < current_date and s.ends_at >= current_date - 7, false),
    coalesce(s.ends_at < current_date - 7, false),
    s.student_limit,
    (select count(*) from public.students st where st.school_id = p_school_id),
    coalesce(s.student_limit is not null
      and s.student_limit <= (select count(*) from public.students st where st.school_id = p_school_id), false),
    s.plan_id,
    pl.name
  from (values (p_school_id)) as q(school_id)
  left join public.subscriptions s on s.school_id = q.school_id
  left join public.plans pl on pl.id = s.plan_id
$$;

-- Écriture autorisée : abonnement non expiré (échéance ≥ aujourd'hui) ; ou
-- aucun abonnement du tout (« AUCUN » — l'école attend son premier achat et
-- peut déjà créer sa structure pédagogique). Si l'échéance est passée, écriture
-- bloquée (fenêtre de lecture seule puis blocage total).
-- SCOLIA (audit M14) : ces helpers sont appelables par authenticated ; on
-- refuse toute école différente de celle du profil connecté (sinon sonde
-- d'état d'abonnement inter-écoles).
create or replace function public.school_is_writable(p_school_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  -- service_role / postgres (Edge Functions, webhooks, tâches support) sont
  -- légitimement inter-écoles : seul un client authentifié est borné.
  select (auth.role() = 'service_role'
          or session_user in ('postgres', 'supabase_admin')
          or coalesce(p_school_id = public.current_school_id(), false))
     and (
       exists(
         select 1 from public.subscriptions s
         where s.school_id = p_school_id and s.ends_at >= current_date
         limit 1
       ) or not exists(select 1 from public.subscriptions s where s.school_id = p_school_id)
     )
$$;

-- Lecture autorisée pendant la fenêtre de lecture seule (≤ 7 jours après
-- l'échéance), puis bloquée. Les tables de facturation (schools, subscriptions,
-- plans) restent lisibles pour permettre le renouvellement.
create or replace function public.school_is_readable(p_school_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  -- service_role / postgres (Edge Functions, webhooks, tâches support) sont
  -- légitimement inter-écoles : seul un client authentifié est borné.
  select (auth.role() = 'service_role'
          or session_user in ('postgres', 'supabase_admin')
          or coalesce(p_school_id = public.current_school_id(), false))
     and (
       exists(
         select 1 from public.subscriptions s
         where s.school_id = p_school_id and s.ends_at >= current_date - 7
         limit 1
       ) or not exists(select 1 from public.subscriptions s where s.school_id = p_school_id)
     )
$$;

-- ----------------------------------------------------------------------------
-- Matricules / codes (génération côté SQL, à la place de utils/matricule.ts)
-- Alphabet (32 caractères) sans 0, O, 1, I : 23456789 + ABCDEFGH + JKLMN + PQRSTUVWXYZ.
-- ----------------------------------------------------------------------------

create or replace function public.app_random_code(p_length int) returns text
language sql volatile parallel unsafe
-- pgcrypto (gen_random_bytes) est installé dans le schéma `extensions` : sans
-- cette clause, l'appel depuis une fonction SECURITY DEFINER dont le
-- search_path est `public` échouait ('function gen_random_bytes(integer)
-- does not exist'), et donc toute génération de code ou de matricule.
set search_path = public, extensions as $$
  -- Alphabet de 32 caractères : 23456789 + ABCDEFGH + JKLMN + PQRSTUVWXYZ.
  select string_agg(
    substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + (get_byte(gen_random_bytes(1), 0) % 32)::int, 1), ''
  )
  from generate_series(1, p_length)
$$;

-- Code élève unique par école : gen_random + réessai en cas de collision.
create or replace function public.generate_school_code(p_school_id uuid, p_length int, p_column text)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_code text;
  v_taken boolean;
begin
  if p_length not in (5, 6) then
    raise exception 'Longueur de code invalide.';
  end if;
  for attempt in 1..50 loop
    v_code := public.app_random_code(p_length);
    select exists (
      select 1
      from public.students s
      where s.school_id = p_school_id
        and ((p_column = 'matricule' and s.matricule = v_code)
          or (p_column = 'child_code' and s.child_code = v_code))
    ) into v_taken;
    if not v_taken then
      return v_code;
    end if;
  end loop;
  raise exception 'Impossible de générer un code unique à cette école, réessayez.';
end;
$$;

-- Matricule élève : séquence EC<année scolaire><n° incl. compteur par école>.
create or replace function public.next_student_matricule(p_school_id uuid, p_school_year text)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_seq int;
begin
  insert into public.counters (school_id, counter, year, value)
  values (p_school_id, 'student_matricule', p_school_year, 1)
  on conflict (school_id, counter, year) do update
    set value = public.counters.value + 1,
        updated_at = now()
  returning value into v_seq;
  -- Format identique à la démo : EC26XXXX (« 26 » = année de début de l'année scolaire).
  return 'EC' || left(p_school_year, 2) || lpad(v_seq::text, 4, '0');
end;
$$;

-- ----------------------------------------------------------------------------
-- Année scolaire / périodes (de school_settings, jamais figées)
-- ----------------------------------------------------------------------------

create or replace function public.school_year_label()
returns text
language sql stable security definer set search_path = '' as $$
  select p.school_year from public.school_settings p where p.school_id = public.current_school_id()
$$;

revoke execute on function public.next_student_matricule(uuid, text) from anon, public;
grant execute on function public.next_student_matricule(uuid, text) to authenticated;

revoke execute on function public.generate_school_code(uuid, int, text) from anon, public;
grant execute on function public.generate_school_code(uuid, int, text) to authenticated;

revoke execute on function public.subscription_info(uuid) from anon, public;
grant execute on function public.subscription_info(uuid) to authenticated;

revoke execute on function public.school_is_writable(uuid) from anon, public;
grant execute on function public.school_is_writable(uuid) to authenticated;

revoke execute on function public.school_is_readable(uuid) from anon, public;
grant execute on function public.school_is_readable(uuid) to authenticated;
