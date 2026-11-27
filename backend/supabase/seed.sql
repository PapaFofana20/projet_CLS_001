-- ============================================================================
-- SCOLIA — Seed local (développement uniquement)
-- ⚠ NE JAMAIS APPLIQUER EN PRODUCTION : crée une école de démo et des comptes
-- test dont le mot de passe est public et documenté plus bas. db-push.mjs exclut
-- volontairement ce fichier (--include-seed supprimé).
-- Les référentiels globaux (levels, plans) sont dans la migration
-- 20260101000013_referentiels_globaux.sql — plus besoin ici.
-- ============================================================================

-- ============================================================================
-- École de DÉMONSTRATION (développement local).
-- INTERDICTION FORMELLE : ne JAMAIS charger ce seed sur un environnement
-- accessible en production. Le mot de passe des comptes de test est défini
-- en clair dans ce fichier (haché à la volée par pgcrypto) et est donc
-- publiquement connu : il ne doit servir qu'à un `supabase db reset` local.
-- Préfixes d'uuid : aa=école, bb=enseignants, cc=parent, dd=élèves,
-- ee=classes, ff=matières, 00x=utilisateurs auth.
-- ============================================================================

do $$
declare
  v_school       uuid := '00000000-0000-0000-0000-00000000aa01';
  v_teacher1     uuid := '00000000-0000-0000-0000-00000000bb01';
  v_teacher2     uuid := '00000000-0000-0000-0000-00000000bb02';
  v_parent1      uuid := '00000000-0000-0000-0000-00000000cc01';
  v_student1     uuid := '00000000-0000-0000-0000-00000000dd01';
  v_student2     uuid := '00000000-0000-0000-0000-00000000dd02';
  v_student3     uuid := '00000000-0000-0000-0000-00000000dd03';
  v_class1       uuid := '00000000-0000-0000-0000-00000000ee01';
  v_class2       uuid := '00000000-0000-0000-0000-00000000ee02';
  v_sub1         uuid := '00000000-0000-0000-0000-00000000ff01';
  v_sub2         uuid := '00000000-0000-0000-0000-00000000ff02';
  v_sub3         uuid := '00000000-0000-0000-0000-00000000ff03';
  v_sub4         uuid := '00000000-0000-0000-0000-00000000ff04';
  v_user_dir     uuid := '00000000-0000-0000-0000-00000000000a';
  v_user_teach   uuid := '00000000-0000-0000-0000-0000000000bb';
  v_user_parent  uuid := '00000000-0000-0000-0000-0000000000cc';
  v_user_econ    uuid := '00000000-0000-0000-0000-0000000000ee';
  v_user_student uuid := '00000000-0000-0000-0000-0000000000dd';
  -- Mot de passe de DÉMO uniquement (jamais en production — voir en-tête).
  v_password     text := crypt('demo1234!', gen_salt('bf', 10));
