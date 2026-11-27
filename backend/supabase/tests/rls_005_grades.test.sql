-- ============================================================================
-- Tests pgTAP — Phase 5 : notes & bulletins.
-- Exécution : npx supabase test db  (base locale requise)
-- ============================================================================

begin;
select plan(23);

create or replace function temp_setup() returns void
language plpgsql volatile as $$
begin
  insert into public.schools (id, name, cycles)
  values ('aaaaaa11-0000-0000-0000-000000000001', 'École A', array['elementaire','moyen','secondaire']::app_cycle[]);
  insert into public.school_settings (school_id) values ('aaaaaa11-0000-0000-0000-000000000001');

  insert into public.subscriptions (school_id, plan_id, starts_at, ends_at, student_limit)
  values ('aaaaaa11-0000-0000-0000-000000000001', 'essentiel', current_date, current_date + 30, 300);

  insert into public.teachers (id, school_id, kind, first_name, last_name, email)
  values ('dddddd44-0000-0000-0000-000000001111', 'aaaaaa11-0000-0000-0000-000000000001', 'instituteur', 'Moussa', 'Ta', 'moussa.ta@schoola.sn'),
         ('dddddd44-0000-0000-0000-000000001515', 'aaaaaa11-0000-0000-0000-000000000001', 'professeur',  'Sanouss', 'Tb', 'sanouss.tb@schoola.sn');
  insert into public.class_rooms (id, school_id, name, level_id, cycle, head_teacher_id, capacity)
  values ('aaaaaa11-0000-0000-0000-0000000000ca', 'aaaaaa11-0000-0000-0000-000000000001', 'CM1-A', 'cm1', 'elementaire', 'dddddd44-0000-0000-0000-000000001111', 30),
         ('aaaaaa11-0000-0000-0000-000000001212', 'aaaaaa11-0000-0000-0000-000000000001', '6e-A',  '6e',  'moyen',       null, 30);

  insert into public.subjects (id, school_id, name, cycles)
  values ('cccccc33-0000-0000-0000-000000001313', 'aaaaaa11-0000-0000-0000-000000000001', 'Français A', array['elementaire','moyen','secondaire']::app_cycle[]),
         ('cccccc33-0000-0000-0000-000000001414', 'aaaaaa11-0000-0000-0000-000000000001', 'Maths A',    array['elementaire','moyen','secondaire']::app_cycle[]);

  insert into public.class_subjects (school_id, class_id, subject_id, coefficient)
  values ('aaaaaa11-0000-0000-0000-000000000001', 'aaaaaa11-0000-0000-0000-0000000000ca', 'cccccc33-0000-0000-0000-000000001313', 2),
         ('aaaaaa11-0000-0000-0000-000000000001', 'aaaaaa11-0000-0000-0000-0000000000ca', 'cccccc33-0000-0000-0000-000000001414', 3),
         ('aaaaaa11-0000-0000-0000-000000000001', 'aaaaaa11-0000-0000-0000-000000001212', 'cccccc33-0000-0000-0000-000000001313', 3);

  

  insert into public.teaching_assignments (school_id, teacher_id, class_id, subject_id)
  values ('aaaaaa11-0000-0000-0000-000000000001', 'dddddd44-0000-0000-0000-000000001111', 'aaaaaa11-0000-0000-0000-0000000000ca', 'cccccc33-0000-0000-0000-000000001313'),
         ('aaaaaa11-0000-0000-0000-000000000001', 'dddddd44-0000-0000-0000-000000001111', 'aaaaaa11-0000-0000-0000-000000001212', 'cccccc33-0000-0000-0000-000000001313'),
         ('aaaaaa11-0000-0000-0000-000000000001', 'dddddd44-0000-0000-0000-000000001515', 'aaaaaa11-0000-0000-0000-0000000000ca', 'cccccc33-0000-0000-0000-000000001414')
  on conflict do nothing;

  insert into public.parents (id, school_id, first_name, last_name, email)
  values ('eeeeee55-0000-0000-0000-000000001616', 'aaaaaa11-0000-0000-0000-000000000001', 'Awa', 'P1', 'awa.p1@schoola.sn');

  insert into public.students (id, school_id, class_id, matricule, child_code, first_name, last_name, gender, birth_date, parent_id)
  values ('eeeeee55-0000-0000-0000-000000001717', 'aaaaaa11-0000-0000-0000-000000000001', 'aaaaaa11-0000-0000-0000-0000000000ca', 'ECA0001', 'ABCDEF', 'Leila', 'S1', 'F', '2014-01-01', 'eeeeee55-0000-0000-0000-000000001616'),
         ('eeeeee55-0000-0000-0000-000000001818', 'aaaaaa11-0000-0000-0000-000000000001', 'aaaaaa11-0000-0000-0000-0000000000ca', 'ECA0002', 'ABCDGH', 'Ilyas', 'S2', 'M', '2012-02-02', null),
         ('eeeeee55-0000-0000-0000-000000001919', 'aaaaaa11-0000-0000-0000-000000000001', 'aaaaaa11-0000-0000-0000-000000001212', 'ECM0001', 'JKNPQR', 'Momo', 'S3', 'M', '2011-03-03', null);

  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
  values
    ('ffaaaa11-0000-0000-0000-0000000000da', 'dir.a@schoola.sn', crypt('demo1234!', gen_salt('bf')), now(), '{"role":"directeur","school_id":"aaaaaa11-0000-0000-0000-000000000001"}'),
    ('ffaaaa11-0000-0000-0000-000000001a1a', 'moussa.ta@schoola.sn', crypt('demo1234!', gen_salt('bf')), now(), '{"role":"instituteur","school_id":"aaaaaa11-0000-0000-0000-000000000001"}'),
    ('ffaaaa11-0000-0000-0000-000000001b1b', 'sanouss.tb@schoola.sn', crypt('demo1234!', gen_salt('bf')), now(), '{"role":"professeur","school_id":"aaaaaa11-0000-0000-0000-000000000001"}'),
    ('ffaaaa11-0000-0000-0000-000000001c1c', 'parent.a@schoola.sn', crypt('demo1234!', gen_salt('bf')), now(), '{"role":"parent","school_id":"aaaaaa11-0000-0000-0000-000000000001"}'),
    ('ffaaaa11-0000-0000-0000-000000001d1d', 'eleve.a@schoola.sn', crypt('demo1234!', gen_salt('bf')), now(), '{"role":"eleve","school_id":"aaaaaa11-0000-0000-0000-000000000001"}');

  insert into public.profiles (id, school_id, role, status, first_name, last_name, email, teacher_id, parent_id, student_id)
  values
    ('ffaaaa11-0000-0000-0000-0000000000da', 'aaaaaa11-0000-0000-0000-000000000001', 'directeur', 'ACTIF', 'Direct', 'A', 'dir.a@schoola.sn', null, null, null),
    ('ffaaaa11-0000-0000-0000-000000001a1a', 'aaaaaa11-0000-0000-0000-000000000001', 'instituteur', 'ACTIF', 'Moussa', 'Ta', 'moussa.ta@schoola.sn', 'dddddd44-0000-0000-0000-000000001111', null, null),
    ('ffaaaa11-0000-0000-0000-000000001b1b', 'aaaaaa11-0000-0000-0000-000000000001', 'professeur', 'ACTIF', 'Sanouss', 'Tb', 'sanouss.tb@schoola.sn', 'dddddd44-0000-0000-0000-000000001515', null, null),
    ('ffaaaa11-0000-0000-0000-000000001c1c', 'aaaaaa11-0000-0000-0000-000000000001', 'parent', 'ACTIF', 'Awa', 'P1', 'parent.a@schoola.sn', null, 'eeeeee55-0000-0000-0000-000000001616', null),
    ('ffaaaa11-0000-0000-0000-000000001d1d', 'aaaaaa11-0000-0000-0000-000000000001', 'eleve', 'ACTIF', 'Leila', 'S1', 'eleve.a@schoola.sn', null, null, 'eeeeee55-0000-0000-0000-000000001717');
