-- ============================================================================
-- 00056 — Corrections d'audit (ré-application sur environnement déployé)
--
-- Migration corrective FINALE : elle ré-applique TOUS les correctifs de logique
-- des migrations 00001..00055 sur une base déjà déployée. Les migrations
-- d'origine ont aussi été corrigées : `supabase db reset` sur une base vierge
-- produit exactement le même état final. Toutes les définitions ci-dessous
-- sont idempotentes (CREATE OR REPLACE / DROP IF EXISTS / ALTER).
--
-- Sommaire :
--   1. Helpers d'identité : profil AVANT JWT, school_is_* bornés (C4/M14)
--   2. complete_password_change : journalisation seule (C3)
--   3. class_report_cards : verrou bulletins + rangs sur la classe entière (C2/A5)
--   4. Durcissement search_path = '' des RPC sensibles (M5)
--   5. Paiements manuels : statut NULL rejeté + référence obligatoire (M10/M11)
--   6. Inscriptions : double comptage des élèves supprimé (M7)
--   7. Abonnements : effectif serveur + devis avec montant (M8/M9)
--   8. open_classes : matricule optionnel vérifié (M15)
--   9. admin_dashboard : période semestre1 → S1 (M13)
--  10. contact_messages : rate limit par IP (M16)
--  11. FORCE ROW LEVEL SECURITY sur les tables métier
--  12. Revokes explicites EXECUTE
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helpers d'identité (00002) — le profil est la source de vérité.
--    Le claim JWT n'est qu'un fallback ; un jeton ancien ne peut plus
--    maintenir un rôle révoqué.
-- ----------------------------------------------------------------------------
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

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'ACTIF'
      and p.school_id is not null
  )
$$;

create or replace function public.password_changed() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select not p.must_change_password from public.profiles p where p.id = auth.uid()), false)
$$;

create or replace function public.user_can_query_data() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and public.password_changed()
$$;