begin
  -- École active : abonnement payé (matricule attribué).
  insert into public.schools (id, name, matricule, city, address, phone, email, cycles)
  values (v_school, 'École demo SCOLIA', 'X7K9Q', 'Dakar', '12 rue de la Corniche', '771234567',
          'demo@scol.sn', array['elementaire','moyen','secondaire']::app_cycle[])
  on conflict (id) do nothing;

  insert into public.school_settings (school_id, school_year, period_type, current_period, annex_fees, sibling_discount)
  values (v_school, '2026-2027', 'semestre', 'S1',
          '{"cantine": 10000, "transport": 15000, "tenue": 12000}'::jsonb, 10)
  on conflict (school_id) do nothing;

  insert into public.level_fees (school_id, level_id, inscription, mensualite)
  select v_school, id, 35000, 27500 from public.levels where cycle = 'elementaire'
  union all
  select v_school, id, 40000, 32500 from public.levels where cycle = 'moyen'
  union all
  select v_school, id, 50000, 40000 from public.levels where cycle = 'secondaire'
  on conflict (school_id, level_id) do nothing;

  insert into public.subjects (id, school_id, name, cycles) values
    (v_sub1, v_school, 'Français', array['elementaire','moyen','secondaire']::app_cycle[]),
    (v_sub2, v_school, 'Mathématiques', array['elementaire','moyen','secondaire']::app_cycle[]),
    (v_sub3, v_school, 'Histoire-Géographie', array['elementaire','moyen','secondaire']::app_cycle[]),
    (v_sub4, v_school, 'Éducation physique et sportive', array['elementaire','moyen','secondaire']::app_cycle[])
  on conflict (id) do nothing;

  insert into public.teachers (id, school_id, kind, first_name, last_name, email, phone, specialties) values
    (v_teacher1, v_school, 'instituteur', 'Aminata', 'Diop', 'aminata.diop@scol.sn', '773000001', '{}'),
    (v_teacher2, v_school, 'professeur', 'Moussa', 'Ndiaye', 'moussa.ndiaye@scol.sn', '773000002',
     array['Mathématiques', 'Sciences'])
  on conflict (id) do nothing;

  insert into public.class_rooms (id, school_id, name, level_id, cycle, head_teacher_id, capacity) values
    (v_class1, v_school, 'CM1-A', 'cm1', 'elementaire', v_teacher1, 30),
    (v_class2, v_school, '4ème S1', '4e', 'moyen', v_teacher2, 35)
  on conflict (id) do nothing;

  insert into public.class_subjects (school_id, class_id, subject_id, coefficient) values
    (v_school, v_class1, v_sub1, 2), (v_school, v_class1, v_sub2, 2),
    (v_school, v_class1, v_sub3, 1), (v_school, v_class1, v_sub4, 1),
    (v_school, v_class2, v_sub1, 3), (v_school, v_class2, v_sub2, 4),
    (v_school, v_class2, v_sub3, 2), (v_school, v_class2, v_sub4, 1)
  on conflict do nothing;

  insert into public.teaching_assignments (school_id, teacher_id, class_id, subject_id) values
    (v_school, v_teacher1, v_class1, v_sub1),
    (v_school, v_teacher1, v_class1, v_sub2),
    (v_school, v_teacher2, v_class2, v_sub1),
    (v_school, v_teacher2, v_class2, v_sub2)
  on conflict do nothing;

  -- Parents et élèves
  insert into public.parents (id, school_id, first_name, last_name, phone, email, address)
  values (v_parent1, v_school, 'Fatou', 'Fall', '779000001', 'fatou.fall@scol.sn', 'Sacré-Cœur')
  on conflict (id) do nothing;

  insert into public.students
    (id, school_id, matricule, child_code, first_name, last_name, gender, birth_date, class_id, parent_id, enrolled_at)
  values
    (v_student1, v_school, 'EC260001', 'ABCD23', 'Ndeye', 'Fall', 'F', '2014-05-12', v_class1, v_parent1, '2026-10-01'),
    (v_student2, v_school, 'EC260002', 'WXYZ45', 'Ilyas', 'Fall', 'M', '2012-09-30', v_class2, v_parent1, '2026-10-01'),
    (v_student3, v_school, 'EC260003', 'PQRS67', 'Aissatou', 'Ba', 'F', '2014-02-11', v_class1, null, '2026-10-02')
  on conflict (id) do nothing;

  -- Comptes Auth (mêmes comptes que la démo front).
  -- instance_id / aud / role sont obligatoires pour que GoTrue délivre une session
  -- (sur l'hébergeur, une insertion directe dans auth.users ne les remplit pas).
  -- Les colonnes de jeton doivent valoir '' et non NULL : GoTrue les scanne comme
  -- des chaînes non nullables, sinon le login renvoie « Database error querying
  -- schema » (HTTP 500).
  insert into auth.users
    (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
     confirmation_token, recovery_token, email_change, email_change_token_current,
     email_change_token_new, phone_change, phone_change_token, reauthentication_token)
  values
    (v_user_dir, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'directeur@demo.scol.sn', v_password, now(), '{"role":"directeur","school_id":"00000000-0000-0000-0000-00000000aa01","provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''),
    (v_user_teach, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'enseignant@demo.scol.sn', v_password, now(), '{"role":"instituteur","school_id":"00000000-0000-0000-0000-00000000aa01","provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''),
    (v_user_econ, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'econome@demo.scol.sn', v_password, now(), '{"role":"econome","school_id":"00000000-0000-0000-0000-00000000aa01","provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''),
    (v_user_parent, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parent@demo.scol.sn', v_password, now(), '{"role":"parent","school_id":"00000000-0000-0000-0000-00000000aa01","provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''),
    (v_user_student, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'eleve@demo.scol.sn', v_password, now(), '{"role":"eleve","school_id":"00000000-0000-0000-0000-00000000aa01","provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '', '', '', '', '')
  on conflict (id) do nothing;

  -- Les comptes déjà présents (seed rejoué) doivent être repairés : GoTrue
  -- refuse de lire une ligne dont une colonne de jeton est NULL.
  update auth.users
     set instance_id = coalesce(instance_id, '00000000-0000-0000-0000-000000000000'),
         aud = coalesce(aud, 'authenticated'),
         role = coalesce(role, 'authenticated'),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb),
         confirmation_token = coalesce(confirmation_token, ''),
         recovery_token = coalesce(recovery_token, ''),
         email_change = coalesce(email_change, ''),
         email_change_token_current = coalesce(email_change_token_current, ''),
         email_change_token_new = coalesce(email_change_token_new, ''),
         phone_change = coalesce(phone_change, ''),
         phone_change_token = coalesce(phone_change_token, ''),
         reauthentication_token = coalesce(reauthentication_token, '')
   where email like '%@demo.scol.sn';

  -- Identités Auth : sans ces lignes, GoTrue refuse le mot de passe
  -- (« Invalid login credentials ») car il ne trouve pas d'identité e-mail.
  insert into auth.identities
    (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select u.id,
         u.id::text,
         u.id,
         jsonb_build_object('sub', u.id::text, 'email', u.email,
                            'email_verified', true, 'phone_verified', false),
         'email',
         null,
         u.created_at,
         u.updated_at
    from auth.users u
   where u.email like '%@demo.scol.sn'
     and not exists (select 1 from auth.identities i where i.user_id = u.id);

  insert into public.profiles (id, school_id, role, status, first_name, last_name, phone, email, teacher_id, parent_id, student_id)
  values
    (v_user_dir, v_school, 'directeur', 'ACTIF', 'Ousmane', 'Sène', '770000001', 'directeur@demo.scol.sn', null, null, null),
    (v_user_teach, v_school, 'instituteur', 'ACTIF', 'Aminata', 'Diop', '773000001', 'enseignant@demo.scol.sn', v_teacher1, null, null),
    (v_user_econ, v_school, 'econome', 'ACTIF', 'Mame', 'Sow', '774000001', 'econome@demo.scol.sn', null, null, null),
    (v_user_parent, v_school, 'parent', 'ACTIF', 'Fatou', 'Fall', '779000001', 'parent@demo.scol.sn', null, v_parent1, null),
    (v_user_student, v_school, 'eleve', 'ACTIF', 'Ndeye', 'Fall', '', 'eleve@demo.scol.sn', null, null, v_student1)
  on conflict (id) do nothing;

  -- Formule Premium (500 FCFA par élève et par mois) : l'école de démo compte
  -- un élève, règlement annuel de 10 mois = 5 000 FCFA.
  insert into public.subscriptions (school_id, plan_id, starts_at, ends_at, student_limit, amount_paid, payment_ref, method, paid_at)
  values (v_school, 'premium', current_date, current_date + 90, null, 5000, 'WV-1234-5678', 'wave', now())
  on conflict (school_id) do nothing;

  insert into public.registration_requests (school_id, user_id, role, first_name, last_name, email, phone, class_id, status)
  values (v_school, v_user_student, 'eleve', 'Mara', 'Sow', 'parent.demande@scol.sn', '775550000', v_class1, 'EN_ATTENTE')
  on conflict do nothing;
end;
$$;
