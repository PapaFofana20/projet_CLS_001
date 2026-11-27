-- ============================================================================
-- 00043 — Durcissement vague 4 de l'audit (04/11/2026).
--
--   1. (H-14) Supprimer la surcharge MORTE subscription_status_of(uuid, timestamptz)
--      créée par erreur en 00038, et restaurer la vraie logique EXPIRE_BIENTOT
--      dans subscription_status_of(uuid, date, date).
--   2. (H-15) Policy admin_agents_select_superadmin : récursion RLS infinie
--      (erreur 42P17, lecture impossible côté JWT) → fonction SECURITY DEFINER.
--   3. (M-17) 00041 a oublié 'secretaire' dans grades_select_scoped et
--      report_metas_select_scoped (régression fail-closed vs 00029).
--   4. (M-21) Révoquer CREATE sur le schéma public pour public/anon/authenticated.
--   5. (M-5) admin_revoke_user_sessions(uuid) : révocation des refresh tokens /
--      sessions (appelée par l'API avec service_role à la désactivation d'un compte).
--   6. (M-18) verify_matricule : plus appelable par anon/authenticated (passage
--      obligatoire par l'API Express, rate-limitée par IP).
--   7. (M-20) contact_messages : bornes de longueur + anti-spam (3 / heure / e-mail).
--
-- Idempotente : peut être rejouée sans erreur.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. (H-14) Surcharge morte + vraie fonction EXPIRE_BIENTOT
-- ----------------------------------------------------------------------------
drop function if exists public.subscription_status_of(uuid, timestamptz);

create or replace function public.subscription_status_of(
  p_school_id uuid,
  p_ends_at date,
  p_today date default current_date
) returns text
language sql stable parallel safe as $$
  select case
    when p_ends_at is null then 'AUCUN'
    when p_ends_at < p_today then 'EXPIRE'
    when p_ends_at <= p_today + 7 then 'EXPIRE_BIENTOT'
    else 'ACTIF'
  end
$$;

comment on function public.subscription_status_of(uuid, date, date) is
  'ACTIF si échéance > today+7, EXPIRE_BIENTOT si today <= échéance <= today+7, EXPIRE si échéance < today, AUCUN si pas d''échéance.';

-- ----------------------------------------------------------------------------
-- 2. (H-15) admin_agents : lecture superadmin sans récursion RLS
-- ----------------------------------------------------------------------------
create or replace function public.admin_is_active_superadmin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_agents aa
    where aa.auth_user_id = auth.uid()
      and aa.role = 'superadmin'
      and aa.status = 'ACTIF'
  )
$$;

revoke all on function public.admin_is_active_superadmin() from public, anon;
grant execute on function public.admin_is_active_superadmin() to authenticated;

drop policy if exists "admin_agents_select_superadmin" on public.admin_agents;
create policy "admin_agents_select_superadmin" on public.admin_agents
  for select to authenticated
  using (public.admin_is_active_superadmin());

-- ----------------------------------------------------------------------------
-- 3. (M-17) Réintroduction du rôle 'secretaire' (comme 00029)
-- ----------------------------------------------------------------------------
drop policy if exists "grades_select_scoped" on public.grades;
create policy "grades_select_scoped" on public.grades
  for select to authenticated
  using (
    user_can_query_data()
    and school_id = current_school_id()
    and (
      -- direction / économie / surveillant / secrétariat : toujours
      (current_teacher_id() is null and public.current_role() in ('directeur','econome','surveillant','secretaire'))
      -- enseignant affecté : toujours
      or (current_teacher_id() is not null and (
        exists (select 1 from public.class_rooms c
                where c.id = class_id and c.head_teacher_id = current_teacher_id())
        or exists (select 1 from public.teaching_assignments a
                   where a.teacher_id = current_teacher_id()
                     and a.class_id = class_id and a.subject_id = subject_id)))
      -- élève / parent : seulement si les bulletins ne sont pas bloqués
      or (
        coalesce((select ss.block_student_bulletins from public.school_settings ss
                  where ss.school_id = school_id), false) = false
        and (
          (current_parent_id() is not null and exists (
            select 1 from public.students s
            where s.school_id = school_id and s.id = student_id and s.parent_id = current_parent_id()))
          or (current_student_id() is not null and student_id = current_student_id())
        )
      )
    )
  );

