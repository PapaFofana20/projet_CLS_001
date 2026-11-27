-- ============================================================================
-- Migration 8 — Phase 5 : notes & bulletins.
--
-- Devoirs / compositions (0 à 20) saisis uniquement par les enseignants
-- affectés à la cellule (classe × matière). Métadonnées de bulletin (conduite,
-- absences, observation) tenues par la direction, l'économe, le surveillant ou
-- le titulaire de la classe. Le bulletin complet (moyennes par matière,
-- moyenne générale pondérée, rangs ex æquo, moyenne de classe, appréciations)
-- est calculé côté serveur par class_report_cards — le client ne fait
-- qu'afficher.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Calculs de notes (identiques à src/utils/grades.ts)
-- ----------------------------------------------------------------------------
create or replace function public.round2(v numeric)
returns numeric
language sql immutable parallel safe as $$
  select round(v, 2)
$$;

create or replace function public.grade_devoirs_average(p_d1 numeric, p_d2 numeric)
returns numeric
language plpgsql immutable parallel safe as $$
begin
  if p_d1 is not null and p_d2 is not null then
    return public.round2((p_d1 + p_d2) / 2);
  elsif p_d1 is not null then
    return public.round2(p_d1);
  elsif p_d2 is not null then
    return public.round2(p_d2);
  end if;
  return null;
end;
$$;

-- Élémentaire : composition seule. Moyen / secondaire :
-- (moyenne des devoirs + composition) / 2, l'un des deux si l'autre manque.
create or replace function public.grade_subject_average(
  p_d1 numeric, p_d2 numeric, p_comp numeric, p_cycle text
)
returns numeric
language plpgsql immutable parallel safe as $$
declare
  d numeric;
begin
  if p_d1 is null and p_d2 is null and p_comp is null then
    return null;
  end if;
  if p_cycle = 'elementaire' then
    return public.round2(p_comp);
  end if;
  d := public.grade_devoirs_average(p_d1, p_d2);
  if d is null then return public.round2(p_comp); end if;
  if p_comp is null then return public.round2(d); end if;
  return public.round2((d + p_comp) / 2);
end;
$$;

-- Moyenne pondérée par les coefficients ; null si aucune note fournie.
create or replace function public.weighted_average(
  p_averages     numeric[],
  p_coefficients numeric[]
)
returns numeric
language plpgsql immutable parallel safe as $$
declare
  i int;
  v_sum numeric := 0;
  v_coefs numeric := 0;
begin
  if coalesce(array_length(p_averages, 1), 0) <> coalesce(array_length(p_coefficients, 1), 0) then
    raise exception 'Moyennes et coefficients de tailles différentes.';
  end if;
  for i in 1..coalesce(array_length(p_averages, 1), 0) loop
    if p_averages[i] is not null then
      v_sum := v_sum + p_averages[i] * p_coefficients[i];
      v_coefs := v_coefs + p_coefficients[i];
    end if;
  end loop;
  if v_coefs = 0 then return null; end if;
  return public.round2(v_sum / v_coefs);
end;
$$;

create or replace function public.appreciation_for(v numeric)
returns text
language sql immutable parallel safe as $$
  select case
    when v is null then '—'
    when v >= 16 then 'Excellent'
    when v >= 14 then 'Très bien'
    when v >= 12 then 'Bien'
    when v >= 10 then 'Assez bien'
    when v >= 8  then 'Passable'
    when v >= 5  then 'Insuffisant'
    else 'Très faible'
  end
$$;

