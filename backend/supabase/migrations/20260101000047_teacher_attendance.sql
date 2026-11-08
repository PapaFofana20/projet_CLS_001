-- ============================================================================
-- 00047 — Présences par l'enseignant (appel en classe).
--
-- Avant : seule la table absences existait, écrite en direct par le
-- surveillant (RLS « surveillant » uniquement), sans matière ni auteur.
--
-- Maintenant : le professeur / l'instituteur fait l'appel de sa classe
-- (classe · matière · date) via la RPC set_attendance : les élèves cochés
-- absents / en retard sont insérés, les autres sont considérés présents.
-- La RPC remplace l'appel du jour pour ce couple classe/matière (idempotent)
-- et est journalisée. Les données sont visibles immédiatement par le
-- surveillant, la direction et l'enseignant concerné (RLS élargie en lecture).
-- ============================================================================

alter table public.absences
  add column if not exists subject_id uuid references public.subjects (id) on delete set null,
  add column if not exists recorded_by uuid references public.profiles (id) on delete set null;

-- Déduplication avant l'index unique (doublons possibles via l'ancien insert direct).
delete from public.absences
where ctid in (
  select ctid from (
    select ctid,
           row_number() over (
             partition by school_id, student_id, absence_date, subject_id
             order by created_at
           ) as rn
    from public.absences
  ) d
  where rn > 1
);

create unique index if not exists idx_absences_unique_day_subject
  on public.absences (school_id, student_id, absence_date, (coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid)));

create index if not exists idx_absences_day_subject
  on public.absences (school_id, absence_date, subject_id);

-- ----------------------------------------------------------------------------
-- RLS lecture : personnel de l'école + enseignants sur leurs classes.
-- ----------------------------------------------------------------------------
drop policy if exists "absences_select_surveillant" on public.absences;
create policy "absences_select_staff" on public.absences
  for select to authenticated
  using (
    school_id = public.current_school_id()
    and user_can_query_data()
    and (
      public.current_role() in ('directeur', 'econome', 'secretaire', 'surveillant')
      or (
        public.current_role() in ('professeur', 'instituteur')
        and exists (
          select 1
          from public.students s
          where s.id = student_id
            and s.school_id = public.current_school_id()
            and (
              exists (
                select 1 from public.teaching_assignments a
                where a.teacher_id = public.current_teacher_id()
                  and a.class_id = s.class_id
                  and a.school_id = public.current_school_id()
              )
              or exists (
                select 1 from public.class_rooms c
                where c.id = s.class_id
                  and c.head_teacher_id = public.current_teacher_id()
              )
            )
        )
      )
    )
  );

-- L'insert direct reste réservé au surveillant et à la direction ;
-- les enseignants passent par set_attendance (security definer).
drop policy if exists "absences_insert_surveillant" on public.absences;
create policy "absences_insert_surveillant" on public.absences
  for insert to authenticated
  with check (
    school_id = public.current_school_id()
    and public.current_role() in ('surveillant', 'directeur')
    and user_can_query_data()
    and public.school_is_writable(school_id)
    and exists (
      select 1 from public.students s
      where s.id = student_id and s.school_id = public.current_school_id()
    )
  );

-- ----------------------------------------------------------------------------
-- Appel d'une classe : remplace les absences/retards du jour (classe·matière).
-- p_records : [{ student_id, type: 'absence' | 'retard' }] — les élèves de la
-- classe absents de cette liste sont présents.
-- ----------------------------------------------------------------------------
create or replace function public.set_attendance_unchecked(
  p_class_id uuid,
  p_subject_id uuid,
  p_date date,
  p_records jsonb
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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

  -- Validation de chaque ligne avant toute écriture.
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

  -- Remplacement de l'appel du jour pour ce couple classe/matière.
  delete from public.absences a
  where a.school_id = v_school
    and a.absence_date = p_date
    and a.subject_id is not distinct from p_subject_id
    and a.student_id in (select s.id from public.students s where s.class_id = p_class_id and s.school_id = v_school);

  for v_rec in select * from jsonb_array_elements(coalesce(p_records, '[]'::jsonb)) loop
    v_sid := nullif(v_rec->>'student_id', '')::uuid;
    v_type := v_rec->>'type';
    insert into public.absences (school_id, student_id, absence_date, absence_type, motif, justified, subject_id, recorded_by)
    values (v_school, v_sid, p_date, v_type::app_absence_type, '', false, p_subject_id, auth.uid());
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

revoke execute on function public.set_attendance_unchecked(uuid, uuid, date, jsonb)
  from public, anon, authenticated;

create or replace function public.set_attendance(p_class_id uuid, p_subject_id uuid, p_date date, p_records jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.assert_active_account();
  return public.set_attendance_unchecked(p_class_id, p_subject_id, p_date, p_records);
end;
$$;

revoke execute on function public.set_attendance(uuid, uuid, date, jsonb) from anon, public;
grant execute on function public.set_attendance(uuid, uuid, date, jsonb) to authenticated;