-- (M14) Transparence d'abonnement : un client authentifié ne peut interroger
-- que SA école. service_role / postgres restent inter-écoles (Edge Functions,
-- webhooks, support).
create or replace function public.school_is_writable(p_school_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select (auth.role() = 'service_role'
          or session_user in ('postgres', 'supabase_admin')
          or coalesce(p_school_id = public.current_school_id(), false))
     and exists (
       select 1 from public.subscriptions s
       where s.school_id = p_school_id and s.ends_at >= current_date
       limit 1
     )
$$;

create or replace function public.school_is_readable(p_school_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select (auth.role() = 'service_role'
          or session_user in ('postgres', 'supabase_admin')
          or coalesce(p_school_id = public.current_school_id(), false))
     and exists (
       select 1 from public.subscriptions s
       where s.school_id = p_school_id and s.ends_at >= current_date - 7
       limit 1
     )
$$;

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

-- ----------------------------------------------------------------------------
-- 2. complete_password_change (00049) — plus AUCUN UPDATE de profiles.
--    La preuve est le trigger AFTER UPDATE OF encrypted_password sur auth.users.
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
  -- Journalisation seule : aucun drapeau n'est levé ici (audit C3).
  insert into public.audit_log (school_id, actor_id, actor_role, action, entity, entity_id)
  values (public.current_school_id(), v_uid, public.current_role(), 'password_change', 'profiles', v_uid);
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. class_report_cards (00008) — verrou bulletin + classement global.
-- ----------------------------------------------------------------------------
create or replace function public.class_report_cards(p_class_id uuid, p_period text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_school  uuid := public.current_school_id();
  v_role    text := public.current_role();
  v_teacher uuid := public.current_teacher_id();
  v_parent  uuid := public.current_parent_id();
  v_student uuid := public.current_student_id();
  v_class_id uuid;
  v_cycle   text;
  v_period_type text;
  v_allowed text[];
  v_partner uuid;
  v_scope   text;
  v_result  jsonb;
begin
  select c.id, c.cycle into v_class_id, v_cycle
  from public.class_rooms c
  where c.id = p_class_id and c.school_id = v_school;
  if v_class_id is null then
    raise exception 'Vous n''avez pas accès aux bulletins de cette classe.';
  end if;

  if not public.user_can_query_data() then
    raise exception 'Vous n''avez pas accès aux bulletins de cette classe.';
  end if;

  if v_role in ('directeur','econome','surveillant') then
    v_scope := 'staff';
  elsif v_teacher is not null and exists (
    select 1 from public.class_rooms c
    where c.id = p_class_id and c.school_id = v_school and c.head_teacher_id = v_teacher
  ) then
    v_scope := 'staff';
  elsif v_parent is not null and exists (
    select 1 from public.students s
    where s.school_id = v_school and s.class_id = p_class_id and s.parent_id = v_parent
  ) then
    v_scope := 'parent';
    v_partner := v_parent;
  elsif v_student is not null and exists (
    select 1 from public.students s
    where s.school_id = v_school and s.class_id = p_class_id and s.id = v_student
  ) then
    v_scope := 'eleve';
    v_partner := v_student;
  else
    raise exception 'Vous n''avez pas accès aux bulletins de cette classe.';
  end if;

  -- (C2) Contournement : SECURITY DEFINER ignorerait la RLS de grades /
  -- report_metas. Le verrou de la direction est donc réappliqué ici pour
  -- les portées parent / élève.
  if v_scope in ('parent','eleve')
     and coalesce((select ss.block_student_bulletins
                     from public.school_settings ss
                    where ss.school_id = v_school), false) then
    raise exception 'Les bulletins sont temporairement indisponibles.';
  end if;

  select period_type into v_period_type from public.school_settings where school_id = v_school;
  v_allowed := case when v_period_type = 'trimestre' then array['T1','T2','T3'] else array['S1','S2'] end;
  if not (p_period = any (v_allowed)) then
    raise exception 'Période invalide.';
  end if;

  with cs as (
    select c.subject_id,
           (select su.name from public.subjects su where su.id = c.subject_id) as subject_name,
           c.coefficient,
           coalesce((select t.first_name || ' ' || t.last_name
                     from public.teaching_assignments aa
                     join public.teachers t on t.id = aa.teacher_id
                     where aa.class_id = c.class_id and aa.subject_id = c.subject_id
                     limit 1), '—') as teacher_name
    from public.class_subjects c
    where c.class_id = p_class_id and c.school_id = v_school
  ),
  -- (A5) Rangs et moyenne de classe calculés sur TOUS les élèves ;
  -- le filtre de portée ne s'applique qu'à l'agrégat renvoyé.
  class_students as (
    select s.id, s.matricule, s.first_name, s.last_name, s.parent_id
    from public.students s
    where s.school_id = v_school and s.class_id = p_class_id
  ),
  students as (
    select cs2.id, cs2.matricule, cs2.first_name, cs2.last_name
    from class_students cs2
    where v_scope = 'staff'
       or (v_scope = 'parent' and cs2.parent_id = v_partner)
       or (v_scope = 'eleve' and cs2.id = v_partner)
  ),
  lines as (
    select st.id as student_id, c.subject_id, c.subject_name, c.coefficient, c.teacher_name,
           g.devoir1, g.devoir2, g.composition,
           public.grade_subject_average(g.devoir1, g.devoir2, g.composition, v_cycle) as average
    from class_students st cross join cs c
    left join public.grades g
      on g.student_id = st.id and g.subject_id = c.subject_id
     and g.class_id = p_class_id and g.period = p_period
     and g.school_id = v_school
  ),
  ranked_lines as (
    select l.*,
           case when l.average is null then null
             else (select count(*) from lines o
                   where o.subject_id = l.subject_id and o.average > l.average) + 1
           end as rank
    from lines l
  ),
  per_student as (
    select rl.student_id,
           jsonb_agg(
             jsonb_build_object(
               'subjectId', rl.subject_id,
               'subjectName', rl.subject_name,
               'coefficient', rl.coefficient,
               'devoir1', rl.devoir1,
               'devoir2', rl.devoir2,
               'devoirsAvg', public.grade_devoirs_average(rl.devoir1, rl.devoir2),
               'composition', rl.composition,
               'average', rl.average,
               'rank', rl.rank,
               'teacherName', rl.teacher_name,
               'appreciation', public.appreciation_for(rl.average)
             ) order by rl.subject_name
           ) filter (where rl.subject_id is not null) as lines,
           public.weighted_average(
             array_agg(rl.average) filter (where rl.average is not null),
             array_agg(rl.coefficient) filter (where rl.average is not null)
           ) as general_average
    from ranked_lines rl
    group by rl.student_id
  ),
  ranked_students as (
    select ps.*,
           case when ps.general_average is null then null
             else (select count(*) from per_student o
                   where o.general_average > ps.general_average) + 1
           end as rank
    from per_student ps
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'student', jsonb_build_object(
        'id', st.id, 'matricule', st.matricule,
        'firstName', st.first_name, 'lastName', st.last_name
      ),
      'classRoom', jsonb_build_object('id', v_class_id, 'cycle', v_cycle),
      'period', p_period,
      'lines', rs.lines,
      'generalAverage', rs.general_average,
      'rank', rs.rank,
      'classSize', (select count(*) from public.students
                    where school_id = v_school and class_id = p_class_id),
      'classAverage', (select public.round2(avg(o.general_average))
                       from per_student o where o.general_average is not null),
      'meta', coalesce((select jsonb_build_object(
                          'conduct', m.conduct, 'absences', m.absences, 'comment', m.comment)
                        from public.report_metas m
                        where m.school_id = v_school and m.student_id = st.id
                          and m.period = p_period),
                       jsonb_build_object('conduct', 'Bonne', 'absences', 0, 'comment', '')),
      'headTeacherName', coalesce((select th.first_name || ' ' || th.last_name
                                   from public.class_rooms c2
                                   join public.teachers th on th.id = c2.head_teacher_id
                                   where c2.id = p_class_id), '—')
    ) order by rs.rank nulls last, st.last_name
  ), '[]'::jsonb)
  into v_result
  from students st
  join ranked_students rs on rs.student_id = st.id;

  return v_result;
end;
$$;

-- Écritures de notes / métadonnées : mêmes corps, search_path durci (00008).
create or replace function public.save_grade(
  p_student_id uuid,
  p_class_id   uuid,
  p_subject_id uuid,
  p_period     text,
  p_field      text,
  p_value      numeric
)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_school  uuid := public.current_school_id();
  v_teacher uuid := public.current_teacher_id();
  v_field   text;
  v_value   numeric;
begin
  if public.current_role() not in ('instituteur','professeur') or v_teacher is null then
    raise exception 'Action non autorisée : cette classe ou cette matière ne vous est pas affectée.';
  end if;
  if not public.school_is_writable(v_school) then
    raise exception 'Mode lecture seule : l''abonnement de votre école est expiré. Les modifications sont désactivées.';
  end if;
  v_field := p_field;
  if v_field not in ('devoir1','devoir2','composition') then
    raise exception 'Requête invalide.';
  end if;
  v_value := p_value;
  if v_value is not null and (v_value < 0 or v_value > 20) then
    raise exception 'La note doit être comprise entre 0 et 20.';
  end if;
  if not exists (select 1 from public.students s
                  where s.id = p_student_id and s.school_id = v_school and s.class_id = p_class_id) then
    raise exception 'Élève introuvable dans cette classe de votre école.';
  end if;
  if not exists (select 1 from public.teaching_assignments a
                 where a.school_id = v_school and a.teacher_id = v_teacher
                   and a.class_id = p_class_id and a.subject_id = p_subject_id) then
    raise exception 'Action non autorisée : cette classe ou cette matière ne vous est pas affectée.';
  end if;
  if not exists (select 1 from public.class_subjects cs
                 where cs.school_id = v_school and cs.class_id = p_class_id
                   and cs.subject_id = p_subject_id) then
    raise exception 'Cette matière n''est pas au programme de cette classe.';
  end if;

  insert into public.grades
    (school_id, student_id, class_id, subject_id, period, devoir1, devoir2, composition)
  values
    (v_school, p_student_id, p_class_id, p_subject_id, p_period, null, null, null)
  on conflict (school_id, student_id, class_id, subject_id, period) do nothing;

  update public.grades
  set devoir1     = case when v_field = 'devoir1' then v_value else devoir1 end,
      devoir2     = case when v_field = 'devoir2' then v_value else devoir2 end,
      composition = case when v_field = 'composition' then v_value else composition end,
      updated_at  = pg_catalog.now()
  where school_id = v_school and student_id = p_student_id
    and class_id = p_class_id and subject_id = p_subject_id and period = p_period;
end;
$$;

create or replace function public.update_report_meta(
  p_student_id uuid,
  p_period     text,
  p_conduct    text default null,
  p_absences   int  default null,
  p_comment    text default null
)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_school  uuid := public.current_school_id();
  v_teacher uuid := public.current_teacher_id();
  v_student record;
begin
  if public.current_role() not in ('directeur','econome','surveillant') and v_teacher is null then
    raise exception 'Modification non autorisée.';
  end if;
  if not public.school_is_writable(v_school) then
    raise exception 'Mode lecture seule : l''abonnement de votre école est expiré. Les modifications sont désactivées.';
  end if;
  select s.id, s.class_id, c.head_teacher_id into v_student
  from public.students s join public.class_rooms c on c.id = s.class_id
  where s.id = p_student_id and s.school_id = v_school;
  if not found then
    raise exception 'Élève introuvable dans votre école.';
  end if;
  if v_teacher is not null and v_student.head_teacher_id <> v_teacher then
    raise exception 'Modification non autorisée.';
  end if;
  if p_absences is not null and p_absences < 0 then
    raise exception 'Requête invalide.';
  end if;

  insert into public.report_metas (school_id, student_id, period, conduct, absences, comment)
  values (v_school, p_student_id, p_period, coalesce(p_conduct, 'Bonne'), coalesce(p_absences, 0), coalesce(p_comment, ''))
  on conflict (school_id, student_id, period) do update set
    conduct    = coalesce(p_conduct, public.report_metas.conduct),
    absences   = coalesce(p_absences, public.report_metas.absences),
    comment    = coalesce(p_comment, public.report_metas.comment),
    updated_at = pg_catalog.now();
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Administration / présences (00039, 00047) — search_path durci.
-- ----------------------------------------------------------------------------
create or replace function public.admin_update_agent(
  p_agent_id uuid,
  p_patch jsonb,
  p_downgrades boolean
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_is_active_superadmin boolean;
  v_active_superadmins int;
begin
  if p_agent_id is null then
    return false;
  end if;

  lock table public.admin_agents in exclusive mode;

  select exists (
    select 1 from public.admin_agents
    where id = p_agent_id and role = 'superadmin' and status = 'ACTIF'
  ) into v_is_active_superadmin;

  if coalesce(p_downgrades, false) and v_is_active_superadmin then
    select count(*) into v_active_superadmins
    from public.admin_agents
    where role = 'superadmin' and status = 'ACTIF';
    if v_active_superadmins <= 1 then
      return false;
    end if;
  end if;

  update public.admin_agents set
    role       = coalesce(p_patch->>'role',       role),
    status     = coalesce(p_patch->>'status',     status),
    first_name = coalesce(p_patch->>'first_name', first_name),
    last_name  = coalesce(p_patch->>'last_name',  last_name),
    phone      = coalesce(p_patch->>'phone',      phone),
    email      = coalesce(p_patch->>'email',      email),
    updated_at = pg_catalog.now()
  where id = p_agent_id;

  return true;
end;
$$;

create or replace function public.set_attendance_unchecked(
  p_class_id uuid,
  p_subject_id uuid,
  p_date date,
  p_records jsonb
)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_school uuid := public.current_school_id();
  v_role text := public.current_role();
  v_teacher uuid := public.current_teacher_id();
  v_student record;
  v_rec jsonb;
  v_sid uuid;
  v_type text;
  v_absent int := 0;
  v_retard int := 0;
  v_present int := 0;
  v_class_students int;
begin
  if v_role not in ('directeur', 'surveillant', 'professeur', 'instituteur') then
    raise exception 'Votre rôle ne permet pas de saisir les présences.';
  end if;
  if not public.school_is_writable(v_school) then
    raise exception 'Mode lecture seule : l''abonnement de votre école est expiré. Les modifications sont désactivées.';
  end if;
  if p_date is null then
    raise exception 'Date invalide.';
  end if;
  if p_date > current_date then
    raise exception 'Impossible de saisir une présence pour une date future.';
  end if;
  if not exists (select 1 from public.class_rooms c where c.id = p_class_id and c.school_id = v_school) then
    raise exception 'Classe introuvable dans votre école.';
  end if;
  if p_subject_id is not null and not exists (select 1 from public.subjects s where s.id = p_subject_id and s.school_id = v_school) then
    raise exception 'Matière introuvable dans votre école.';
  end if;

  if v_role in ('professeur', 'instituteur') then
    if not (
      exists (
        select 1 from public.teaching_assignments a
        where a.teacher_id = v_teacher and a.class_id = p_class_id and a.school_id = v_school
          and (p_subject_id is null or a.subject_id = p_subject_id)
      )
      or exists (
        select 1 from public.class_rooms c
        where c.id = p_class_id and c.head_teacher_id = v_teacher
      )
    ) then
      raise exception 'Vous n''êtes pas affecté à cette classe.';
    end if;
  end if;

  select count(*) into v_class_students
  from public.students s
  where s.class_id = p_class_id and s.school_id = v_school;

  for v_rec in select * from jsonb_array_elements(coalesce(p_records, '[]'::jsonb)) loop
    v_sid := nullif(v_rec->>'student_id', '')::uuid;
    v_type := v_rec->>'type';
    if v_type not in ('absence', 'retard') then
      raise exception 'Type de présence invalide.';
    end if;
    if not exists (
      select 1 from public.students s
      where s.id = v_sid and s.class_id = p_class_id and s.school_id = v_school
    ) then
      raise exception 'Un élève ne appartient pas à cette classe.';
    end if;
  end loop;

  delete from public.absences a
  where a.school_id = v_school
    and a.absence_date = p_date
    and a.subject_id is not distinct from p_subject_id
    and a.student_id in (select s.id from public.students s where s.class_id = p_class_id and s.school_id = v_school);

  for v_rec in select * from jsonb_array_elements(coalesce(p_records, '[]'::jsonb)) loop
    v_sid := nullif(v_rec->>'student_id', '')::uuid;
    v_type := v_rec->>'type';
    insert into public.absences (school_id, student_id, absence_date, absence_type, motif, justified, subject_id, recorded_by)
    values (v_school, v_sid, p_date, v_type::public.app_absence_type, '', false, p_subject_id, auth.uid());
    if v_type = 'absence' then v_absent := v_absent + 1; else v_retard := v_retard + 1; end if;
  end loop;

  v_present := greatest(v_class_students - v_absent - v_retard, 0);

  insert into public.audit_log (school_id, actor_id, actor_role, action, entity, entity_id, payload)
  values (v_school, auth.uid(), v_role, 'attendance_set', 'absences', null,
          jsonb_build_object('class_id', p_class_id, 'subject_id', p_subject_id, 'date', p_date,
                             'absent', v_absent, 'retard', v_retard, 'present', v_present));

  return jsonb_build_object(
    'class_id', p_class_id,
    'subject_id', p_subject_id,
    'date', p_date,
    'absent', v_absent,
    'retard', v_retard,
    'present', v_present
  );
end;
$$;

create or replace function public.set_attendance(p_class_id uuid, p_subject_id uuid, p_date date, p_records jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.assert_active_account();
  return public.set_attendance_unchecked(p_class_id, p_subject_id, p_date, p_records);
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Paiements manuels (00046) — NULL rejeté, référence obligatoire / unique.
--    Nouvelle signature à 3 arguments ; les appels à 2 restent valides.
-- ----------------------------------------------------------------------------
create or replace function public.record_cash_payment_unchecked(p_payment_id uuid, p_amount int)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_school uuid := public.current_school_id();
  v_role text := public.current_role();
  v_p public.payments%rowtype;
  v_added int;
  v_ref text;
begin
  if v_role not in ('directeur','econome') then
    raise exception 'Seuls l''économe et la direction encaissent les espèces.';
  end if;
  if not public.school_is_writable(v_school) then
    raise exception 'Mode lecture seule : l''abonnement de votre école est expiré. Les modifications sont désactivées.';
  end if;
  select * into v_p from public.payments
  where id = p_payment_id and school_id = v_school;
  if not found then
    raise exception 'Échéance introuvable.';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > v_p.amount - v_p.paid_amount then
    raise exception 'Montant invalide.';
  end if;

  v_added := least(p_amount, v_p.amount - v_p.paid_amount);
  v_ref := 'EC-' || (100000 + floor(pg_catalog.random() * 900000))::int::text;
  update public.payments
  set paid_amount = least(v_p.amount, v_p.paid_amount + v_added),
      method = 'especes',
      paid_at = pg_catalog.now(),
      manual_status = null,
      reference = coalesce(v_p.reference, v_ref)
  where id = p_payment_id;

  insert into public.audit_log (school_id, actor_id, actor_role, action, entity, entity_id, payload)
  values (v_school, auth.uid(), v_role, 'payment_recorded_cash', 'payments', p_payment_id,
          jsonb_build_object('amount', v_added, 'reference', v_ref));

  select * into v_p from public.payments where id = p_payment_id;
  return jsonb_build_object(
    'payment_id', p_payment_id,
    'paid_amount', v_p.paid_amount,
    'status', v_p.status,
    'reference', v_ref
  );
end;
$$;

create or replace function public.set_payment_manual_status_unchecked(
  p_payment_id uuid,
  p_manual_status text,
  p_reference text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_school uuid := public.current_school_id();
  v_role text := public.current_role();
  v_p public.payments%rowtype;
  v_ref text;
begin
  if v_role not in ('directeur','econome') then
    raise exception 'Seuls l''économe et la direction modifient le statut de paiement.';
  end if;
  if not public.school_is_writable(v_school) then
    raise exception 'Mode lecture seule : l''abonnement de votre école est expiré. Les modifications sont désactivées.';
  end if;
  if p_manual_status is null or p_manual_status not in ('a_venir', 'paye', 'impaye') then
    raise exception 'Statut invalide.';
  end if;
  select * into v_p from public.payments
  where id = p_payment_id and school_id = v_school;
  if not found then
    raise exception 'Échéance introuvable.';
  end if;

  if p_manual_status = 'paye' then
    v_ref := nullif(trim(coalesce(v_p.reference, '')), '');
    if v_ref is null then
      v_ref := nullif(trim(coalesce(p_reference, '')), '');
    end if;
    if v_ref is null then
      raise exception 'Une référence de paiement est requise pour marquer une échéance comme payée.';
    end if;
    if exists (select 1 from public.payments pr
               where pr.school_id = v_school and pr.id <> p_payment_id
                 and upper(trim(pr.reference)) = upper(v_ref)) then
      raise exception 'Cette référence de paiement est déjà utilisée dans votre école.';
    end if;
    update public.payments
    set manual_status = 'paye',
        paid_amount = amount,
        method = coalesce(method, 'especes'),
        paid_at = coalesce(paid_at, pg_catalog.now()),
        reference = v_ref
    where id = p_payment_id;
  else
    update public.payments
    set manual_status = p_manual_status,
        paid_amount = 0,
        method = null,
        paid_at = null
    where id = p_payment_id;
  end if;

  insert into public.audit_log (school_id, actor_id, actor_role, action, entity, entity_id, payload)
  values (v_school, auth.uid(), v_role, 'payment_manual_status', 'payments', p_payment_id,
          jsonb_build_object('manual_status', p_manual_status, 'label', v_p.label, 'reference', v_ref));

  select * into v_p from public.payments where id = p_payment_id;
  return jsonb_build_object(
    'payment_id', p_payment_id,
    'manual_status', v_p.manual_status,
    'paid_amount', v_p.paid_amount,
    'status', v_p.status
  );
end;
$$;

create or replace function public.set_payment_manual_status(
  p_payment_id uuid,
  p_manual_status text,
  p_reference text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.assert_active_account();
  return public.set_payment_manual_status_unchecked(p_payment_id, p_manual_status, p_reference);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. link_child (00054) — search_path durci.
-- ----------------------------------------------------------------------------
create or replace function public.link_child(p_student_matricule text, p_birth_date date)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_profil record;
  v_child record;
begin
  perform public.assert_active_account();

  if not public.sys_rate_limit('link_child:' || v_uid::text, 10, 3600) then
    raise exception 'Trop de tentatives. Réessayez dans quelques minutes.';
  end if;

  select * into v_profil from public.profiles where id = v_uid;
  if not found or v_profil.role <> 'parent' or v_profil.parent_id is null then
    raise exception 'Action réservée aux comptes parents.';
  end if;
  if not public.school_is_writable(v_profil.school_id) then
    raise exception 'Mode lecture seule : l''abonnement de votre école est expiré. Les modifications sont désactivées.';
  end if;

  if p_birth_date is null then
    raise exception 'Date de naissance requise pour rattacher un élève.';
  end if;

  select * into v_child
  from public.students
  where school_id = v_profil.school_id
    and matricule = upper(coalesce(trim(p_student_matricule), ''))
  limit 1;

  if not found then
    raise exception 'Vérification échouée. Vérifiez le matricule et la date de naissance de l''élève auprès de l''école.';
  end if;
  if v_child.birth_date is distinct from p_birth_date then
    raise exception 'Vérification échouée. Vérifiez le matricule et la date de naissance de l''élève auprès de l''école.';
  end if;
  if v_child.parent_id = v_profil.parent_id then
    raise exception 'Cet enfant est déjà rattaché à votre compte.';
  end if;
  if v_child.parent_id is not null then
    raise exception 'Cet enfant est déjà rattaché à une autre famille. Contactez l''école.';
  end if;

  update public.students set parent_id = v_profil.parent_id where id = v_child.id;

  insert into public.audit_log (school_id, actor_id, actor_role, action, entity, entity_id)
  values (v_profil.school_id, v_uid, v_profil.role, 'link_child', 'students', v_child.id);

  return v_child.id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. decide_registration_requests_impl (00054) — pas de double comptage.
-- ----------------------------------------------------------------------------
create or replace function public.decide_registration_requests_impl(
  p_ids uuid[],
  p_approve boolean,
  p_reason text default null
)
returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_school uuid := public.current_school_id();
  v_role text := public.current_role();
  v_requests int;
  v_req record;
  v_students int;
  v_limit int;
  v_plan text;
  v_parent_id uuid;
  v_student_id uuid;
  v_class record;
  v_child_count int;
begin
  if v_role <> 'directeur' then
    raise exception 'Seule la direction valide les demandes d''inscription.';
  end if;
  if not public.school_is_writable(v_school) then
    raise exception 'Mode lecture seule : l''abonnement de votre école est expiré. Les modifications sont désactivées.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('scolia:enroll:' || v_school::text, 0));

  drop table if exists tmp_requests;
  create temp table tmp_requests on commit drop as
  select * from public.registration_requests
  where school_id = v_school
    and status = 'EN_ATTENTE'
    and id = any (coalesce(p_ids, array[]::uuid[]));
  select count(*) into v_requests from tmp_requests;
  if v_requests = 0 then
    if p_approve then raise exception 'Aucune demande à approuver.'; else raise exception 'Aucune demande à refuser.'; end if;
  end if;

  if p_approve then
    if exists (select 1 from tmp_requests where role = 'eleve') then
      select si.plan_name into v_plan from public.subscription_info(v_school) si;
      select si.student_limit into v_limit from public.subscription_info(v_school) si;
      -- (M7) Seuls les élèves ACTIFS (ou sans profil) sont comptés ; on ne
      -- rajoute PAS les demandes en attente (double comptage supprimé).
      select count(*) into v_students
      from public.students s
      where s.school_id = v_school
        and not exists (
          select 1 from public.profiles p
          where p.student_id = s.id and p.status <> 'ACTIF'
        );
      if v_limit is not null and v_students > v_limit then
        raise exception 'Votre formule % est limitée à % élèves. Changez de formule pour approuver une nouvelle inscription.', v_plan, v_limit;
      end if;
    end if;
  end if;

  for v_req in select * from tmp_requests loop
    if p_approve then
      if v_req.role = 'eleve' and v_req.class_id is not null then
        select * into v_class from public.class_rooms where id = v_req.class_id;
        v_child_count := (select count(*) from public.students s
                          where s.school_id = v_school and s.class_id = v_req.class_id
                            and not exists (
                              select 1 from public.profiles p
                              where p.student_id = s.id and p.status <> 'ACTIF'
                            ));
        if v_child_count >= v_class.capacity then
          raise exception 'La classe % est complète (% places).', v_class.name, v_class.capacity;
        end if;

        select id into v_parent_id from public.parents
        where school_id = v_school and lower(email) = lower(v_req.email)
        limit 1;
        if not found then
          insert into public.parents (school_id, first_name, last_name, phone, email, address)
          values (v_school, v_req.first_name, v_req.last_name, v_req.phone, v_req.email, '')
          returning id into v_parent_id;
        end if;

        select student_id into v_student_id
        from public.profiles
        where id = v_req.user_id
        limit 1;
        if v_student_id is null then
          raise exception 'Aucun élève n''est lié à la demande de % % : validez ce compte depuis l''inscription.', v_req.first_name, v_req.last_name;
        end if;
        if not exists (select 1 from public.students where id = v_student_id and school_id = v_school) then
          raise exception 'L''élève du compte % % est introuvable dans cette école.', v_req.first_name, v_req.last_name;
        end if;

        update public.students
        set parent_id = v_parent_id,
            class_id = v_req.class_id,
            gender = coalesce(v_req.gender, gender),
            birth_date = coalesce(v_req.birth_date, birth_date)
        where id = v_student_id;

        perform public.build_payment_plan(v_student_id);

        update public.profiles set status = 'ACTIF', student_id = v_student_id where id = v_req.user_id;

        update public.registration_requests
        set status = 'APPROUVEE', decided_at = current_date, reason = p_reason
        where id = v_req.id;

        insert into public.audit_log (school_id, actor_id, actor_role, action, entity, entity_id, payload)
        values (v_school, v_req.user_id, 'approve_student', 'registration_requests', v_req.id,
                jsonb_build_object('student_id', v_student_id, 'child_code', (select child_code from public.students where id = v_student_id)));
      else
        update public.profiles set status = 'ACTIF' where id = v_req.user_id;
        update public.registration_requests
        set status = 'APPROUVEE', decided_at = current_date, reason = p_reason
        where id = v_req.id;

        select parent_id into v_parent_id from public.profiles where id = v_req.user_id limit 1;
        if v_parent_id is not null and v_req.child_code is not null then
          update public.students
          set parent_id = v_parent_id
          where school_id = v_school
            and child_code = v_req.child_code
            and (parent_id is null or parent_id = v_parent_id);
        end if;

        insert into public.audit_log (school_id, actor_id, actor_role, action, entity, entity_id, payload)
        values (v_school, v_req.user_id, 'approve_parent', 'registration_requests', v_req.id, jsonb_build_object('child_code', v_req.child_code));
      end if;
    else
      if v_req.role = 'eleve' then
        select student_id into v_student_id from public.profiles where id = v_req.user_id limit 1;
        if v_student_id is not null then
          delete from public.students where id = v_student_id and school_id = v_school;
        end if;
      end if;

      update public.profiles set status = 'DESACTIVE' where id = v_req.user_id;
      update public.registration_requests
      set status = 'REFUSEE', decided_at = current_date, reason = p_reason
      where id = v_req.id;

      insert into public.audit_log (school_id, actor_id, actor_role, action, entity, entity_id, payload)
      values (v_school, v_req.user_id, 'reject_student', 'registration_requests', v_req.id, jsonb_build_object('reason', p_reason));
    end if;
  end loop;

  return v_requests;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. Abonnements (00055) — effectif serveur, devis avec montant saisi.
-- ----------------------------------------------------------------------------
create or replace function public.request_subscription_activation(
  p_plan_id      text,
  p_cycle        text,
  p_student_count int
)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_profile    record;
  v_plan       record;
  v_request_id uuid;
  v_request    record;
  v_amount     int;
  v_months     int;
  v_students   int;
begin
  perform public.assert_active_account();

  select * into v_profile from public.profiles where id = auth.uid();
  if not found
     or v_profile.role <> 'directeur'
     or v_profile.school_id is null then
    raise exception 'Action reservee a la direction de l''ecole.';
  end if;

  -- p_student_count reste validé et journalisé « pour info » mais ne fixe
  -- plus le montant (audit M9).
  if p_student_count is null or p_student_count < 1 or p_student_count > 100000 then
    raise exception 'Effectif invalide.';
  end if;
  if p_cycle is null or p_cycle not in ('monthly', 'yearly') then
    raise exception 'Cycle invalide (monthly ou yearly).';
  end if;

  select * into v_plan from public.plans where id::text = p_plan_id;
  if not found then
    raise exception 'Formule introuvable.';
  end if;
  if coalesce(v_plan.on_quote, false) then
    raise exception 'Cette formule est etablie sur devis : contactez le support.';
  end if;

  select count(*) into v_students
  from public.students
  where school_id = v_profile.school_id;
  if v_students < 1 then
    raise exception 'Aucun eleve n''est enregistre dans votre ecole.';
  end if;
  if v_plan.student_limit is not null and v_students > v_plan.student_limit then
    raise exception 'La formule % est limitee a % eleves.', v_plan.name, v_plan.student_limit;
  end if;

  if exists (
    select 1 from public.subscriptions s
    where s.school_id = v_profile.school_id
      and s.ends_at >= current_date
  ) then
    raise exception 'Votre ecole dispose deja d''un abonnement actif.';
  end if;

  v_months := case when p_cycle = 'yearly' then 10 else 1 end;

  if coalesce(v_plan.price_per_student, 0) > 0 then
    v_amount := v_plan.price_per_student * v_students * v_months;
  else
    v_amount := case when p_cycle = 'yearly' then v_plan.yearly_price else v_plan.monthly_price end;
  end if;

  insert into public.subscription_requests
    (school_id, requested_by, plan_id, cycle, student_count, amount)
  values
    (v_profile.school_id, auth.uid(), v_plan.id, p_cycle, v_students, v_amount)
  on conflict (school_id) where status = 'EN_ATTENTE'
  do update set
    requested_by  = excluded.requested_by,
    plan_id       = excluded.plan_id,
    cycle         = excluded.cycle,
    student_count = excluded.student_count,
    amount        = excluded.amount,
    created_at    = pg_catalog.now()
  returning id into v_request_id;

  select * into v_request from public.subscription_requests where id = v_request_id;

  insert into public.audit_log
    (school_id, actor_id, actor_role, action, entity, entity_id, payload)
  values
    (v_profile.school_id, auth.uid(), v_profile.role, 'subscription_requested',
     'subscription_requests', v_request_id,
     jsonb_build_object('plan', v_plan.id, 'cycle', p_cycle,
                        'student_count', v_students, 'client_student_count', p_student_count,
                        'amount', v_amount));

  return jsonb_build_object(
    'id', v_request.id,
    'school_id', v_request.school_id,
    'plan_id', v_request.plan_id,
    'cycle', v_request.cycle,
    'student_count', v_request.student_count,
    'amount', v_request.amount,
    'status', v_request.status,
    'created_at', v_request.created_at,
    'decided_at', v_request.decided_at
  );
end;
$$;

create or replace function public.activate_school_subscription(
  p_school_id  uuid,
  p_plan_id    text,
  p_cycle      text,
  p_amount_paid int default null,
  p_payment_ref text default '',
  p_method     text default 'especes'
)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_school    record;
  v_plan      record;
  v_sub       record;
  v_method    public.app_pay_method;
  v_days      int;
  v_amount    int;
  v_students  int := 0;
  v_months    int;
  v_free      boolean := false;
  v_starts    date;
  v_ends      date;
  v_event     text;
  v_matricule text;
  v_ref       text;
  v_new       boolean := false;
  v_old_free  boolean := false;
begin
  if auth.role() is distinct from 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Activation réservée au support.';
  end if;

  select * into v_school from public.schools where id = p_school_id for update;
  if not found then
    raise exception 'École introuvable.';
  end if;

  select * into v_plan from public.plans where id::text = p_plan_id;
  if not found then
    raise exception 'Formule introuvable.';
  end if;
  -- (M8) Devis accepté si le support a saisi un montant > 0.
  if coalesce(v_plan.on_quote, false)
     and (p_amount_paid is null or p_amount_paid <= 0) then
    raise exception 'Formule sur devis : le montant doit être saisi par le support après négociation.';
  end if;

  if p_cycle is null or p_cycle not in ('monthly', 'yearly') then
    raise exception 'Cycle invalide (monthly ou yearly).';
  end if;
  if coalesce(p_method, 'especes') not in ('wave', 'orange_money', 'free_money', 'especes') then
    raise exception 'Moyen de paiement invalide.';
  end if;
  v_method := coalesce(p_method, 'especes')::public.app_pay_method;

  select count(*) into v_students from public.students where school_id = p_school_id;

  v_free := coalesce(v_plan.monthly_price, 0) = 0
            and coalesce(v_plan.yearly_price, 0) = 0
            and coalesce(v_plan.price_per_student, 0) = 0;

  v_days := case
    when v_free then 365
    when p_cycle = 'yearly' then 365
    else 30
  end;

  v_months := case when p_cycle = 'yearly' then 10 else 1 end;

  v_amount := coalesce(
    p_amount_paid,
    case
      when coalesce(v_plan.price_per_student, 0) > 0
        then v_plan.price_per_student * v_students * v_months
      when p_cycle = 'yearly' then v_plan.yearly_price
      else v_plan.monthly_price
    end
  );
  if v_amount < 0 then
    raise exception 'Montant invalide.';
  end if;

  v_ref := coalesce(
    nullif(trim(coalesce(p_payment_ref, '')), ''),
    'MANUAL-' || to_char(pg_catalog.now(), 'YYYYMMDD-HH24MISS')
  );

  select * into v_sub from public.subscriptions where school_id = p_school_id for update;
  if found then
    v_old_free := coalesce(
      (select p.monthly_price = 0 and p.yearly_price = 0 and coalesce(p.price_per_student, 0) = 0
         from public.plans p where p.id = v_sub.plan_id),
      false
    );

    if v_free then
      v_starts := current_date;
      v_ends   := current_date + v_days;
    elsif coalesce(v_sub.ends_at >= current_date, false) and not v_old_free then
      v_starts := coalesce(v_sub.starts_at, current_date);
      v_ends   := v_sub.ends_at + v_days;
    else
      v_starts := current_date;
      v_ends   := current_date + v_days;
    end if;
    v_event := case when v_sub.plan_id = v_plan.id then 'renewal' else 'plan_change' end;
  else
    v_starts := current_date;
    v_ends   := current_date + v_days;
    v_event  := 'purchase';
    v_new    := true;
  end if;

  insert into public.subscriptions
    (school_id, plan_id, starts_at, ends_at, student_limit, amount_paid, payment_ref, method, paid_at)
  values
    (p_school_id, v_plan.id, v_starts, v_ends, v_plan.student_limit, v_amount, v_ref,
     v_method, pg_catalog.now())
  on conflict (school_id) do update set
    plan_id       = excluded.plan_id,
    starts_at     = excluded.starts_at,
    ends_at       = excluded.ends_at,
    student_limit = excluded.student_limit,
    amount_paid   = excluded.amount_paid,
    payment_ref   = excluded.payment_ref,
    method        = excluded.method,
    paid_at       = excluded.paid_at;

  if v_school.matricule is null then
    v_matricule := public.generate_school_matricule();
    update public.schools set matricule = v_matricule where id = p_school_id;
  else
    v_matricule := v_school.matricule;
  end if;

  insert into public.subscription_events
    (school_id, event_type, plan_id, amount_paid, payment_ref, method, starts_at, ends_at, payload)
  values
    (p_school_id, v_event, v_plan.id, v_amount, v_ref, v_method,
     v_starts, v_ends, jsonb_build_object('source', 'manual_activation', 'cycle', p_cycle,
                                          'students', v_students, 'months', v_months));

  insert into public.audit_log
    (school_id, actor_id, actor_role, action, entity, entity_id, payload)
  values
    (p_school_id, null, 'service_role', 'subscription_activated_manually', 'subscriptions', null,
     jsonb_build_object('plan', v_plan.id, 'cycle', p_cycle, 'amount', v_amount,
                        'payment_ref', v_ref, 'matricule_created', v_school.matricule is null));

  return jsonb_build_object(
    'school_id', p_school_id,
    'matricule', v_matricule,
    'matriculeCreated', v_school.matricule is null,
    'plan_id', v_plan.id,
    'plan_name', v_plan.name,
    'cycle', p_cycle,
    'amount_paid', v_amount,
    'student_count', v_students,
    'payment_ref', v_ref,
    'method', v_method,
    'starts_at', v_starts,
    'ends_at', v_ends,
    'new_subscription', v_new
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. open_classes (00006) — matricule vérifié si fourni (M15).
-- ----------------------------------------------------------------------------
drop function if exists public.open_classes(uuid);

create or replace function public.open_classes(p_school_id uuid, p_matricule text default null)
returns table (class_id uuid, name text, cycle public.app_cycle, level_label text, capacity int, filled int)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.cycle, l.label, c.capacity,
         (select count(*) from public.students st where st.class_id = c.id)::int as filled
  from public.class_rooms c
  join public.levels l on l.id = c.level_id
  join public.schools sc on sc.id = c.school_id
  where c.school_id = p_school_id
    and sc.registration_open
    and (p_matricule is null
         or (sc.matricule is not null
             and upper(trim(p_matricule)) = upper(trim(sc.matricule))))
    and (select count(*) from public.students st where st.class_id = c.id) < c.capacity
  order by c.name
$$;

-- ----------------------------------------------------------------------------
-- 10. admin_dashboard (00010) — mapping des périodes (M13).
-- ----------------------------------------------------------------------------
create or replace function public.admin_dashboard(p_period_id text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_role text := public.current_role();
  v_school uuid := public.current_school_id();
  v_settings record;
  v_y1 int;
  v_y2 int;
  v_m int;
  v_year int;
  v_month int;
  v_period text;
  v_labels constant text[] := array[
    'Octobre','Novembre','Décembre','Janvier','Février','Mars','Avril','Mai','Juin','Juillet'
  ];
  v_avg numeric := 0;
  v_avg_count int := 0;
  v_card record;
  v_class record;
begin
  if v_school is null or v_role not in ('directeur','econome') or not public.user_can_query_data() then
    raise exception 'Tableau de bord indisponible.';
  end if;
  select * into v_settings from public.school_settings where school_id = v_school;
  v_y1 := left(v_settings.school_year, 4)::int;
  v_y2 := right(v_settings.school_year, 4)::int;

  v_period := case lower(trim(coalesce(p_period_id, 'semestre1')))
    when 'semestre1' then 'S1'
    when 'semestre2' then 'S2'
    when 'trimestre1' then 'T1'
    when 'trimestre2' then 'T2'
    when 'trimestre3' then 'T3'
    when 's1' then 'S1'
    when 's2' then 'S2'
    when 't1' then 'T1'
    when 't2' then 'T2'
    when 't3' then 'T3'
    else 'S1'
  end;

  for v_class in
    select c.id from public.class_rooms c where c.school_id = v_school
  loop
    for v_card in
      select jn
      from jsonb_array_elements(public.class_report_cards(v_class.id, v_period)) jn
    loop
      if jsonb_typeof(v_card.jn->'generalAverage') = 'number' then
        v_avg := v_avg + (v_card.jn->'generalAverage')::text::numeric;
        v_avg_count := v_avg_count + 1;
      end if;
    end loop;
  end loop;

  v_year := v_y1;
  v_month := 10;
  drop table if exists dash_months;
  create temporary table dash_months (ordering int, label text, y int, m int) on commit drop;
  for v_m in 1..10 loop
    insert into dash_months values (v_m-3, v_labels[v_m], v_year, v_month);
    if v_m = 3 then
      v_year := v_y2;
      v_month := 0;
    end if;
    v_month := v_month + 1;
  end loop;

  return jsonb_build_object(
    'totalStudents', (select count(*) from public.students s where s.school_id = v_school),
    'byCycle', (
      select jsonb_agg(jsonb_build_object('cycle', cyc, 'count', cnt) order by cyc)
      from (
        select cyc, count(s.id) cnt
        from (values ('elementaire'),('moyen'),('secondaire')) v(cyc)
        join public.class_rooms c on c.cycle = v.cyc and c.school_id = v_school
        left join public.students s on s.class_id = c.id
        group by cyc
      ) t
    ),
    'expected', coalesce((
      select sum(pn.amount) from public.payments pn
      where pn.school_id = v_school and pn.due_date <= current_date
    ), 0),
    'collected', coalesce((
      select sum(pn.paid_amount) from public.payments pn
      where pn.school_id = v_school and pn.due_date <= current_date
    ), 0),
    'unpaidTotal', coalesce((
      select sum(pn.amount - pn.paid_amount) from public.payments pn
      where pn.school_id = v_school and pn.due_date <= current_date
    ), 0),
    'unpaidStudents', (
      select count(distinct pn.student_id) from public.payments pn
      where pn.school_id = v_school and pn.due_date <= current_date and pn.paid_amount < pn.amount
    ),
    'generalAverage', case when v_avg_count > 0 then public.round2(v_avg / v_avg_count) else null end,
    'paymentsByMonth', (
      select jsonb_agg(jsonb_build_object('month', left(dm.label, 4) || '.', 'attendu', d.worth, 'encaisse', d.summed) order by dm.ordering)
      from dash_months dm
      left join (
        select extract('year' from p1.due_date) yr, extract('month' from p1.due_date) mo,
               sum(p1.amount) worth, sum(p1.paid_amount) summed
        from public.payments p1
        where p1.school_id = v_school and p1.kind = 'mensualite'
        group by 1, 2
      ) d on d.yr = dm.y and d.mo = dm.m
    ),
    'studentsByClass', (
      select jsonb_agg(jsonb_build_object('name', c.name, 'cycle', c.cycle, 'effectif', coalesce(n.nb, 0)) order by c.level_id, c.name)
      from public.class_rooms c
      left join (
        select s2.class_id cid, count(*) nb
        from public.students s2 where s2.school_id = v_school
        group by 1
      ) n on n.cid = c.id
      where c.school_id = v_school
    ),
    'latestPayments', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', pn.id,
          'studentId', pn.student_id,
          'kind', pn.kind,
          'label', pn.label,
          'dueDate', pn.due_date,
          'amount', pn.amount,
          'paidAmount', pn.paid_amount,
          'status', pn.status,
          'method', pn.method,
          'paidAt', pn.paid_at,
          'reference', pn.reference,
          'studentName', coalesce(s.first_name || ' ' || s.last_name, '—'),
          'className', coalesce(cr.name, '—'),
          'parentName', coalesce(pr.first_name || ' ' || pr.last_name, '—'),
          'parentPhone', coalesce(pr.phone, '')
        ) order by pn.paid_at desc nulls last
      ), '[]'::jsonb)
      from (
        select * from public.payments
        where school_id = v_school and paid_amount > 0 and paid_at is not null and kind <> 'inscription'
        order by paid_at desc
        limit 6
      ) pn
      left join public.students s on s.id = pn.student_id
      left join public.class_rooms cr on cr.id = s.class_id
      left join public.parents pr on pr.id = s.parent_id
    ),
    'conflictCount', (select count(*) from public.assignment_conflicts()),
    'conflictErrorCount', (select count(*) from public.assignment_conflicts() where severity = 'error')
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 11. contact_messages (00043) — anti-spam IP + repli e-mail strict.
-- ----------------------------------------------------------------------------
create or replace function public.contact_messages_rate_limit()
returns trigger
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  v_ip      text := nullif(trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '');
begin
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

-- ----------------------------------------------------------------------------
-- 12. FORCE ROW LEVEL SECURITY (M6).
--     Les tables ci-dessous portent school_id. Les fonctions SECURITY DEFINER
--     sont la propriété de postgres (rôle BYPASSRLS) : elles continuent donc
--     à fonctionner, mais leurs filtres school_id explicites restent requis
--     et sont conservés. `schools` (id propre), `levels`, `plans`,
--     `admin_agents`, `admin_mfa_sessions` (déjà forcée), `platform_settings`,
--     `rate_limits`, `contact_messages` et `timetable_courses` n'ont pas de
--     colonne school_id : non concernées. `payment_transactions` (016),
--     `conversations` / `messages` / `conversation_reads` / `announcements`
--     (045) ont été supprimées : exclues de la liste.
-- ----------------------------------------------------------------------------
alter table public.school_settings         force row level security;
alter table public.level_fees              force row level security;
alter table public.subscriptions           force row level security;
alter table public.subscription_events     force row level security;
alter table public.subscription_requests   force row level security;
alter table public.counters                force row level security;
alter table public.teachers                force row level security;
alter table public.parents                 force row level security;
alter table public.class_rooms             force row level security;
alter table public.students                force row level security;
alter table public.profiles                force row level security;
alter table public.subjects                force row level security;
alter table public.class_subjects          force row level security;
alter table public.teaching_assignments    force row level security;
alter table public.grades                  force row level security;
alter table public.report_metas            force row level security;
alter table public.payments                force row level security;
alter table public.absences                force row level security;
alter table public.registration_requests   force row level security;
alter table public.audit_log               force row level security;
alter table public.timetables              force row level security;

-- ----------------------------------------------------------------------------
-- 13. Droits d'exécution : plus aucune RPC sensible n'est EXECUTABLE par
--     PUBLIC / anon. Les helpers de politique restent appelables par
--     authenticated (une policy est évaluée avec les droits de l'appelant).
-- ----------------------------------------------------------------------------
revoke execute on function public.current_school_id() from public, anon;
revoke execute on function public.current_role() from public, anon;
revoke execute on function public.current_teacher_id() from public, anon;
revoke execute on function public.current_parent_id() from public, anon;
revoke execute on function public.current_student_id() from public, anon;
revoke execute on function public.is_active_user() from public, anon;
revoke execute on function public.password_changed() from public, anon;
revoke execute on function public.user_can_query_data() from public, anon;
revoke execute on function public.school_is_writable(uuid) from public, anon;
revoke execute on function public.school_is_readable(uuid) from public, anon;
revoke execute on function public.subscription_info(uuid) from public, anon, authenticated;
revoke execute on function public.school_year_label() from public, anon;
grant execute on function public.current_school_id() to authenticated, service_role;
grant execute on function public.current_role() to authenticated, service_role;
grant execute on function public.current_teacher_id() to authenticated, service_role;
grant execute on function public.current_parent_id() to authenticated, service_role;
grant execute on function public.current_student_id() to authenticated, service_role;
grant execute on function public.is_active_user() to authenticated, service_role;
grant execute on function public.password_changed() to authenticated, service_role;
grant execute on function public.user_can_query_data() to authenticated, service_role;
grant execute on function public.school_is_writable(uuid) to authenticated, service_role;
grant execute on function public.school_is_readable(uuid) to authenticated, service_role;
grant execute on function public.school_year_label() to authenticated, service_role;
grant execute on function public.subscription_info(uuid) to service_role;

revoke execute on function public.complete_password_change() from public, anon;
grant execute on function public.complete_password_change() to authenticated, service_role;

revoke execute on function public.class_report_cards(uuid, text) from public, anon;
grant execute on function public.class_report_cards(uuid, text) to authenticated;
revoke execute on function public.save_grade(uuid, uuid, uuid, text, text, numeric) from public, anon;
grant execute on function public.save_grade(uuid, uuid, uuid, text, text, numeric) to authenticated;
revoke execute on function public.update_report_meta(uuid, text, text, int, text) from public, anon;
grant execute on function public.update_report_meta(uuid, text, text, int, text) to authenticated;
revoke execute on function public.admin_dashboard(text) from public, anon;
grant execute on function public.admin_dashboard(text) to authenticated;
revoke execute on function public.link_child(text, date) from public, anon;
grant execute on function public.link_child(text, date) to authenticated;
revoke execute on function public.set_attendance(uuid, uuid, date, jsonb) from public, anon;
grant execute on function public.set_attendance(uuid, uuid, date, jsonb) to authenticated;
revoke execute on function public.set_payment_manual_status(uuid, text, text) from public, anon;
grant execute on function public.set_payment_manual_status(uuid, text, text) to authenticated;
revoke execute on function public.request_subscription_activation(text, text, int) from public, anon;
grant execute on function public.request_subscription_activation(text, text, int) to authenticated, service_role;

-- Internal helpers (_unchecked / admin / support) : aucun appel client direct.
drop function if exists public.set_payment_manual_status(uuid, text);
drop function if exists public.set_payment_manual_status_unchecked(uuid, text);
revoke execute on function public.set_payment_manual_status_unchecked(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.record_cash_payment_unchecked(uuid, int) from public, anon, authenticated;
revoke execute on function public.set_attendance_unchecked(uuid, uuid, date, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_update_agent(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.admin_update_agent(uuid, jsonb, boolean) to service_role;
revoke execute on function public.decide_registration_requests_impl(uuid[], boolean, text) from public, anon, authenticated;
grant execute on function public.decide_registration_requests_impl(uuid[], boolean, text) to service_role;
revoke execute on function public.activate_school_subscription(uuid, text, text, int, text, text) from public, anon, authenticated;
grant execute on function public.activate_school_subscription(uuid, text, text, int, text, text) to service_role;
revoke execute on function public.open_classes(uuid, text) from public;
grant execute on function public.open_classes(uuid, text) to anon, authenticated;

-- La table rate_limits et le trigger de contact restent hors de portée client.
revoke all on table public.rate_limits from anon, authenticated;
revoke all on table public.contact_messages from authenticated;
-- auto_expose_new_tables = false : le formulaire de contact doit conserver
-- un GRANT explicite d'insertion pour anon (politique contact_messages_insert_anon).
grant insert on public.contact_messages to anon;

-- ============================================================================
-- Fin de la migration corrective 00056 — idempotente, rejouable.
-- ============================================================================