end;
$$;
select temp_setup();

create or replace function temp_persona(p_user_id uuid) returns text
language sql as $$
  select (case
    when p_user_id = 'ffaaaa11-0000-0000-0000-000000001a1a' then '{"role":"instituteur","school_id":"aaaaaa11-0000-0000-0000-000000000001"}'
    when p_user_id = 'ffaaaa11-0000-0000-0000-000000001b1b' then '{"role":"professeur","school_id":"aaaaaa11-0000-0000-0000-000000000001"}'
    when p_user_id = 'ffaaaa11-0000-0000-0000-000000001c1c' then '{"role":"parent","school_id":"aaaaaa11-0000-0000-0000-000000000001"}'
    when p_user_id = 'ffaaaa11-0000-0000-0000-000000001d1d' then '{"role":"eleve","school_id":"aaaaaa11-0000-0000-0000-000000000001"}'
    else '{"role":"directeur","school_id":"aaaaaa11-0000-0000-0000-000000000001"}'
  end)
$$;

create or replace function temp_statu(p_user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claims', temp_persona(p_user_id), true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- 1-6 : saisie de notes (enfilage SCP / messages exacts).
-- ----------------------------------------------------------------------------
select temp_statu('ffaaaa11-0000-0000-0000-0000000000da');
select throws_ok(
  'select public.save_grade(''eeeeee55-0000-0000-0000-000000001717''::uuid, ''aaaaaa11-0000-0000-0000-0000000000ca''::uuid, ''cccccc33-0000-0000-0000-000000001313''::uuid, ''S1'', ''composition'', 15)',
  'P0001', 'Action non autorisée : cette classe ou cette matière ne vous est pas affectée.',
  'le directeur ne saisit pas de notes (parité canEditGrades)'
) as t01_directeur_refuse;

select temp_statu('ffaaaa11-0000-0000-0000-000000001a1a');
select lives_ok(
  'select public.save_grade(''eeeeee55-0000-0000-0000-000000001717''::uuid, ''aaaaaa11-0000-0000-0000-0000000000ca''::uuid, ''cccccc33-0000-0000-0000-000000001313''::uuid, ''S1'', ''composition'', 15)',
  'ta (titulaire, affecté Français en CM1) saisit la composition de s1'
) as t02_ta_compose;
select lives_ok(
  'select public.save_grade(''eeeeee55-0000-0000-0000-000000001818''::uuid, ''aaaaaa11-0000-0000-0000-0000000000ca''::uuid, ''cccccc33-0000-0000-0000-000000001313''::uuid, ''S1'', ''composition'', 12)',
  'ta saisit aussi la composition de s2'
) as t03_ta_s2;
select throws_ok(
  'select public.save_grade(''eeeeee55-0000-0000-0000-000000001717''::uuid, ''aaaaaa11-0000-0000-0000-0000000000ca''::uuid, ''cccccc33-0000-0000-0000-000000001313''::uuid, ''S1'', ''composition'', 25)',
  'P0001', 'La note doit être comprise entre 0 et 20.',
  'note hors bornes refusée'
) as t04_note_hors_bornes;
-- Le titulaire d'une classe élémentaire est auto-affecté à TOUTES les matières de
-- sa classe (trigger auto_assign_titular) : « ta » est donc affecté aux Maths.
-- Le refus est vérifié avec « tb », professeur affecté uniquement aux Maths de
-- CM1-A, qui tente de saisir le Français de CM1-A.
select temp_statu('ffaaaa11-0000-0000-0000-000000001b1b');
select throws_ok(
  'select public.save_grade(''eeeeee55-0000-0000-0000-000000001717''::uuid, ''aaaaaa11-0000-0000-0000-0000000000ca''::uuid, ''cccccc33-0000-0000-0000-000000001313''::uuid, ''S1'', ''devoir1'', 10)',
  'P0001', 'Action non autorisée : cette classe ou cette matière ne vous est pas affectée.',
  'tb n''est pas affecté au Français de CM1-A : refus'
) as t05_ta_maths_refuse;
select temp_statu('ffaaaa11-0000-0000-0000-000000001a1a');
select lives_ok(
  'select public.save_grade(''eeeeee55-0000-0000-0000-000000001919''::uuid, ''aaaaaa11-0000-0000-0000-000000001212''::uuid, ''cccccc33-0000-0000-0000-000000001313''::uuid, ''S1'', ''devoir1'', 10)',
  'ta affecté 6e-A/Français : devoir1 enregistré'
) as t06_ta_cm_devoir1;
select lives_ok(
  'select public.save_grade(''eeeeee55-0000-0000-0000-000000001919''::uuid, ''aaaaaa11-0000-0000-0000-000000001212''::uuid, ''cccccc33-0000-0000-0000-000000001313''::uuid, ''S1'', ''devoir2'', 13)',
  'ta saisit devoir2 de s3 en 6e-A'
) as t07_ta_cm_devoir2;
select lives_ok(
  'select public.save_grade(''eeeeee55-0000-0000-0000-000000001919''::uuid, ''aaaaaa11-0000-0000-0000-000000001212''::uuid, ''cccccc33-0000-0000-0000-000000001313''::uuid, ''S1'', ''composition'', 12)',
  'ta saisit la composition de s3 en 6e-A'
) as t08_ta_cm_compo;

-- ----------------------------------------------------------------------------
-- 9-11 : école en lecture seule (abonnement expiré) : saisie bloquée.
-- ----------------------------------------------------------------------------
select set_config('role', 'postgres', true);
select set_config('search_path', 'pgtap, public, extensions', true);
select set_config('search_path', 'pgtap, public, extensions', true);
update public.subscriptions set ends_at = current_date - 4 where school_id = 'aaaaaa11-0000-0000-0000-000000000001';
select set_config('role', 'authenticated', true);
select set_config('search_path', 'pgtap, public, extensions', true);
select set_config('search_path', 'pgtap, public, extensions', true);
select throws_ok(
  'select public.save_grade(''eeeeee55-0000-0000-0000-000000001717''::uuid, ''aaaaaa11-0000-0000-0000-0000000000ca''::uuid, ''cccccc33-0000-0000-0000-000000001313''::uuid, ''S1'', ''composition'', 13)',
  'P0001', 'Mode lecture seule : l''abonnement de votre école est expiré. Les modifications sont désactivées.', 'écriture de note refusée pendant la fenêtre de lecture seule'
) as t09_lecture_seule_note;
select throws_ok(
  'select public.update_report_meta(''eeeeee55-0000-0000-0000-000000001717''::uuid, ''S1'', ''Bonne'', 1, ''Suivi renforcé.'')',
  'P0001', 'Mode lecture seule : l''abonnement de votre école est expiré. Les modifications sont désactivées.', 'métadonnées de bulletin bloquées aussi'
) as t10_lecture_seule_meta;
select set_config('role', 'postgres', true);
select set_config('search_path', 'pgtap, public, extensions', true);
select set_config('search_path', 'pgtap, public, extensions', true);
update public.subscriptions set ends_at = current_date + 30 where school_id = 'aaaaaa11-0000-0000-0000-000000000001';
select set_config('role', 'authenticated', true);
select set_config('search_path', 'pgtap, public, extensions', true);
select set_config('search_path', 'pgtap, public, extensions', true);

-- ----------------------------------------------------------------------------
-- 12-13 : portée de lecture des notes (parent / élève).
-- ----------------------------------------------------------------------------
select temp_statu('ffaaaa11-0000-0000-0000-000000001c1c');
select is(
  (select count(*) from public.grades where period = 'S1'),
  1::bigint, 'le parent de p1 ne lit que les notes de son enfant (s1)'
) as t11_parent_scoped;
select temp_statu('ffaaaa11-0000-0000-0000-000000001d1d');
select is(
  (select count(*) from public.grades where period = 'S1'),
  1::bigint, 'l''élève s1 ne lit que SES notes'
) as t12_eleve_scoped;

-- ----------------------------------------------------------------------------
-- 14-17 : bulletins calculés côté serveur.
-- ----------------------------------------------------------------------------
select temp_statu('ffaaaa11-0000-0000-0000-0000000000da');
select is(
  ((public.class_report_cards('aaaaaa11-0000-0000-0000-000000001212'::uuid, 'S1'))->>0) <> '',
  true, 'le directeur obtient le bulletin de 6e-A'
) as t13_directeur_cards;
-- Moyenne de la matière s3 en 6e-A : devoirs (10+13)/2 = 11.5 ; (11.5 + 12)/2 = 11.75
select is(
  (((public.class_report_cards('aaaaaa11-0000-0000-0000-000000001212'::uuid, 'S1'))->>0)::jsonb->>'generalAverage'),
  '11.75', 'moyenne générale pondérée attendue : 11.75'
) as t14_moyenne_moyen;
select throws_ok(
  'select public.class_report_cards(''aaaaaa11-0000-0000-0000-000000001212''::uuid, ''X9'')',
  'P0001', 'Période invalide.', 'période inconnue refusée'
) as t15_periode_invalide;

select is(
  (select count(*) from jsonb_array_elements(public.class_report_cards('aaaaaa11-0000-0000-0000-0000000000ca'::uuid, 'S1')) c),
  2::bigint, 'le directeur obtient les 2 bulletins de CM1-A'
) as t16_ca_cards;
select is(
  (select count(*) from jsonb_array_elements(public.class_report_cards('aaaaaa11-0000-0000-0000-0000000000ca'::uuid, 'S1')) c
   where (c->>'rank') = '1' and (c->'student'->>'id') = 'eeeeee55-0000-0000-0000-000000001717'),
  1::bigint, 's1 (compo 15) est 1er, s2 (compo 12) 2e : rangs ex æquo corrects'
) as t16b_rangs;
select is(
  (select c->>'classAverage' from jsonb_array_elements(public.class_report_cards('aaaaaa11-0000-0000-0000-0000000000ca'::uuid, 'S1')) c limit 1),
  '13.50', 'moyenne de classe attendue : (15 + 12) / 2 = 13.50'
) as t16c_moyenne_classe;
select temp_statu('ffaaaa11-0000-0000-0000-000000001c1c');
select is(
  (select count(*) from jsonb_array_elements(public.class_report_cards('aaaaaa11-0000-0000-0000-0000000000ca'::uuid, 'S1')) c),
  1::bigint, 'le parent ne reçoit que le bulletin de son enfant'
) as t17_parent_cards;

select temp_statu('ffaaaa11-0000-0000-0000-000000001b1b');
select throws_ok(
  'select public.class_report_cards(''aaaaaa11-0000-0000-0000-0000000000ca''::uuid, ''S1'')',
  'P0001', 'Vous n''avez pas accès aux bulletins de cette classe.',
  'enseignant non titulaire refusé'
) as t18_tb_refuse;
select temp_statu('ffaaaa11-0000-0000-0000-000000001a1a');
select is(
  (select count(*) from jsonb_array_elements(public.class_report_cards('aaaaaa11-0000-0000-0000-0000000000ca'::uuid, 'S1')) c),
  2::bigint, 'le titulaire (ta) obtient les 2 bulletins de CM1-A'
) as t19_ta_cards;

-- ----------------------------------------------------------------------------
-- 20-21 : métadonnées de bulletin.
-- ----------------------------------------------------------------------------
select temp_statu('ffaaaa11-0000-0000-0000-0000000000da');
select lives_ok(
  'select public.update_report_meta(''eeeeee55-0000-0000-0000-000000001717''::uuid, ''S1'', ''Bonne'', 2, ''Doit progresser en calcul.'')',
  'la direction met à jour les métadonnées'
) as t20_meta_updated;
select throws_ok(
  'select public.update_report_meta(''eeeeee55-0000-0000-0000-000000001717''::uuid, ''S1'', ''Bonne'', -3, '''')',
  'P0001', 'Requête invalide.', 'absences négatives refusées'
) as t21_absences_negatives;

select * from finish();
rollback;
