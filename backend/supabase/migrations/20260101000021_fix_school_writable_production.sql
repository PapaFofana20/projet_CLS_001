-- ============================================================================
-- Migration : Correction production - exiger abonnement actif pour écritures
-- Supprime la clause OR NOT EXISTS qui autorisait les écritures sans abonnement
-- ============================================================================

-- ----------------------------------------------------------------------------
-- school_is_writable : seule une école AVEC abonnement actif (ends_at >= today)
-- peut écrire. Sans abonnement = lecture seule.
-- SCOLIA (audit M14) : refus d'une école autre que celle du profil connecté.
-- ----------------------------------------------------------------------------
create or replace function public.school_is_writable(p_school_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  -- service_role / postgres (Edge Functions, webhooks) sont inter-écoles ;
  -- seul un client authentifié est borné à la sienne (audit M14).
  select (auth.role() = 'service_role'
          or session_user in ('postgres', 'supabase_admin')
          or coalesce(p_school_id = public.current_school_id(), false))
     and exists(
       select 1 from public.subscriptions s
       where s.school_id = p_school_id and s.ends_at >= current_date
       limit 1
     )
$$;

-- ----------------------------------------------------------------------------
-- school_is_readable : école lisible si abonnement actif OU dans période grâce
-- (échéance jusqu'à 7 jours dans le passé). Au-delà = blocage total.
-- ----------------------------------------------------------------------------
create or replace function public.school_is_readable(p_school_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  -- service_role / postgres (Edge Functions, webhooks) sont inter-écoles ;
  -- seul un client authentifié est borné à la sienne (audit M14).
  select (auth.role() = 'service_role'
          or session_user in ('postgres', 'supabase_admin')
          or coalesce(p_school_id = public.current_school_id(), false))
     and exists(
       select 1 from public.subscriptions s
       where s.school_id = p_school_id and s.ends_at >= current_date - 7
       limit 1
     )
$$;

-- ----------------------------------------------------------------------------
-- Mise à jour de subscription_info pour refléter le nouveau comportement :
-- status = 'AUCUN' quand pas d'abonnement (au lieu de 'ACTIF' par défaut)
-- ----------------------------------------------------------------------------
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

-- Les permissions EXECUTE restent inchangées (service_role uniquement via RPCs)