drop policy if exists "report_metas_select_scoped" on public.report_metas;
create policy "report_metas_select_scoped" on public.report_metas
  for select to authenticated
  using (
    user_can_query_data()
    and school_id = current_school_id()
    and (
      (current_teacher_id() is null and public.current_role() in ('directeur','econome','surveillant','secretaire'))
      or (current_teacher_id() is not null and exists (
        select 1 from public.students s join public.class_rooms c on c.id = s.class_id
        where s.id = student_id and c.head_teacher_id = current_teacher_id()))
      or (
        coalesce((select ss.block_student_bulletins from public.school_settings ss
                  where ss.school_id = school_id), false) = false
        and (
          (current_parent_id() is not null and exists (
            select 1 from public.students mps
            where mps.school_id = school_id and mps.id = student_id and mps.parent_id = current_parent_id()))
          or (current_student_id() is not null and student_id = current_student_id())
        )
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 4. (M-21) CREATE révoqué sur public (durcissement schéma)
-- ----------------------------------------------------------------------------
revoke create on schema public from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. (M-5) Révocation des sessions / refresh tokens d'un utilisateur
--    Appel réservé au service_role (API Express). Propriétés défensives :
--    la suppression est conditionnée à l'existence réelle des tables/colonnes.
-- ----------------------------------------------------------------------------
create or replace function public.admin_revoke_user_sessions(p_user_id uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  -- 1) refresh tokens liés aux sessions de l'utilisateur (schéma gotrue)
  if exists (select 1 from information_schema.tables
              where table_schema = 'auth' and table_name = 'refresh_tokens') then
    if exists (select 1 from information_schema.columns
                where table_schema = 'auth' and table_name = 'refresh_tokens' and column_name = 'session_id')
       and exists (select 1 from information_schema.columns
                where table_schema = 'auth' and table_name = 'sessions' and column_name = 'id')
       and exists (select 1 from information_schema.columns
                where table_schema = 'auth' and table_name = 'sessions' and column_name = 'user_id') then
      execute 'delete from auth.refresh_tokens rt using auth.sessions s
                 where rt.session_id = s.id and s.user_id = $1'
        using p_user_id;
    elsif exists (select 1 from information_schema.columns
                where table_schema = 'auth' and table_name = 'refresh_tokens' and column_name = 'user_id') then
      execute 'delete from auth.refresh_tokens where user_id = $1' using p_user_id;
    end if;
  end if;

  -- 2) sessions elles-mêmes
  if exists (select 1 from information_schema.tables
              where table_schema = 'auth' and table_name = 'sessions')
     and exists (select 1 from information_schema.columns
              where table_schema = 'auth' and table_name = 'sessions' and column_name = 'user_id') then
    execute 'delete from auth.sessions where user_id = $1' using p_user_id;
  end if;
end;
$$;

revoke all on function public.admin_revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.admin_revoke_user_sessions(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 6. (M-18) verify_matricule : suppression du passage anon direct (API requise)
-- ----------------------------------------------------------------------------
revoke execute on function public.verify_matricule(text) from public, anon, authenticated;
grant execute on function public.verify_matricule(text) to service_role;

-- ----------------------------------------------------------------------------
-- 7. (M-20) contact_messages : bornes + anti-spam (3 messages / heure / e-mail)
-- ----------------------------------------------------------------------------
alter table public.contact_messages drop constraint if exists contact_messages_message_len;
alter table public.contact_messages
  add constraint contact_messages_message_len check (char_length(message) <= 5000) not valid;
alter table public.contact_messages drop constraint if exists contact_messages_subject_len;
alter table public.contact_messages
  add constraint contact_messages_subject_len check (char_length(subject) <= 300) not valid;
alter table public.contact_messages drop constraint if exists contact_messages_name_len;
alter table public.contact_messages
  add constraint contact_messages_name_len check (char_length(name) <= 200) not valid;

create or replace function public.contact_messages_rate_limit()
returns trigger
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  -- En-tête positionné par PostgREST ; '' n'est pas du JSON valide, d'où
  -- le nullif() avant le cast.
  v_headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  v_ip      text := nullif(trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '');
begin
  -- (M16) Rate limit par IP (3 / heure) en plus de la limite par e-mail.
  -- Si l'IP n'est pas transmise, on retombe sur une limite e-mail plus stricte.
  if v_ip is not null then
    if not public.sys_rate_limit('contact:' || v_ip, 3, 3600) then
      raise exception 'Trop de messages en peu de temps. Réessayez plus tard.';
    end if;
  elsif not public.sys_rate_limit('contact:' || lower(trim(new.email)), 2, 3600) then
    raise exception 'Trop de messages en peu de temps. Réessayez plus tard.';
  end if;

  if (select count(*) from public.contact_messages
      where email = new.email
        and created_at > pg_catalog.now() - interval '1 hour') >= 3 then
    raise exception 'Trop de messages en peu de temps. Réessayez plus tard.';
  end if;
  return new;
end;
$$;

drop trigger if exists contact_messages_rate_limit_trg on public.contact_messages;
create trigger contact_messages_rate_limit_trg
  before insert on public.contact_messages
  for each row execute function public.contact_messages_rate_limit();