-- ----------------------------------------------------------------------------
-- Saisie d'une note : RPC transactielle messages exacts du front
-- (gradeService.saveGrade). Écriture DIRECTE de la table restée couverte par
-- les politiques INSERT/UPDATE ci-dessous (double ceinture RGPD / intégrité).
-- ----------------------------------------------------------------------------
create or replace function public.save_grade(
  p_student_id uuid,
  p_class_id   uuid,
  p_subject_id uuid,
  p_period     text,   -- 'S1' | 'S2' | 'T1' | 'T2' | 'T3'
  p_field      text,   -- devoir1 | devoir2 | composition
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
      updated_at  = now()
  where school_id = v_school and student_id = p_student_id
    and class_id = p_class_id and subject_id = p_subject_id and period = p_period;
end;
$$;

revoke execute on function public.save_grade(uuid, uuid, uuid, text, text, numeric) from anon, public;
grant execute on function public.save_grade(uuid, uuid, uuid, text, text, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- Métadonnées de bulletin (conduite / absences / observation) : direction,
-- économe, surveillant et titulaire de la classe ; parent et élève : lecture
-- seule.
-- ----------------------------------------------------------------------------
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
    updated_at = now();
end;
$$;

revoke execute on function public.update_report_meta(uuid, text, text, int, text) from anon, public;
grant execute on function public.update_report_meta(uuid, text, text, int, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Bulletins d'une classe (calcul serveur). Portée selon l'appelant, parité
-- reportService.classAllowed :
--   directeur / économe / surveillant → classe entière ;
--   titulaire de la classe            → classe entière ;
--   parent                            → uniquement ses enfants ;
--   élève                             → uniquement son bulletin ;
--   enseignant non titulaire          → REFUS.
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
    -- Titulaire (élémentaire) ou professeur principal (moyen / secondaire) :
    -- seule la règle de référence (utils/permissions.ts, canReadWholeClass)
    -- autorise la lecture de la CLASSE ENTIÈRE. Un enseignant simplement
    -- affecté à une matière reste limité à sa matière (voir la politique
    -- grades_select_scoped).
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

  -- (C2) Verrouillage des bulletins : la RLS protège la lecture directe de
  -- `grades` / `report_metas`, mais cette RPC est SECURITY DEFINER et
  -- contourne la RLS. Le contrôle doit donc être refait ici, sinon un parent
  -- ou un élève contourne le blocage décidé par la direction.
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
  -- (A5) LA CLASSE ENTIÈRE sert de référence aux rangs et à la moyenne de
  -- classe. Le filtre de portée (parent / élève) ne s'applique qu'au retour :
  -- sinon un parent ne verrait que son enfant avec le rang 1 et une moyenne
  -- de classe erronée.
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
     -- La fonction est SECURITY DEFINER : elle contourne la RLS de `grades`.
     -- Le filtre d'école est donc explicite, sinon une noteinjectée par
     -- une autre école apparaîtrait dans le bulletin.
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

revoke execute on function public.class_report_cards(uuid, text) from anon, public;
grant execute on function public.class_report_cards(uuid, text) to authenticated;

-- ============================================================================
-- Politiques RLS — notes & métadonnées (accès direct au client, sans RPC)
-- ============================================================================
create policy "grades_select_scoped" on public.grades
  for select to authenticated
  using (
    user_can_query_data()
    and school_id = current_school_id()
    and (
      (
        current_teacher_id() is null
        and (
          public.current_role() in ('directeur','econome','surveillant')
          or (current_parent_id() is not null and exists (
            select 1 from public.students s
            where s.school_id = school_id and s.id = student_id and s.parent_id = current_parent_id()))
          or (current_student_id() is not null and student_id = current_student_id())
        )
      )
      or (current_teacher_id() is not null and (
        exists (select 1 from public.class_rooms c
                where c.id = class_id and c.head_teacher_id = current_teacher_id())
        or exists (select 1 from public.teaching_assignments a
                   where a.teacher_id = current_teacher_id()
                     and a.class_id = class_id and a.subject_id = subject_id))
      )
    )
  );

create policy "grades_insert_enseignant_affecte" on public.grades
  for insert to authenticated
  with check (
    school_is_writable(school_id)
    and school_id = current_school_id()
    and current_teacher_id() is not null
    and exists (select 1 from public.teaching_assignments a
                where a.school_id = school_id and a.teacher_id = current_teacher_id()
                  and a.class_id = class_id and a.subject_id = subject_id)
    -- L'élève noté doit être de cette classe et de cette école : sans ce
    -- contrôle, un enseignant pouvait créer une note sur un élève d'une
    -- autre école (ou d'une autre classe) en reusing une affectation.
    and exists (select 1 from public.students s
                where s.id = student_id and s.school_id = school_id and s.class_id = class_id)
  );

create policy "grades_update_enseignant_affecte" on public.grades
  for update to authenticated
  using (
    school_is_writable(school_id)
    and school_id = current_school_id()
    and current_teacher_id() is not null
    and exists (select 1 from public.teaching_assignments a
                where a.school_id = school_id and a.teacher_id = current_teacher_id()
                  and a.class_id = class_id and a.subject_id = subject_id)
  )
  with check (
    school_is_writable(school_id)
    and school_id = current_school_id()
    and current_teacher_id() is not null
    and exists (select 1 from public.teaching_assignments a
                where a.school_id = school_id and a.teacher_id = current_teacher_id()
                  and a.class_id = class_id and a.subject_id = subject_id)
    and exists (select 1 from public.students s
                where s.id = student_id and s.school_id = school_id and s.class_id = class_id)
  );

-- Aucune politique de suppression : on remet une note à null (jamais deleted).

create policy "report_metas_select_scoped" on public.report_metas
  for select to authenticated
  using (
    user_can_query_data()
    and school_id = current_school_id()
    and (
      (
        current_teacher_id() is null
        and (
          public.current_role() in ('directeur','econome','surveillant')
          or (current_parent_id() is not null and exists (
            select 1 from public.students mps
            where mps.school_id = school_id and mps.id = student_id and mps.parent_id = current_parent_id()))
          or (current_student_id() is not null and student_id = current_student_id())
        )
      )
      or (current_teacher_id() is not null and exists (
        select 1 from public.students s join public.class_rooms c on c.id = s.class_id
        where s.id = student_id and c.head_teacher_id = current_teacher_id()))
    )
  );

create policy "report_metas_insert_responsables" on public.report_metas
  for insert to authenticated
  with check (
    school_is_writable(school_id)
    and school_id = current_school_id()
    and (public.current_role() in ('directeur','econome','surveillant')
      or (current_teacher_id() is not null and exists (
        select 1 from public.students s join public.class_rooms c on c.id = s.class_id
        where s.id = student_id and c.head_teacher_id = current_teacher_id())))
  );

create policy "report_metas_update_role_resume" on public.report_metas
  for update to authenticated
  using (
    school_is_writable(school_id)
    and school_id = current_school_id()
    and (public.current_role() in ('directeur','econome','surveillant')
      or current_teacher_id() is not null and exists (
        select 1 from public.students s join public.class_rooms c on c.id = s.class_id
        where s.id = student_id and c.head_teacher_id = current_teacher_id()))
  )
  with check (
    school_is_writable(school_id)
    and school_id = current_school_id()
    and (public.current_role() in ('directeur','econome','surveillant')
      or current_teacher_id() is not null and exists (
        select 1 from public.students s join public.class_rooms c on c.id = s.class_id
        where s.id = student_id and c.head_teacher_id = current_teacher_id()))
  );

grant select, insert, update on public.grades to authenticated;
revoke delete on public.grades from authenticated;
revoke select on public.report_metas from authenticated;
grant select, insert, update on public.report_metas to authenticated;
revoke delete on public.report_metas from authenticated;
