-- ============================================================================
-- SCOLIA — Phase 3 : structure pédagogique & élèves
-- Classes, matières, coefficients, affectations (conflits + plafond
-- d'affectations), enseignants, paramètres d'école, inscription directe
-- d'élèves (matricule + code enfant + échéancier), approbation/refus en lot.
-- Toute écriture client est refusée sauf directeur, dans SON école, avec un
-- abonnement en écriture (school_is_writable).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Fonctions de calculs purs (parité avec utils/payments.ts)
-- ----------------------------------------------------------------------------

-- Statut d'une échéance : paye / partiel / en_retard / a_venir.
create or replace function public.payment_status_of(
  p_amount int, p_paid int, p_due date, p_today date default current_date
) returns app_payment_status
language sql stable parallel safe as $$
  select case
    when p_paid >= p_amount then 'paye'
    when p_paid > 0 then 'partiel'
    when p_due <= p_today then 'en_retard'
    else 'a_venir'
  end::app_payment_status
$$;

-- Le statut est MAINTENU PAR UN TRIGGER : jamais calculé ni fourni par le client.
create or replace function public.set_payment_status() returns trigger
language plpgsql volatile as $$
begin
  new.status := public.payment_status_of(new.amount, new.paid_amount, new.due_date);
  return new;
end;
$$;

drop trigger if exists trg_set_payment_status on public.payments;
create trigger trg_set_payment_status
  before insert or update on public.payments
  for each row execute function public.set_payment_status();

-- ----------------------------------------------------------------------------
-- Échéancier d'un élève (identique à buildPaymentPlan du front) :
-- inscription + 10 mensualités (octobre → juillet de l'année scolaire) +
-- tenue (option) + frais annexes cantine/transport, remise fratrie arrondie
-- à 500 FCFA. Les dates dérivent de school_settings.school_year (jamais figées).
-- ----------------------------------------------------------------------------
create or replace function public.build_payment_plan(p_student_id uuid)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_student  record;
  v_settings record;
  v_class    record;
  v_fees     record;
  v_annex    jsonb;
  v_options  jsonb;
  v_sibling  boolean;
  v_discount numeric;
  v_mens     int;
  v_extra    int;
  v_y1       int;
  v_y2       int;
  v_month    int;
  v_year     int;
  v_label    text;
  v_count    int;
begin
  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception 'Élève introuvable.';
  end if;

  select * into v_settings from public.school_settings where school_id = v_student.school_id;
  select * into v_class from public.class_rooms where id = v_student.class_id;
  select * into v_fees from public.level_fees
    where school_id = v_student.school_id and level_id = v_class.level_id;
  if not found then
    return 0; -- frais non configurés pour ce niveau (comportement du front)
  end if;

  v_options := v_student.options;
  v_annex   := v_settings.annex_fees;

  -- Remise fratrie (autre élève inscrit avec le même parent).
  select coalesce((
    select true from public.students x
    where x.school_id = v_student.school_id
      and x.parent_id is not null
      and x.parent_id = v_student.parent_id
      and x.id <> p_student_id
    limit 1
  ), false) into v_sibling;

  v_discount := case when v_sibling then v_settings.sibling_discount else 0 end;
  v_mens := round(v_fees.mensualite * (1 - v_discount / 100.0) / 500) * 500;
  v_extra := (
    case when coalesce((v_options->>'cantine')::boolean, false) then (v_annex->>'cantine')::int else 0 end
    + case when coalesce((v_options->>'transport')::boolean, false) then (v_annex->>'transport')::int else 0 end
  );
  v_y1 := left(v_settings.school_year, 4)::int;
  v_y2 := right(v_settings.school_year, 4)::int;

  insert into public.payments (school_id, student_id, kind, label, due_date, amount)
  values (v_student.school_id, p_student_id, 'inscription',
          'Frais d''inscription ' || v_settings.school_year, make_date(v_y1, 9, 15), v_fees.inscription);
  v_count := 1;

  if coalesce((v_options->>'tenue')::boolean, false) and coalesce((v_annex->>'tenue')::int, 0) > 0 then
    insert into public.payments (school_id, student_id, kind, label, due_date, amount)
    values (v_student.school_id, p_student_id, 'tenue', 'Tenue scolaire', make_date(v_y1, 10, 1), (v_annex->>'tenue')::int);
    v_count := v_count + 1;
  end if;

  -- 10 mensualités : oct/nov/déc de la 1re année, jan → juil de la 2e année.
  for m in 1..10 loop
    if m <= 3 then
      v_year := v_y1;
      v_month := 9 + m;          -- oct=10, nov=11, déc=12
    else
      v_year := v_y2;
      v_month := m - 3;          -- jan=1 … juil=7
    end if;
    v_label := 'Mensualité de ' || (
      (array['octobre','novembre','décembre','janvier','février','mars','avril','mai','juin','juillet'])[m]
    ) || ' ' || v_year::text;
    insert into public.payments (school_id, student_id, kind, label, due_date, amount)
    values (v_student.school_id, p_student_id, 'mensualite', v_label, make_date(v_year, v_month, 5), v_mens + v_extra);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- RCPS métier fonctions définies sécurité (veillent sur les règles métier)
-- ----------------------------------------------------------------------------

-- Inscription DIRECTE d'un élève par la direction. Le parent est créé si
-- besoin. Gère : capacité de classe, limite d'élèves de la formule (message
-- identique au front), matricule séquentiel, code enfant, échéancier.
create or replace function public.enroll_student(
  p_class_id uuid,
  p_first_name text,
  p_last_name text,
  p_gender text,
  p_birth_date date,
  p_options jsonb,
  p_parent_id uuid,          -- mode « existing » sinon null
  p_parent_first text,       -- mode « new » sinon null
  p_parent_last text,
  p_parent_phone text,
  p_parent_email text,
  p_parent_address text
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_school uuid := current_school_id();
  v_role text := public.current_role();
  v_class record;
  v_class_pays int;
  v_students int;
  v_limit int;
  v_plan text;
  v_parent_id uuid;
  v_student_id uuid;
begin
  if v_role <> 'directeur' then
    raise exception 'Seule la direction peut inscrire un élève.';
  end if;
  if not public.school_is_writable(v_school) then
    raise exception 'Mode lecture seule : l''abonnement de votre école est expiré. Les modifications sont désactivées.';
  end if;

  -- Verrou par école : sérialise les inscriptions concurrentes pour éviter
  -- tout dépassement de la limite d'élèves de la formule.
  perform pg_advisory_xact_lock(hashtextextended('scolia:enroll:' || v_school::text, 0));

  select * into v_class from public.class_rooms
    where id = p_class_id and school_id = v_school;
  if not found then raise exception 'Classe introuvable.'; end if;

  v_class_pays := (select count(*) from public.students where school_id = v_school and class_id = p_class_id);
  if v_class_pays >= v_class.capacity then
    raise exception 'La classe % est complète (% places).', v_class.name, v_class.capacity;
  end if;

  -- Limite d'élèves de la formule (message exact de registrationService).
  select si.plan_name, coalesce(si.student_limit, null) into v_plan, v_limit
  from public.subscription_info(v_school) si;
  select count(*) into v_students from public.students where school_id = v_school;
  if v_limit is not null and v_students >= v_limit then
    raise exception 'Votre formule % est limitée à % élèves. Changez de formule pour approuver une nouvelle inscription.',
      v_plan, v_limit;
  end if;

  if p_parent_id is not null then
    if not exists (select 1 from public.parents where id = p_parent_id and school_id = v_school) then
      raise exception 'Parent introuvable dans votre école.';
    end if;
    v_parent_id := p_parent_id;
  else
    if p_parent_first is null or p_parent_last is null then
      raise exception 'Les coordonnées du parent sont obligatoires.';
    end if;
    insert into public.parents (school_id, first_name, last_name, phone, email, address)
    values (v_school, trim(p_parent_first), trim(p_parent_last), coalesce(trim(p_parent_phone), ''),
            coalesce(trim(p_parent_email), ''), coalesce(trim(p_parent_address), ''))
    returning id into v_parent_id;
  end if;

  insert into public.students (
    school_id, matricule, child_code, first_name, last_name, gender, birth_date, class_id, parent_id, options, enrolled_at
  ) values (
    v_school,
    public.next_student_matricule(v_school, (select school_year from public.school_settings where school_id = v_school)),
    public.generate_school_code(v_school, 6, 'child_code'),
    trim(p_first_name), trim(p_last_name),
    p_gender::app_gender, p_birth_date, p_class_id, v_parent_id,
    jsonb_build_object(
      'cantine', coalesce(p_options->>'cantine', 'false')::boolean,
      'transport', coalesce(p_options->>'transport', 'false')::boolean,
      'tenue', coalesce(p_options->>'tenue', 'false')::boolean
    ),
    current_date
  ) returning id into v_student_id;

  perform public.build_payment_plan(v_student_id);

  insert into public.audit_log (school_id, actor_id, actor_role, action, entity, entity_id)
  values (v_school, auth.uid(), v_role, 'enroll_student', 'students', v_student_id);

  return jsonb_build_object(
    'student_id', v_student_id,
    'parent_id', v_parent_id,
    'matricule', (select matricule from public.students where id = v_student_id),
    'child_code', (select child_code from public.students where id = v_student_id)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- Approbation / refus EN LOT des demandes (directeur uniquement, une
-- seule transaction) — parité avec registrationService.approve / reject.
-- ----------------------------------------------------------------------------
create or replace function public.decide_registration_requests(
  p_ids uuid[],
  p_approve boolean,
  p_reason text default null
)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_school uuid := current_school_id();
  v_role text := public.current_role();
  -- Nombre de demandes traitées : un entier, pas un record (le record rendait
  -- la comparaison 'v_requests = 0' invalide : record = integer).
  v_requests int;
  v_req record;
  v_students int;
  v_to_create int;
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

  -- Verrou par école : sérialise les approbations concurrentes pour éviter
  -- tout dépassement de la limite d'élèves de la formule.
  perform pg_advisory_xact_lock(hashtextextended('scolia:enroll:' || v_school::text, 0));

  -- La table temporaire est recréée à chaque appel : sans ce DROP, un second
  -- appel dans la même transaction échouait ('relation tmp_requests already
  -- exists').
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
      select count(*) into v_students from public.students where school_id = v_school;
      -- Le lot est refusé SI LE NOMBRE D'ÉLÈVES À CRÉER dépasse la formule
      -- payée. Contrôler seulement le nombre d'élèves déjà présents permetait
      -- d'approuver un lot arbitrairement grand en une seule fois et de
      -- dépasser la limite (contournement de la facturation).
      select count(*) into v_to_create from tmp_requests
      where role = 'eleve' and class_id is not null;
      if v_limit is not null and v_students + v_to_create > v_limit then
        raise exception 'Votre formule % est limitée à % élèves. Changez de formule pour approuver une nouvelle inscription.', v_plan, v_limit;
      end if;
    end if;
  end if;

  for v_req in select * from tmp_requests loop
    if p_approve then
      if v_req.role = 'eleve' and v_req.class_id is not null then
        select * into v_class from public.class_rooms where id = v_req.class_id;
        v_child_count := (select count(*) from public.students
                          where school_id = v_school and class_id = v_req.class_id);
        if v_child_count >= v_class.capacity then
          raise exception 'La classe % est complète (% places).', v_class.name, v_class.capacity;
        end if;

        -- Rattachement parent par e-mail (parité avec linkAccountToStudent) :
        -- le parent existe si la famille s'était déjà rattachée via un premier enfant.
        select id into v_parent_id from public.parents
        where school_id = v_school and lower(email) = lower(v_req.email)
        limit 1;
        if not found then
          insert into public.parents (school_id, first_name, last_name, phone, email, address)
          values (v_school, v_req.first_name, v_req.last_name, v_req.phone, v_req.email, '')
          returning id into v_parent_id;
        end if;

        insert into public.students (
          school_id, matricule, child_code, first_name, last_name, gender, birth_date, class_id, parent_id, enrolled_at
        ) values (
          v_school,
          public.next_student_matricule(v_school, (select school_year from public.school_settings where school_id = v_school)),
          public.generate_school_code(v_school, 6, 'child_code'),
          v_req.first_name, v_req.last_name,
          coalesce(v_req.gender, 'F'::app_gender),
          coalesce(v_req.birth_date, date '2015-01-01'),
          v_req.class_id, v_parent_id, current_date
        ) returning id into v_student_id;

        perform public.build_payment_plan(v_student_id);
        update public.profiles set status = 'ACTIF', student_id = v_student_id where id = v_req.user_id;
      else
        update public.profiles set status = 'ACTIF' where id = v_req.user_id;
      end if;
    else
      update public.profiles set status = 'DESACTIVE' where id = v_req.user_id;
    end if;

    update public.registration_requests
    set status = (case when p_approve then 'APPROUVEE' else 'REFUSEE' end)::app_request_status,
        decided_at = current_date,
        reason = case when p_approve or p_reason is null then reason else trim(p_reason) end
    where id = v_req.id;
  end loop;

  insert into public.announcements (school_id, title, body, author, audience_all, audience_roles)
  values (
    v_school,
    case when p_approve then 'Inscription(s) validée(s)' else 'Inscription(s) refusée(s)' end,
    case
      when p_approve then format('%s demande(s) d''inscription validée(s). Les familles peuvent désormais se connecter.', v_requests)
      else format('%s demande(s) refusée(s). %s', v_requests, coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Motif communiqué à la famille.'))
    end,
    'Direction', false, array['directeur']::text[]
  );

  insert into public.audit_log (school_id, actor_id, actor_role, action, entity, entity_id, payload)
  values (v_school, auth.uid(), v_role,
          case when p_approve then 'requests_approved' else 'requests_rejected' end,
          'registration_requests', null, jsonb_build_object('count', v_requests));

  return v_requests;
end;
$$;

-- ----------------------------------------------------------------------------
-- Grille d'affectations : remplacement d'une cellule (classe × matière).
-- Le plafond de 10 affectations par enseignant (MAX_ASSIGNMENTS_PER_TEACHER)
-- est appliqué côté serveur avec le message des conflits du front.
-- ----------------------------------------------------------------------------
create or replace function public.replace_cell_teachers(
  p_class_id uuid,
  p_subject_id uuid,
  p_teacher_ids uuid[]
)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_school uuid := current_school_id();
  v_role text := public.current_role();
  v_teacher uuid;
  v_count int;
begin
  if v_role <> 'directeur' then
    raise exception 'Seule la direction modifie les affectations.';
  end if;
  if not public.school_is_writable(v_school) then
    raise exception 'Mode lecture seule : l''abonnement de votre école est expiré. Les modifications sont désactivées.';
  end if;

  -- La classe ET la matière doivent appartenir à l'école de l'appelant :
  -- sans ce contrôle, un directeur pouvait affecter son enseignant à la
  -- classe d'une autre école (jointure croisée, forge de bulletins).
  if not exists (select 1 from public.class_rooms where id = p_class_id and school_id = v_school) then
    raise exception 'Classe introuvable dans votre école.';
  end if;
  if not exists (select 1 from public.subjects where id = p_subject_id and school_id = v_school) then
    raise exception 'Matière introuvable dans votre école.';
  end if;

  delete from public.teaching_assignments
  where school_id = v_school and class_id = p_class_id and subject_id = p_subject_id;

  foreach v_teacher in array coalesce(p_teacher_ids, array[]::uuid[]) loop
    if not exists (select 1 from public.teachers where id = v_teacher and school_id = v_school) then
      raise exception 'Cet enseignant n''appartient pas à votre école.';
    end if;
    select count(*) into v_count from public.teaching_assignments where teacher_id = v_teacher and school_id = v_school;
    if v_count >= 10 then
      raise exception '% % est surchargé : % affectations (maximum conseillé : 10).',
        (select first_name from public.teachers where id = v_teacher),
        (select last_name from public.teachers where id = v_teacher),
        v_count;
    end if;
    insert into public.teaching_assignments (school_id, teacher_id, class_id, subject_id)
    values (v_school, v_teacher, p_class_id, p_subject_id);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- Titulaire (élémentaire, attribue automatiquement toutes les matières) ou
-- professeur principal (moyen / secondaire).
-- ----------------------------------------------------------------------------
create or replace function public.set_class_head_teacher(
  p_class_id uuid,
  p_teacher_id uuid,
  p_mode text
)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_school uuid := current_school_id();
  v_role text := public.current_role();
  v_class record;
begin
  if v_role <> 'directeur' then
    raise exception 'Seule la direction modifie les enseignants responsables.';
  end if;
  if not public.school_is_writable(v_school) then
    raise exception 'Mode lecture seule : l''abonnement de votre école est expiré. Les modifications sont désactivées.';
  end if;

  select * into v_class from public.class_rooms where id = p_class_id and school_id = v_school;
  if not found then raise exception 'Classe introuvable.'; end if;
  if p_mode = 'titulaire' and v_class.cycle <> 'elementaire' then
    raise exception 'Cette classe n''est pas une classe élémentaire.';
  end if;
  if p_mode = 'principal' and v_class.cycle = 'elementaire' then
    raise exception 'Le professeur principal concerne le moyen et le secondaire.';
  end if;

  if v_class.head_teacher_id = p_teacher_id then
    return; -- rien à faire, aucune coupure d'affectations inutile
  end if;

  if p_mode = 'titulaire' then
    delete from public.teaching_assignments
    where school_id = v_school and class_id = p_class_id;
    if p_teacher_id is not null then
      if not exists (select 1 from public.teachers where id = p_teacher_id and school_id = v_school) then
        raise exception 'Cet enseignant n''appartient pas à votre école.';
      end if;
      insert into public.teaching_assignments (school_id, teacher_id, class_id, subject_id)
      select v_school, p_teacher_id, p_class_id, cs.subject_id
      from public.class_subjects cs
      where cs.class_id = p_class_id;
    end if;
  end if;

  update public.class_rooms set head_teacher_id = p_teacher_id where id = p_class_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Conflits d'affectations (parité avec utils/assignments.ts) : fonction
-- security definer appliquée à l'école courante.
-- ----------------------------------------------------------------------------
create or replace function public.assignment_conflicts()
returns table (conflict_id text, severity text, class_id uuid, subject_id uuid, teacher_id uuid, message text)
language sql stable security definer set search_path = public as $$
  with school as (select current_school_id() as sid),
  classes as (
    select c.id, c.name, c.cycle, c.head_teacher_id
    from public.class_rooms c, school
    where c.school_id = school.sid
  ),
  class_subjects as (
    select cs.class_id, cs.subject_id
    from public.class_subjects cs, school
    where cs.school_id = school.sid
  ),
  teacher_names as (
    select t.id, t.first_name || ' ' || t.last_name as name
    from public.teachers t, school
    where t.school_id = school.sid
  ),
  subject_names as (
    select su.id, su.name
    from public.subjects su, school
    where su.school_id = school.sid
  )
  -- Élémentaire sans instituteur titulaire
  select 'nt-' || c.id::text, 'error', c.id, null::uuid, null::uuid,
         c.name || ' : aucun instituteur titulaire.'
  from classes c
  where c.cycle = 'elementaire' and c.head_teacher_id is null
  union all
  -- Professeur principal manquant (moyen / secondaire)
  select 'nh-' || c.id::text, 'warning', c.id, null::uuid, null::uuid,
         c.name || ' : aucun professeur principal désigné.'
  from classes c
  where c.cycle <> 'elementaire' and c.head_teacher_id is null
  union all
  -- Matière sans professeur affecté
  select 'ns-' || cs.class_id::text || '-' || cs.subject_id::text, 'error',
         cs.class_id, cs.subject_id, null::uuid,
         c.name || ' · ' || su.name || ' : aucun professeur affecté.'
  from class_subjects cs
  join classes c on c.id = cs.class_id
  join subject_names su on su.id = cs.subject_id
  where not exists (
    select 1 from public.teaching_assignments a
    where a.class_id = cs.class_id and a.subject_id = cs.subject_id
      and a.school_id = (select sid from school)
  )
  union all
  -- Plusieurs professeurs affectés à la même cellule
  select 'dup-' || a.class_id::text || '-' || a.subject_id::text, 'warning',
         a.class_id, a.subject_id, null::uuid,
         c.name || ' · ' || su.name || ' : ' || a.n::text || ' professeurs affectés (' || a.names || ').'
  from (
    select ai.class_id, ai.subject_id, count(*)::int as n,
           string_agg(t2.first_name || ' ' || t2.last_name, ', ') as names
    from public.teaching_assignments ai
    join public.teachers t2 on t2.id = ai.teacher_id
    where ai.school_id = (select sid from school)
    group by ai.class_id, ai.subject_id
    having count(*) > 1
  ) a
  join classes c on c.id = a.class_id
  join subject_names su on su.id = a.subject_id
  union all
  -- Titulaire de plusieurs classes élémentaires
  select 'multi-' || c.head_teacher_id::text, 'error', null::uuid, null::uuid, c.head_teacher_id,
         tn.name || ' est titulaire de plusieurs classes (' || string_agg(c.name, ', ') || ').'
  from classes c
  join teacher_names tn on tn.id = c.head_teacher_id
  where c.cycle = 'elementaire'
  group by c.head_teacher_id, tn.name
  having count(*) > 1
  union all
  -- Enseignant surchargé
  select 'over-' || a.teacher_id::text, 'warning', null::uuid, null::uuid, a.teacher_id,
         tn.name || ' est surchargé : ' || a.n::text || ' affectations (maximum conseillé : 10).'
  from (
    select ai.teacher_id, count(*)::int as n
    from public.teaching_assignments ai
    where ai.school_id = (select sid from school)
    group by ai.teacher_id
    having count(*) > 10
  ) a
  join teacher_names tn on tn.id = a.teacher_id
$$;

-- ----------------------------------------------------------------------------
-- Classes ouvertes aux inscriptions (publique : page /inscription).
-- Ne retourne que {id, name, cycle, level_label, capacity, filled} —
-- aucune donnée personnelle. Cette fonction est callable par anon.
-- SCOLIA (audit M15) : p_matricule est optionnel pour compatibilité avec les
-- appels historiques (page /inscription) ; lorsqu'il est fourni, il DOIT
-- correspondre au matricule de l'école. registration_open reste exigé.
-- ----------------------------------------------------------------------------
create or replace function public.open_classes(p_school_id uuid, p_matricule text default null)
returns table (class_id uuid, name text, cycle app_cycle, level_label text, capacity int, filled int)
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

-- Ancienne signature supprimée : l'appel à un argument est couvert par le
-- défaut p_matricule = null (une seule signature = pas d'ambiguïté RPC).
drop function if exists public.open_classes(uuid);
revoke execute on function public.open_classes(uuid, text) from public;
grant execute on function public.open_classes(uuid, text) to anon, authenticated;

revoke execute on function public.enroll_student(uuid, text, text, text, date, jsonb, uuid, text, text, text, text, text) from anon, public;
grant execute on function public.enroll_student(uuid, text, text, text, date, jsonb, uuid, text, text, text, text, text) to authenticated;

revoke execute on function public.decide_registration_requests(uuid[], boolean, text) from anon, public;
grant execute on function public.decide_registration_requests(uuid[], boolean, text) to authenticated;

revoke execute on function public.replace_cell_teachers(uuid, uuid, uuid[]) from anon, public;
grant execute on function public.replace_cell_teachers(uuid, uuid, uuid[]) to authenticated;

revoke execute on function public.set_class_head_teacher(uuid, uuid, text) from anon, public;
grant execute on function public.set_class_head_teacher(uuid, uuid, text) to authenticated;

revoke execute on function public.assignment_conflicts() from anon;
grant execute on function public.assignment_conflicts() to authenticated;

revoke execute on function public.build_payment_plan(uuid) from anon, public;
grant execute on function public.build_payment_plan(uuid) to authenticated;

-- ============================================================================
-- Politiques RLS — structure pédagogique
-- Lecture : comptes actifs (et mot de passe changé) de SON école.
-- Écriture : DIRECTEUR de son école, abonnement en écriture autorisée.
-- ============================================================================

-- selected helper : tête de la condition d'écriture direction
create or replace function public.direction_can_write() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_role() = 'directeur'
    and user_can_query_data()
    and school_is_writable(current_school_id())
$$;

-- Classes -------------------------------------------------------------------
create policy "class_rooms_select_ecole" on public.class_rooms
  for select to authenticated
  using (user_can_query_data() and school_id = current_school_id());

create policy "class_rooms_insert_direction" on public.class_rooms
  for insert to authenticated
  with check (direction_can_write() and school_id = current_school_id());

create policy "class_rooms_update_direction" on public.class_rooms
  for update to authenticated
  using (direction_can_write() and school_id = current_school_id())
  with check (direction_can_write() and school_id = current_school_id());

create policy "class_rooms_delete_direction" on public.class_rooms
  for delete to authenticated
  using (direction_can_write() and school_id = current_school_id());

revoke update on public.class_rooms from authenticated;
grant update (name, capacity) on public.class_rooms to authenticated;

-- Matières ------------------------------------------------------------------
create policy "subjects_select_ecole" on public.subjects
  for select to authenticated
  using (user_can_query_data() and school_id = current_school_id());

create policy "subjects_insert_direction" on public.subjects
  for insert to authenticated
  with check (direction_can_write() and school_id = current_school_id());

create policy "subjects_update_direction" on public.subjects
  for update to authenticated
  using (direction_can_write() and school_id = current_school_id())
  with check (direction_can_write() and school_id = current_school_id());

create policy "subjects_delete_direction" on public.subjects
  for delete to authenticated
  using (direction_can_write() and school_id = current_school_id());

revoke update on public.subjects from authenticated;
grant update (name, cycles) on public.subjects to authenticated;

-- Coefficients par classe ----------------------------------------------------
create policy "class_subjects_select_ecole" on public.class_subjects
  for select to authenticated
  using (user_can_query_data() and school_id = current_school_id());

-- La classe et la matière doivent être celles de l'école de la ligne : sinon
-- une ligne de A référencerait une classe de B (jointure croisée).
create policy "class_subjects_insert_direction" on public.class_subjects
  for insert to authenticated
  with check (
    direction_can_write()
    and school_id = current_school_id()
    and exists (select 1 from public.class_rooms c where c.id = class_id and c.school_id = school_id)
    and exists (select 1 from public.subjects s where s.id = subject_id and s.school_id = school_id)
  );

create policy "class_subjects_update_direction" on public.class_subjects
  for update to authenticated
  using (direction_can_write() and school_id = current_school_id())
  with check (
    direction_can_write()
    and school_id = current_school_id()
    and exists (select 1 from public.class_rooms c where c.id = class_id and c.school_id = school_id)
    and exists (select 1 from public.subjects s where s.id = subject_id and s.school_id = school_id)
  );

create policy "class_subjects_delete_direction" on public.class_subjects
  for delete to authenticated
  using (direction_can_write() and school_id = current_school_id());

revoke update on public.class_subjects from authenticated;
grant update (coefficient) on public.class_subjects to authenticated;

-- Affectations ---------------------------------------------------------------
create policy "assignments_select_ecole" on public.teaching_assignments
  for select to authenticated
  using (user_can_query_data() and school_id = current_school_id());

create policy "assignments_insert_direction" on public.teaching_assignments
  for insert to authenticated
  with check (
    direction_can_write()
    and school_id = current_school_id()
    and exists (select 1 from public.teachers t where t.id = teacher_id and t.school_id = school_id)
    and exists (select 1 from public.class_rooms c where c.id = class_id and c.school_id = school_id)
    and exists (select 1 from public.subjects s where s.id = subject_id and s.school_id = school_id)
  );

create policy "assignments_delete_direction" on public.teaching_assignments
  for delete to authenticated
  using (direction_can_write() and school_id = current_school_id());

-- Enseignants ----------------------------------------------------------------
create policy "teachers_insert_direction" on public.teachers
  for insert to authenticated
  with check (direction_can_write() and school_id = current_school_id());

create policy "teachers_update_direction" on public.teachers
  for update to authenticated
  using (direction_can_write() and school_id = current_school_id())
  with check (direction_can_write() and school_id = current_school_id());

create policy "teachers_delete_direction" on public.teachers
  for delete to authenticated
  using (direction_can_write() and school_id = current_school_id());

revoke update on public.teachers from authenticated;
grant update (first_name, last_name, email, phone, specialties) on public.teachers to authenticated;

-- École / paramètres ----------------------------------------------------------
create policy "schools_update_directeur" on public.schools
  for update to authenticated
  using (direction_can_write() and id = current_school_id())
  with check (direction_can_write() and id = current_school_id());

revoke update on public.schools from authenticated, anon;
grant update (name, city, address, phone, email, logo_url, cycles, registration_open, auto_approve_students)
  on public.schools to authenticated;

create policy "school_settings_update_directeur" on public.school_settings
  for update to authenticated
  using (direction_can_write() and school_id = current_school_id())
  with check (direction_can_write() and school_id = current_school_id());

create policy "level_fees_write_direction" on public.level_fees
  for insert to authenticated
  with check (direction_can_write() and school_id = current_school_id());

create policy "level_fees_update_direction" on public.level_fees
  for update to authenticated
  using (direction_can_write() and school_id = current_school_id())
  with check (direction_can_write() and school_id = current_school_id());

create policy "level_fees_delete_direction" on public.level_fees
  for delete to authenticated
  using (direction_can_write() and school_id = current_school_id());

revoke update on public.level_fees from authenticated;
grant update (inscription, mensualite) on public.level_fees to authenticated;

-- ============================================================================
-- Triggers de validation métier (aucune écriture directe sensible sans contrôle)
-- ============================================================================

-- Suppression de classe refusée si elle contient des élèves.
create or replace function public.guard_class_delete() returns trigger
language plpgsql volatile as $$
begin
  if exists (select 1 from public.students where class_id = old.id) then
    raise exception 'Impossible de supprimer une classe qui contient des élèves.';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_guard_class_delete on public.class_rooms;
create trigger trg_guard_class_delete
  before delete on public.class_rooms
  for each row execute function public.guard_class_delete();

-- Capacité ne peut pas descendre sous l'effectif courant.
create or replace function public.guard_class_capacity() returns trigger
language plpgsql volatile as $$
begin
  if new.capacity < old.capacity
     and new.capacity < (select count(*) from public.students where class_id = new.id) then
    raise exception 'La classe contient déjà % élèves.', (select count(*) from public.students where class_id = new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_class_capacity on public.class_rooms;
create trigger trg_guard_class_capacity
  before update on public.class_rooms
  for each row execute function public.guard_class_capacity();

-- Nouvelle matière dans une classe élémentaire avec titulaire :
-- affectation automatique du titulaire (comportement setClassSubject du front).
create or replace function public.auto_assign_titular() returns trigger
language plpgsql volatile as $$
begin
  if (select c.cycle from public.class_rooms c where c.id = new.class_id) = 'elementaire'
     and (select c.head_teacher_id from public.class_rooms c where c.id = new.class_id) is not null then
    insert into public.teaching_assignments (school_id, teacher_id, class_id, subject_id)
    select new.school_id,
           (select c.head_teacher_id from public.class_rooms c where c.id = new.class_id),
           new.class_id, new.subject_id
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_assign_titular on public.class_subjects;
create trigger trg_auto_assign_titular
  after insert on public.class_subjects
  for each row execute function public.auto_assign_titular();

-- Retrait d'une matière d'une classe : suppressions des affectations liées.
create or replace function public.clean_assignments_on_subject_slot() returns trigger
language plpgsql volatile as $$
begin
  delete from public.teaching_assignments
  where school_id = old.school_id and class_id = old.class_id and subject_id = old.subject_id;
  return old;
end;
$$;

drop trigger if exists trg_clean_assignments on public.class_subjects;
create trigger trg_clean_assignments
  after delete on public.class_subjects
  for each row execute function public.clean_assignments_on_subject_slot();


