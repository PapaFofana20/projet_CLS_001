-- ============================================================================
-- 00054 — Durcissement vague 5 de l'audit (14/11/2026).
--
-- Corrige les failles critiques et majeures restantes :
--
--   C1. finish_parent_registration : était re-passée à `authenticated` (00053)
--       avec le MATRICULE SÉQUENTIEL comme seule preuve (EC260001, EC260002…
--       ~10^4 valeurs/an, semi-public) → énumération d'élèves + rattachement
--       d'un enfant qui n'est pas le sien. Correction :
--         * retour à service_role UNIQUEMENT (l'API Express l'appelle) ;
--         * preuve d'identité par DATE DE NAISSANCE (modèle 00050) ;
--         * garde d'abonnement school_is_writable (fail-closed, 00050) ;
--         * plafond de 100 demandes EN_ATTENTE (modèle 00036) ;
--         * (M3) auto-approbation : l'enfant est rattaché (students.parent_id),
--           sinon le parent ACTIF ne voit AUCUN élève.
--
--   C2. link_child : matricule séquentiel comme seule preuve → un parent
--       peut s'attribuer n'importe quel enfant non rattaché de son école.
--       Correction : DATE DE NAISSANCE en second facteur + rate limit DB +
--       messages génériques (pas d'oracle « matricule introuvable »).
--
--   C3. students_select_ecole : le scoping par rôle (00029) avait été PERDU
--       en 00038 (tous les comptes actifs lisaient tous les élèves de
--       l'école : matricules, dates de naissance, options). Correction :
--       scoping 00029 restauré + school_is_readable (00038) conservé.
--
--   M1. totp_secret : la colonne est lisible via les policies admin_agents
--       (self/superadmin). Correction : REVOKE SELECT au niveau colonne —
--       seul le service_role la lit (le secret est déchiffré côté serveur).
--
--   M2. finish_student_registration : l'élève (et son matricule, qui
--       consomme le compteur) était inséré AVANT le contrôle de capacité —
--       avec, en auto-approbation, un check post-insert qui rejetait la
--       classe au dernier siège (off-by-one). Correction : contrôle AVANT
--       l'insert, en excluant les demandes EN_ATTENTE du décompte.
--
--   M3b. decide_registration_requests (branche parent) : le parent approuvé
--       manuellement n'était jamais rattaché à l'enfant (students.parent_id
--       jamais posé) → compte « fantôme » ne voyant aucun élève.
--
--   M4. timetables / timetable_courses : lecture sans school_is_readable —
--       une école expirée (> 7 j) restait lisible alors que tout le reste
--       est bloqué. Alignement sur M10 (00038).
--
--   m1. absences : subject_id non contrôlé à l'INSERT direct — un
--       surveillant pouvait poser une matière d'une AUTRE école.
--
--   +  admin_mfa_sessions : purge des doublons + contrainte UNIQUE(agent_id)
--       (deux lignes actives pour le même agent faisaient renvoyer
--       PGRST116 à .maybeSingle() → console admin verrouillée).
--   +  timetable_courses_time_order (00052, NOT VALID) : validation.
--
-- Idempotente : peut être rejouée sans erreur.
-- ============================================================================

-- ============================================================================
-- 1. (C1) finish_parent_registration — preuve d'identité + service_role
-- ============================================================================
drop function if exists public.finish_parent_registration(uuid, uuid, text, text, text, text, text);
drop function if exists public.finish_parent_registration(uuid, uuid, text, text, text, text, text, date);

create or replace function public.finish_parent_registration(
  p_user_id uuid,
  p_school_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_student_matricule text,
  p_birth_date date
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_child record;
  v_request_id uuid;
  v_parent_id uuid;
  v_approved boolean := false;
  v_school record;
  v_pending int;
begin
  if p_user_id is null then raise exception 'Compte introuvable.'; end if;
  select coalesce(trim(p_student_matricule), '')::text into p_student_matricule;
  if p_birth_date is null then
    raise exception 'Date de naissance requise pour rattacher le compte.';
  end if;

  select * into v_school from public.schools where id = p_school_id;
  if not found then raise exception 'École introuvable.'; end if;

  if not v_school.registration_open then
    raise exception 'Les inscriptions sont fermées dans cette école.';
  end if;

  -- Garde d'abonnement fail-closed (comme finish_student_registration) :
  -- toute erreur/NULL bloque l'inscription.
  if public.school_is_writable(p_school_id) is distinct from true then
    raise exception 'Les inscriptions sont momentanément indisponibles dans cette école (abonnement expiré).';
  end if;

  -- Plafond de demandes en attente (modèle 00036) : l'inscription ne doit
  -- pas pouvoir inonder la file de validation de la direction.
  select count(*) into v_pending
  from public.registration_requests
  where school_id = p_school_id and status = 'EN_ATTENTE';
  if v_pending >= 100 then
    raise exception 'Cette école a déjà trop de demandes en attente. Contactez l''école directement.';
  end if;

  if exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Un compte existe déjà avec cet e-mail.';
  end if;

  select * into v_child
  from public.students
  where school_id = p_school_id and upper(matricule) = upper(trim(p_student_matricule))
  limit 1;

  -- Message UNIQUE et générique (matricule inconnu OU date de naissance
  -- erronée) : la fonction ne doit pas servir d'oracle d'énumération des
  -- matricules séquentielles.
  if not found then
    raise exception 'Vérification échouée. Vérifiez le matricule et la date de naissance de l''élève auprès de l''école.';
  end if;
  if v_child.birth_date is distinct from p_birth_date then
    raise exception 'Vérification échouée. Vérifiez le matricule et la date de naissance de l''élève auprès de l''école.';
  end if;

  insert into public.parents (school_id, first_name, last_name, phone, email, address)
  values (p_school_id, trim(p_first_name), trim(p_last_name), trim(p_phone), trim(p_email), '')
  returning id into v_parent_id;

  insert into public.profiles (id, school_id, role, status, first_name, last_name, phone, email, parent_id)
  values (p_user_id, p_school_id, 'parent', 'EN_ATTENTE', trim(p_first_name), trim(p_last_name), trim(p_phone), trim(p_email), v_parent_id);

  insert into public.registration_requests
    (school_id, user_id, role, first_name, last_name, email, phone, class_id, child_code)
  values
    (p_school_id, p_user_id, 'parent', trim(p_first_name), trim(p_last_name), trim(p_email), trim(p_phone),
     v_child.class_id, v_child.child_code)
  returning id into v_request_id;

  if v_school.auto_approve_students then
    v_approved := true;
    update public.profiles set status = 'ACTIF' where id = p_user_id;
    update public.registration_requests set status = 'APPROUVEE', decided_at = current_date where id = v_request_id;

    -- (M3) Rattacher l'enfant SANS écraser un parent déjà posé : sinon le
    -- parent ACTIF ne voit aucun élève (toutes les policies « branche
    -- parent » filtrent sur students.parent_id = current_parent_id()).
    update public.students
    set parent_id = v_parent_id
    where id = v_child.id
      and (parent_id is null or parent_id = v_parent_id);

    insert into public.audit_log (school_id, actor_id, action, entity, entity_id, payload)
    values (p_school_id, p_user_id, 'auto_approve_parent', 'registration_requests', v_request_id, jsonb_build_object('student_id', v_child.id));
  end if;

  return jsonb_build_object(
    'request_id', v_request_id,
    'approved', v_approved,
    'child_id', v_child.id,
    'child_name', v_child.first_name || ' ' || v_child.last_name
  );
end;
$$;

-- service_role UNIQUEMENT (l'API Express l'appelle avec la clé de service).
-- AUCUN appel direct depuis le navigateur : c'était la faille C1 (00053).
revoke execute on function public.finish_parent_registration(uuid, uuid, text, text, text, text, text, date)
  from public, anon, authenticated;
grant execute on function public.finish_parent_registration(uuid, uuid, text, text, text, text, text, date)
  to service_role;

-- ============================================================================
-- 2. (C2) link_child — date de naissance en second facteur + rate limit
-- ============================================================================
drop function if exists public.link_child(text);
drop function if exists public.link_child(text, date);

create or replace function public.link_child(p_student_matricule text, p_birth_date date)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_profil record;
  v_child record;
begin
  perform public.assert_active_account();

  -- Rate limit par compte : 10 rattachements/heure. Sans borne, un parent
  -- balaie les matricules séquentielles de son école en quelques minutes.
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

  -- Message générique (même texte pour « matricule inconnu » et « date de
  -- naissance erronée ») : pas d'oracle d'énumération.
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

revoke execute on function public.link_child(text, date) from anon, public;
grant execute on function public.link_child(text, date) to authenticated;

-- ============================================================================
-- 3. (C3) students_select_ecole — scoping par rôle restauré (00029) +
--         school_is_readable (00038). L'état final 00038 donnait accès à
--         tous les élèves de l'école à tout compte actif (matricules,
--         dates de naissance, options) — ce qui détruisait la preuve
--         d'identité de 00050/00054 et fournissait la liste des matricules
--         rendant C1/C2 triviales.
-- ============================================================================
drop policy if exists "students_select_ecole" on public.students;
create policy "students_select_ecole" on public.students
  for select to authenticated
  using (
    public.user_can_query_data()
    and school_id = public.current_school_id()
    and public.school_is_readable(school_id)
    and (
      public.current_role() in ('directeur', 'econome', 'secretaire', 'surveillant')
      or (public.current_role() = 'eleve' and id = public.current_student_id())
      or (public.current_role() = 'parent' and parent_id = public.current_parent_id())
      or (
        public.current_role() in ('instituteur', 'professeur')
        and (
          class_id in (
            select ta.class_id from public.teaching_assignments ta
            where ta.teacher_id = public.current_teacher_id()
              and ta.school_id = public.current_school_id()
          )
          or class_id in (
            select c.id from public.class_rooms c
            where c.head_teacher_id = public.current_teacher_id()
              and c.school_id = public.current_school_id()
          )
        )
      )
    )
  );

-- ============================================================================
-- 4. (M1) totp_secret : lecture réservée au service_role (niveau colonne).
--    Les policies admin_agents (self / superadmin) continuaient d'exposer
--    le secret TOTP de l'agent (voire de TOUS les agents au superadmin) :
--    l'agent pouvait alors valider lui-même son second facteur.
-- ============================================================================
revoke select (totp_secret) on public.admin_agents from anon, authenticated;
-- service_role conserve son GRANT ALL (table) → lecture inchangée côté API.
comment on column public.admin_agents.totp_secret is
  'Secret TOTP chiffré (AES-256-GCM, secretCrypto). Lecture réservée à service_role (REVOKE colonne 00054).';

-- ============================================================================
-- 5. (M2) finish_student_registration — contrôle de capacité AVANT l'insert
--    (même signature 9 args). Avant : élève + matricule consommés, PUIS
--    rejet en auto-approbation (« classe complète » au dernier siège).
--    Le décompte exclut les élèves EN_ATTENTE (profil en demande) : ils ne
--    occupent pas encore de siège ; les fiches sans profil (legacy) comptent.
-- ============================================================================
create or replace function public.finish_student_registration(
  p_user_id uuid,
  p_school_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_gender text,
  p_birth_date date,
  p_class_id uuid
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_profile_exists boolean;
  v_request_id uuid;
  v_approved boolean := false;
  v_student_id uuid;
  v_school record;
  v_child_code text;
  v_pending int;
  v_class record;
  v_seat_count int;
begin
  if p_user_id is null then raise exception 'Compte introuvable.'; end if;
  if p_class_id is null then raise exception 'Sélectionnez une classe.'; end if;

  select * into v_school from public.schools where id = p_school_id;
  if not found then raise exception 'École introuvable.'; end if;

  if not v_school.registration_open then
    raise exception 'Les inscriptions sont fermées dans cette école.';
  end if;

  if not public.school_is_writable(p_school_id) then
    raise exception 'Les inscriptions sont momentanément indisponibles dans cette école (abonnement expiré).';
  end if;

  select count(*) into v_pending
  from public.registration_requests
  where school_id = p_school_id and status = 'EN_ATTENTE';
  if v_pending >= 100 then
    raise exception 'Cette école a déjà trop de demandes en attente. Contactez l''école directement.';
  end if;

  if not exists (
    select 1 from public.class_rooms where id = p_class_id and school_id = p_school_id
  ) then
    raise exception 'Cette classe n''appartient pas à cette école.';
  end if;

  select exists (select 1 from public.profiles where id = p_user_id) into v_profile_exists;
  if v_profile_exists then
    raise exception 'Un compte existe déjà avec cet e-mail.';
  end if;

  -- (M2) Contrôle de capacité AVANT toute écriture : l'élève n'est créé
  -- (et le compteur de matricules consommé) que si la classe a une place.
  select * into v_class from public.class_rooms where id = p_class_id;
  select count(*) into v_seat_count
  from public.students s
  where s.school_id = p_school_id
    and s.class_id = p_class_id
    and not exists (
      select 1 from public.profiles pr
      where pr.student_id = s.id and pr.status = 'EN_ATTENTE'
    );
  if v_seat_count >= v_class.capacity then
    raise exception 'La classe % est complète (% places).', v_class.name, v_class.capacity;
  end if;

  -- Générer le code élève MAINTENANT (6 caractères, unique par école)
  v_child_code := public.generate_school_code(p_school_id, 6, 'child_code');

  -- Créer l'élève MAINTENANT avec son code, parent_id = null pour l'instant
  insert into public.students (
    school_id, matricule, child_code, first_name, last_name, gender, birth_date, class_id, parent_id, enrolled_at
  ) values (
    p_school_id,
    public.next_student_matricule(p_school_id, (select school_year from public.school_settings where school_id = p_school_id)),
    v_child_code,
    trim(p_first_name), trim(p_last_name),
    coalesce(p_gender::app_gender, 'F'::app_gender),
    coalesce(p_birth_date, date '2015-01-01'),
    p_class_id, null, current_date
  ) returning id into v_student_id;

  -- Profil élève EN_ATTENTE, mais déjà lié à l'élève (student_id)
  insert into public.profiles (id, school_id, role, status, first_name, last_name, phone, email, student_id)
  values (p_user_id, p_school_id, 'eleve', 'EN_ATTENTE', trim(p_first_name), trim(p_last_name), trim(p_phone), trim(p_email), v_student_id);

  -- Demande d'inscription
  insert into public.registration_requests
    (school_id, user_id, role, first_name, last_name, email, phone, gender, birth_date, class_id)
  values
    (p_school_id, p_user_id, 'eleve', trim(p_first_name), trim(p_last_name), trim(p_email), trim(p_phone),
     p_gender::app_gender, p_birth_date, p_class_id)
  returning id into v_request_id;

  -- Approbation automatique si activée (la capacité est déjà validée)
  if v_school.auto_approve_students then
    select not coalesce((
      select si.limit_reached
      from public.subscription_info(p_school_id) si
    ), false) into v_approved;
    if v_approved and not public.school_is_writable(p_school_id) then
      v_approved := false; -- école en lecture seule : décision manuelle reportée
    end if;
  end if;

  if v_approved then
    -- Échéancier de l'élève
    perform public.build_payment_plan(v_student_id);

    update public.profiles set status = 'ACTIF' where id = p_user_id;

    update public.registration_requests
    set status = 'APPROUVEE', decided_at = current_date
    where id = v_request_id;

    insert into public.audit_log (school_id, actor_id, action, entity, entity_id, payload)
    values (p_school_id, p_user_id, 'auto_approve_student', 'registration_requests', v_request_id, jsonb_build_object('student_id', v_student_id));
  end if;

  -- Retourner AUSSI le child_code pour l'afficher au parent/élève
  return jsonb_build_object(
    'request_id', v_request_id,
    'approved', v_approved,
    'student_id', v_student_id,
    'child_code', v_child_code
  );
end;
$$;

revoke execute on function public.finish_student_registration(uuid, uuid, text, text, text, text, text, date, uuid)
  from public, anon, authenticated;
grant execute on function public.finish_student_registration(uuid, uuid, text, text, text, text, text, date, uuid)
  to service_role;

-- ============================================================================
-- 6. (M3b) decide_registration_requests_impl — rattacher l'enfant quand une
--    DEMANDE PARENT est approuvée manuellement (sinon le parent activé ne
--    voit aucun élève). L'enfant est retrouvé via child_code posé à
--    l'inscription (00028/00053) : jamais par homonymie (H3 conservé).
-- ============================================================================
create or replace function public.decide_registration_requests_impl(
  p_ids uuid[],
  p_approve boolean,
  p_reason text default null
)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_school uuid := current_school_id();
  v_role text := public.current_role();
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

  perform pg_advisory_xact_lock(hashtextextended('scolia:enroll:' || v_school::text, 0));

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

        -- Rattachement parent par e-mail
        select id into v_parent_id from public.parents
        where school_id = v_school and lower(email) = lower(v_req.email)
        limit 1;
        if not found then
          insert into public.parents (school_id, first_name, last_name, phone, email, address)
          values (v_school, v_req.first_name, v_req.last_name, v_req.phone, v_req.email, '')
          returning id into v_parent_id;
        end if;

        -- (H3) L'élève est retrouvé par l'index posé à l'inscription sur le
        -- profil de CE compte (profiles.student_id). AUCUNE recherche par
        -- prénom+nom+date : un compte inscrit avec l'identité d'un enfant
        -- réel ne peut plus hériter de son dossier à l'approbation.
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

        -- Échéancier
        perform public.build_payment_plan(v_student_id);

        -- Lier le profil à l'élève
        update public.profiles set status = 'ACTIF', student_id = v_student_id where id = v_req.user_id;

        update public.registration_requests
        set status = 'APPROUVEE', decided_at = current_date, reason = p_reason
        where id = v_req.id;

        insert into public.audit_log (school_id, actor_id, actor_role, action, entity, entity_id, payload)
        values (v_school, v_req.user_id, 'approve_student', 'registration_requests', v_req.id, jsonb_build_object('student_id', v_student_id, 'child_code', (select child_code from public.students where id = v_student_id)));
      else
        -- Parent (ou élève sans classe) : activation...
        update public.profiles set status = 'ACTIF' where id = v_req.user_id;
        update public.registration_requests
        set status = 'APPROUVEE', decided_at = current_date, reason = p_reason
        where id = v_req.id;

        -- (M3b) ...ET rattachement de l'enfant (child_code posé à
        -- l'inscription). Sans cela, le parent ACTIF ne voit AUCUN élève :
        -- toutes les policies « branche parent » filtrent sur
        -- students.parent_id = current_parent_id().
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
      -- REFUS (H3) : suppression UNIQUEMENT de l'élève créé par CETTE
      -- inscription, retrouvé via profiles.student_id. La suppression
      -- « par homonymie » pouvait effacer l'enfant légitime d'une autre
      -- famille (avec cascades notes/paiements/absences/messagerie).
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

-- Droits inchangés (00036) : _impl → service_role ; wrapper → authenticated.
revoke execute on function public.decide_registration_requests_impl(uuid[], boolean, text)
  from public, anon, authenticated;
grant execute on function public.decide_registration_requests_impl(uuid[], boolean, text)
  to service_role;

-- ============================================================================
-- 7. (M4) Emplois du temps : lecture alignée sur school_is_readable
--    (une école expirée > 7 jours ne lit plus ses EDT, comme le reste).
-- ============================================================================
drop policy if exists "Lecture des emplois du temps de son école" on public.timetables;
create policy "Lecture des emplois du temps de son école"
  on public.timetables
  for select
  to authenticated
  using (
    public.user_can_query_data()
    and school_id = public.current_school_id()
    and public.school_is_readable(school_id)
    and (status = 'published' or public.current_role() = 'directeur')
  );

drop policy if exists "Lecture des cours d'un emploi du temps accessible" on public.timetable_courses;
create policy "Lecture des cours d'un emploi du temps accessible"
  on public.timetable_courses
  for select
  to authenticated
  using (
    public.user_can_query_data()
    and public.school_is_readable(public.current_school_id())
    and exists (
      select 1
      from public.timetables t
      where t.id = timetable_id
        and t.school_id = public.current_school_id()
        and (t.status = 'published' or public.current_role() = 'directeur')
    )
  );

-- ============================================================================
-- 8. (m1) absences — INSERT direct : subject_id doit appartenir à l'école
--    (sinon un surveillant pouvait poser une matière d'une autre école).
-- ============================================================================
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
    and (
      subject_id is null
      or exists (
        select 1 from public.subjects sub
        where sub.id = subject_id and sub.school_id = public.current_school_id()
      )
    )
  );

-- ============================================================================
-- 9. admin_mfa_sessions : une seule session active par agent.
--    Purge des lignes existantes (jetons pré-auth 5 min — sans valeur de
--    conservation) puis contrainte UNIQUE(agent_id) : deux lignes actives
--    faisaient renvoyer PGRST116 à .maybeSingle() côté /admin/auth et
--    verrouillaient la console admin en boucle « Second facteur requis ».
-- ============================================================================
delete from public.admin_mfa_sessions;
drop index if exists idx_admin_mfa_sessions_agent_id;
alter table public.admin_mfa_sessions
  add constraint admin_mfa_sessions_agent_unique unique (agent_id);
create index if not exists idx_admin_mfa_sessions_expires_at
  on public.admin_mfa_sessions(expires_at);

-- ============================================================================
-- 10. 00052 : la contrainte NOT VALID est désormais VALIDATÉE (les données
--     historiques invalides, s'il y en avait, auraient déjà été rejetées
--     par la base ; la validation échouerait sinon — idempotent).
-- ============================================================================
alter table public.timetable_courses
  validate constraint timetable_courses_time_order;

-- ============================================================================
-- Fin 00054
-- ============================================================================
