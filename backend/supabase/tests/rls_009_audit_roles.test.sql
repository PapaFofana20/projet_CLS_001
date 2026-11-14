-- ============================================================================
-- AUDIT — Axe B : contrôle d'accès par rôle + forgery inter-écoles de bulletin
--
-- Comportement ATTENDU. Les échecs observés sur le code audité matérialisent
-- des défauts d'autorisation (périmètre trop large, refus non appliqués côté
-- serveur, forge inter-écoles d'un bulletin).
--
-- Exécution : npx supabase test db   (base locale requise)
-- ============================================================================

begin;
set local search_path = pgtap, public, extensions;
grant usage on schema pgtap to public;
select plan(39);

-- ----------------------------------------------------------------------------
-- Jeu d'essai : école A (2 classes, 2 enseignants, parent, élève) + école B
-- ----------------------------------------------------------------------------
create or replace function pg_temp.temp_setup() returns void
language plpgsql volatile as $$
declare
  a uuid := 'aaaaaa11-0000-0000-0000-0000000000a1';
  b uuid := 'bbbbbb22-0000-0000-0000-0000000000b1';
begin
  insert into public.schools (id, name, matricule, city, cycles) values
    (a, 'École A', 'AAAAA', 'Dakar', array['elementaire','moyen','secondaire']::app_cycle[]),
    (b, 'École B', 'BBBBB', 'Thiès', array['elementaire','moyen','secondaire']::app_cycle[]);
  insert into public.school_settings (school_id) values (a), (b);
  insert into public.level_fees (school_id, level_id, inscription, mensualite)
    values (a, 'cm1', 30000, 20000), (a, '6e', 40000, 30000), (b, 'cm1', 30000, 20000);
  insert into public.subscriptions (school_id, plan_id, starts_at, ends_at, student_limit)
    values (a, 'pro', current_date, current_date + 30, 300),
           (b, 'pro', current_date, current_date + 30, 300);

  insert into public.teachers (id, school_id, kind, first_name, last_name, email) values
    ('dddddd44-0000-0000-0000-0000000000aa', a, 'instituteur', 'Titu', 'A', 'titu.a@a.sn'),
    ('dddddd44-0000-0000-0000-0000000000ac', a, 'professeur', 'Prof', 'A', 'prof.a@a.sn'),
    ('dddddd44-0000-0000-0000-0000000000ba', b, 'instituteur', 'Titu', 'B', 'titu.b@b.sn');
  insert into public.class_rooms (id, school_id, name, level_id, cycle, head_teacher_id, capacity) values
    ('aaaaaa11-0000-0000-0000-0000000000ca', a, 'CM1-A', 'cm1', 'elementaire', 'dddddd44-0000-0000-0000-0000000000aa', 30),
    ('aaaaaa11-0000-0000-0000-0000000000cb', a, '6e-A', '6e', 'moyen', null, 30),
    ('bbbbbb22-0000-0000-0000-0000000000ca', b, 'CM1-B', 'cm1', 'elementaire', 'dddddd44-0000-0000-0000-0000000000ba', 30),
    ('aaaaaa11-0000-0000-0000-0000000000cc', a, 'CM1-C', 'cm1', 'elementaire', null, 30);
  insert into public.subjects (id, school_id, name, cycles) values
    ('cccccc33-0000-0000-0000-0000000000aa', a, 'Français A', array['elementaire']::app_cycle[]),
    ('cccccc33-0000-0000-0000-0000000000ac', a, 'Maths A', array['moyen']::app_cycle[]),
    ('cccccc33-0000-0000-0000-0000000000ba', b, 'Français B', array['elementaire']::app_cycle[]);
  insert into public.class_subjects (school_id, class_id, subject_id, coefficient) values
    (a, 'aaaaaa11-0000-0000-0000-0000000000ca', 'cccccc33-0000-0000-0000-0000000000aa', 2),
    (a, 'aaaaaa11-0000-0000-0000-0000000000cb', 'cccccc33-0000-0000-0000-0000000000ac', 3),
    (b, 'bbbbbb22-0000-0000-0000-0000000000ca', 'cccccc33-0000-0000-0000-0000000000ba', 2);
  insert into public.teaching_assignments (school_id, teacher_id, class_id, subject_id) values
    (a, 'dddddd44-0000-0000-0000-0000000000aa', 'aaaaaa11-0000-0000-0000-0000000000ca', 'cccccc33-0000-0000-0000-0000000000aa'),
    (a, 'dddddd44-0000-0000-0000-0000000000ac', 'aaaaaa11-0000-0000-0000-0000000000cb', 'cccccc33-0000-0000-0000-0000000000ac'),
    (b, 'dddddd44-0000-0000-0000-0000000000ba', 'bbbbbb22-0000-0000-0000-0000000000ca', 'cccccc33-0000-0000-0000-0000000000ba')
  -- le déclencheur auto_assign_titular a déjà créé l'affectation du titulaire
  on conflict do nothing;
  insert into public.parents (id, school_id, first_name, last_name, email) values
    ('eeeeee55-0000-0000-0000-0000000000ea', a, 'Awa', 'PA', 'awa@a.sn'),
    ('eeeeee55-0000-0000-0000-0000000000eb', b, 'Awa', 'PB', 'awa@b.sn');
  insert into public.students
    (id, school_id, class_id, matricule, child_code, first_name, last_name, gender, birth_date, parent_id) values
    ('eeeeee55-0000-0000-0000-0000000000a1', a, 'aaaaaa11-0000-0000-0000-0000000000ca', 'ECA0001', 'ABCDA2', 'Leila', 'A1', 'F', '2014-01-01', 'eeeeee55-0000-0000-0000-0000000000ea'),
    ('eeeeee55-0000-0000-0000-0000000000a2', a, 'aaaaaa11-0000-0000-0000-0000000000cb', 'ECA0002', 'ABCDA3', 'Ibra', 'A2', 'M', '2013-01-01', 'eeeeee55-0000-0000-0000-0000000000ea'),
    ('eeeeee55-0000-0000-0000-0000000000b1', b, 'bbbbbb22-0000-0000-0000-0000000000ca', 'ECB0001', 'ABCDB2', 'Leila', 'B1', 'F', '2014-01-01', 'eeeeee55-0000-0000-0000-0000000000eb');

  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data) values
    ('faa11111-0000-0000-0000-0000000000a1', 'dir.a@a.sn', crypt('x', gen_salt('bf')), now(), '{"role":"directeur","school_id":"aaaaaa11-0000-0000-0000-0000000000a1"}'),
    ('faa11111-0000-0000-0000-0000000000a2', 'dir.b@b.sn', crypt('x', gen_salt('bf')), now(), '{"role":"directeur","school_id":"bbbbbb22-0000-0000-0000-0000000000b1"}'),
    ('faa11111-0000-0000-0000-0000000000a3', 'titu.a@a.sn', crypt('x', gen_salt('bf')), now(), '{"role":"instituteur","school_id":"aaaaaa11-0000-0000-0000-0000000000a1"}'),
    ('faa11111-0000-0000-0000-0000000000a4', 'prof.a@a.sn', crypt('x', gen_salt('bf')), now(), '{"role":"professeur","school_id":"aaaaaa11-0000-0000-0000-0000000000a1"}'),
    ('faa11111-0000-0000-0000-0000000000a5', 'par.a@a.sn', crypt('x', gen_salt('bf')), now(), '{"role":"parent","school_id":"aaaaaa11-0000-0000-0000-0000000000a1"}'),
    ('faa11111-0000-0000-0000-0000000000a6', 'ele.a@a.sn', crypt('x', gen_salt('bf')), now(), '{"role":"eleve","school_id":"aaaaaa11-0000-0000-0000-0000000000a1"}'),
    ('faa11111-0000-0000-0000-0000000000a7', 'eco.a@a.sn', crypt('x', gen_salt('bf')), now(), '{"role":"econome","school_id":"aaaaaa11-0000-0000-0000-0000000000a1"}'),
    ('faa11111-0000-0000-0000-0000000000a8', 'sur.a@a.sn', crypt('x', gen_salt('bf')), now(), '{"role":"surveillant","school_id":"aaaaaa11-0000-0000-0000-0000000000a1"}'),
    ('faa11111-0000-0000-0000-0000000000a9', 'desact.a@a.sn', crypt('x', gen_salt('bf')), now(), '{"role":"instituteur","school_id":"aaaaaa11-0000-0000-0000-0000000000a1"}'),
    ('faa11111-0000-0000-0000-0000000000b9', 'attente.a@a.sn', crypt('x', gen_salt('bf')), now(), '{"role":"parent","school_id":"aaaaaa11-0000-0000-0000-0000000000a1"}'),
    ('faa11111-0000-0000-0000-0000000000c9', 'pwd.a@a.sn', crypt('x', gen_salt('bf')), now(), '{"role":"instituteur","school_id":"aaaaaa11-0000-0000-0000-0000000000a1"}');

  insert into public.profiles (id, school_id, role, status, first_name, last_name, email, teacher_id, parent_id, student_id, must_change_password) values
    ('faa11111-0000-0000-0000-0000000000a1', a, 'directeur', 'ACTIF', 'Dir', 'A', 'dir.a@a.sn', null, null, null, false),
    ('faa11111-0000-0000-0000-0000000000a2', b, 'directeur', 'ACTIF', 'Dir', 'B', 'dir.b@b.sn', null, null, null, false),
    ('faa11111-0000-0000-0000-0000000000a3', a, 'instituteur', 'ACTIF', 'Titu', 'A', 'titu.a@a.sn', 'dddddd44-0000-0000-0000-0000000000aa', null, null, false),
    ('faa11111-0000-0000-0000-0000000000a4', a, 'professeur', 'ACTIF', 'Prof', 'A', 'prof.a@a.sn', 'dddddd44-0000-0000-0000-0000000000ac', null, null, false),
    ('faa11111-0000-0000-0000-0000000000a5', a, 'parent', 'ACTIF', 'Awa', 'PA', 'par.a@a.sn', null, 'eeeeee55-0000-0000-0000-0000000000ea', null, false),
    ('faa11111-0000-0000-0000-0000000000a6', a, 'eleve', 'ACTIF', 'Leila', 'A1', 'ele.a@a.sn', null, null, 'eeeeee55-0000-0000-0000-0000000000a1', false),
    ('faa11111-0000-0000-0000-0000000000a7', a, 'econome', 'ACTIF', 'Eco', 'A', 'eco.a@a.sn', null, null, null, false),
    ('faa11111-0000-0000-0000-0000000000a8', a, 'surveillant', 'ACTIF', 'Sur', 'A', 'sur.a@a.sn', null, null, null, false),
    ('faa11111-0000-0000-0000-0000000000a9', a, 'instituteur', 'DESACTIVE', 'Desact', 'A', 'desact.a@a.sn', null, null, null, false),
    ('faa11111-0000-0000-0000-0000000000b9', a, 'parent', 'EN_ATTENTE', 'Attente', 'A', 'attente.a@a.sn', null, 'eeeeee55-0000-0000-0000-0000000000ea', null, false),
    ('faa11111-0000-0000-0000-0000000000c9', a, 'instituteur', 'ACTIF', 'Pwd', 'A', 'pwd.a@a.sn', null, null, null, true);
end;
$$;
select pg_temp.temp_setup();

create or replace function pg_temp.temp_statu(p_user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user_id, 'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'role', (select role from public.profiles where id = p_user_id),
        'school_id', (select school_id from public.profiles where id = p_user_id)))::text, true);
  perform set_config('role', 'authenticated', true);
  perform set_config('search_path', 'pgtap, public, extensions', true);
end;
$$;

create or replace function pg_temp.temp_role(p_role text) returns void
language plpgsql as $$
begin
  perform set_config('role', p_role, true);
  perform set_config('search_path', 'pgtap, public, extensions', true);
end;
$$;

create or replace function pg_temp.temp_try(p_sql text) returns text
language plpgsql as $$
begin
  begin
    execute p_sql;
    return 'ok';
  exception when others then
    return 'refusé';
  end;
end;
$$;

create or replace function pg_temp.temp_count(p_sql text) returns bigint
language plpgsql stable as $$
declare v bigint;
begin
  execute p_sql into v;
  return v;
exception when others then
  return -1;
end;
$$;

-- ===========================================================================
-- 1. ENSEIGNANT : saisie des notes limitée à SES couples (classe, matière)
-- ===========================================================================
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a3'); -- instituteur de CM1-A

select is(
  (select pg_temp.temp_try($$select public.save_grade(
       'eeeeee55-0000-0000-0000-0000000000a1', 'aaaaaa11-0000-0000-0000-0000000000ca',
       'cccccc33-0000-0000-0000-0000000000aa', 'S1', 'composition', 15)$$)),
  'ok'::text, 'l''enseignant affected peut saisir une note dans sa classe'
) as b01;

select is(
  (select pg_temp.temp_try($$select public.save_grade(
       'eeeeee55-0000-0000-0000-0000000000a2', 'aaaaaa11-0000-0000-0000-0000000000cb',
       'cccccc33-0000-0000-0000-0000000000ac', 'S1', 'composition', 15)$$)),
  'refusé'::text, 'l''enseignant NE PEUT PAS saisir de note dans une classe qui ne lui est pas affectée'
) as b02;

select is(
  (select pg_temp.temp_try($$select public.save_grade(
       'eeeeee55-0000-0000-0000-0000000000b1', 'aaaaaa11-0000-0000-0000-0000000000ca',
       'cccccc33-0000-0000-0000-0000000000aa', 'S1', 'composition', 15)$$)),
  'refusé'::text, 'l''enseignant NE PEUT PAS saisir de note pour un élève d''une autre école'
) as b03;

select is(
  (select pg_temp.temp_try($$select public.save_grade(
       'eeeeee55-0000-0000-0000-0000000000a1', 'aaaaaa11-0000-0000-0000-0000000000ca',
       'cccccc33-0000-0000-0000-0000000000aa', 'S1', 'composition', 20.01)$$)),
  'refusé'::text, 'la note est bornée à 20'
) as b04;

select is(
  (select pg_temp.temp_try($$select public.save_grade(
       'eeeeee55-0000-0000-0000-0000000000a1', 'aaaaaa11-0000-0000-0000-0000000000ca',
       'cccccc33-0000-0000-0000-0000000000aa', 'S1', 'composition', -1)$$)),
  'refusé'::text, 'la note est bornée à 0'
) as b05;

-- Le directeur ne saisit pas de note : il n'est pas enseignant.
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a1');
select is(
  (select pg_temp.temp_try($$select public.save_grade(
       'eeeeee55-0000-0000-0000-0000000000a1', 'aaaaaa11-0000-0000-0000-0000000000ca',
       'cccccc33-0000-0000-0000-0000000000aa', 'S1', 'composition', 15)$$)),
  'refusé'::text, 'le directeur ne saisit pas de note'
) as b06;

-- ===========================================================================
-- 2. ENSEIGNANT : lecture de la classe entière réservée au titulaire
-- ===========================================================================
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a4'); -- prof de 6e-A (non titulaire)
select is(
  (select pg_temp.temp_try($$select public.class_report_cards('aaaaaa11-0000-0000-0000-0000000000cb', 'S1')$$)),
  'refusé'::text, 'un enseignant non titulaire ne lit pas le bulletin de la classe entière'
) as b07;

select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a3'); -- titulaire de CM1-A
select is(
  (select pg_temp.temp_try($$select public.class_report_cards('aaaaaa11-0000-0000-0000-0000000000ca', 'S1')$$)),
  'ok'::text, 'le titulaire lit le bulletin de sa classe'
) as b08;

-- ===========================================================================
-- 3. PARENT : périmètre limité à SES enfants
-- ===========================================================================
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a5'); -- parent de A (2 enfants)
select is(
  (select count(*) from public.students),
  2::bigint, 'le parent ne voit que ses 2 enfants'
) as b09;

select is(
  (select count(*) from public.grades g
     where g.student_id in (select id from public.students)),
  1::bigint, 'le parent voit les notes de ses enfants'
) as b10;

select is(
  (select pg_temp.temp_try($$select public.save_grade(
       'eeeeee55-0000-0000-0000-0000000000a1', 'aaaaaa11-0000-0000-0000-0000000000ca',
       'cccccc33-0000-0000-0000-0000000000aa', 'S1', 'composition', 20)$$)),
  'refusé'::text, 'le parent ne saisit pas de note'
) as b11;

select is(
  (select pg_temp.temp_try($$select public.record_cash_payment(
       (select id from public.payments limit 1), 1000)$$)),
  'refusé'::text, 'le parent n''encaisse pas de paiement'
) as b12;

-- Un parent ne rattache pas un élève d'une AUTRE école à son compte.
select pg_temp.temp_role('postgres');
insert into public.payments (school_id, student_id, kind, label, due_date, amount, paid_amount)
  values ('aaaaaa11-0000-0000-0000-0000000000a1', 'eeeeee55-0000-0000-0000-0000000000a1',
          'mensualite', 'Octobre', current_date, 20000, 0);
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a5');
select is(
  (select pg_temp.temp_try($$select public.link_child('ABCDB2', '2015-01-01')$$)),
  'refusé'::text, 'un parent ne rattache pas un élève d''une autre école'
) as b13;

-- ===========================================================================
-- 4. ÉLÈVE : ne voit que lui-même
-- ===========================================================================
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a6');
select is(
  (select count(*) from public.students),
  1::bigint, 'l''élève ne voit que sa propre fiche'
) as b14;

select is(
  (select count(*) from public.payments),
  1::bigint, 'l''élève ne voit que ses propres échéances'
) as b15;

-- ===========================================================================
-- 6. COMPTES NON ACTIFS : aucun accès côté serveur
-- ===========================================================================
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a9'); -- DESACTIVE
select is(
  (select count(*) from public.students),
  0::bigint, 'un compte désactivé ne lit aucune donnée'
) as b17;
select is(
  (select pg_temp.temp_try($$select public.class_report_cards('aaaaaa11-0000-0000-0000-0000000000ca', 'S1')$$)),
  'refusé'::text, 'un compte désactivé ne lit aucun bulletin'
) as b18;

select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000b9'); -- EN_ATTENTE
select is(
  (select count(*) from public.students),
  0::bigint, 'un compte en attente ne lit aucune donnée'
) as b19;

-- Mot de passe temporaire : accès refusé tant qu'il n'est pas changé.
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000c9');
select is(
  (select count(*) from public.students),
  0::bigint, 'un compte avec mot de passe temporaire ne lit aucune donnée'
) as b20;
select is(
  (select pg_temp.temp_try($$select public.save_grade(
       'eeeeee55-0000-0000-0000-0000000000a1', 'aaaaaa11-0000-0000-0000-0000000000ca',
       'cccccc33-0000-0000-0000-0000000000aa', 'S1', 'composition', 15)$$)),
  'refusé'::text, 'un compte avec mot de passe temporaire ne peut pas saisir de note'
) as b21;

-- ===========================================================================
-- 7. IDOR : les RPC vérifient l'appartenance à l'école / au rôle
-- ===========================================================================
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a5'); -- parent
select is(
  (select pg_temp.temp_try($$select public.start_installment_payments(
       array[(select id from public.payments limit 1)]::uuid[], 'wave', '7012345678')$$)),
  'ok'::text, 'le parent peut payer l''échéance de son enfant'
) as b22;

-- Un parent ne peut pas payer l'échéance d'un élève qui n'est pas le sien :
-- on vérifie qu'aucune transaction n'est ouverte pour un élève de B.
select pg_temp.temp_role('postgres');
insert into public.payments (id, school_id, student_id, kind, label, due_date, amount, paid_amount)
  values ('99999999-0000-0000-0000-0000000000b1', 'bbbbbb22-0000-0000-0000-0000000000b1', 'eeeeee55-0000-0000-0000-0000000000b1',
          'mensualite', 'Octobre', current_date, 20000, 0);
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a5');
select is(
  (select pg_temp.temp_try($$select public.start_installment_payments(
       array['99999999-0000-0000-0000-0000000000b1']::uuid[],
       'wave', '7012345678')$$)),
  'refusé'::text, 'un parent ne peut pas payer l''échéance d''un élève d''une autre école'
) as b23;

-- L'économe encaisse, le surveillant non.
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a7'); -- econome
select is(
  (select pg_temp.temp_try($$select public.record_cash_payment(
       (select id from public.payments where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1' and paid_amount = 0 limit 1), 5000)$$)),
  'ok'::text, 'l''économe encaisse un paiement en espèces'
) as b24;

select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a8'); -- surveillant
select is(
  (select pg_temp.temp_try($$select public.record_cash_payment(
       (select id from public.payments where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1' limit 1), 5000)$$)),
  'refusé'::text, 'le surveillant n''encaisse pas de paiement'
) as b25;

-- ===========================================================================
-- 8. FORGE INTER-ÉCOLES D'UN BULLETIN (chaîne complète)
--    1) le directeur de A affecte son enseignant à la CLASSE de B ;
--    2) l'enseignant de A insère une note pour l'ÉLÈVE de B ;
--    3) le bulletin de B (calculé par une fonction SECURITY DEFINER qui
--       contourne la RLS) intègre la note injectée.
-- ===========================================================================
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a1'); -- directeur de A
select is(
  (select pg_temp.temp_try($$select public.replace_cell_teachers(
       'bbbbbb22-0000-0000-0000-0000000000ca',
       'cccccc33-0000-0000-0000-0000000000ba',
       array['dddddd44-0000-0000-0000-0000000000aa'::uuid])$$)),
  'refusé'::text, 'étape 1 : le directeur de A ne peut pas affecter son enseignant à la classe de B'
) as b26;

select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a3'); -- enseignant de A
select is(
  (select pg_temp.temp_try($$insert into public.grades
       (school_id, student_id, class_id, subject_id, period, composition)
     values ('aaaaaa11-0000-0000-0000-0000000000a1',
             'eeeeee55-0000-0000-0000-0000000000b1',
             'bbbbbb22-0000-0000-0000-0000000000ca',
             'cccccc33-0000-0000-0000-0000000000ba', 'S1', 20)$$)),
  'refusé'::text, 'étape 2 : l''enseignant de A ne peut pas insérer de note pour l''élève de B'
) as b27;

select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a2'); -- directeur de B
select is(
  (select pg_temp.temp_count($$select count(*) from jsonb_array_elements(
       public.class_report_cards('bbbbbb22-0000-0000-0000-0000000000ca', 'S1')) j
     where (j->>'generalAverage') is not null$$)),
  0::bigint, 'étape 3 : le bulletin de B ne contient AUCUNE moyenne injectée par A (0 = pas de note forgée)'
) as b28;

-- ===========================================================================
-- 10. Le directeur ne peut pas approuver une demande d'une autre école
-- ===========================================================================
select pg_temp.temp_role('postgres');
insert into public.registration_requests (school_id, user_id, role, first_name, last_name, email, status)
  values ('bbbbbb22-0000-0000-0000-0000000000b1', 'faa11111-0000-0000-0000-0000000000a2',
          'eleve', 'Demande', 'B', 'dem.b@b.sn', 'EN_ATTENTE');
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a1'); -- directeur de A
select is(
  (select pg_temp.temp_try($$select public.decide_registration_requests(
       array[(select id from public.registration_requests where school_id = 'bbbbbb22-0000-0000-0000-0000000000b1' limit 1)]::uuid[],
       true, null)$$)),
  'refusé'::text, 'le directeur de A ne peut pas approuver une demande de l''école B'
) as b32;

-- ===========================================================================
-- 11. Limite de la formule : le lot ne doit PAS dépasser les places restantes
--     (la limite est re-vérifiée en tenant compte du nombre d'élèves à créer)
-- ===========================================================================
select pg_temp.temp_role('postgres');
-- 2 élèves déjà inscrits, formule à 3 élèves : il reste 1 place, le lot en
-- demande 3 → refus intégral.
update public.subscriptions set student_limit = 3 where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1';
insert into public.registration_requests (school_id, user_id, role, first_name, last_name, email, class_id, status)
  select 'aaaaaa11-0000-0000-0000-0000000000a1', 'faa11111-0000-0000-0000-0000000000a1',
         'eleve', 'Nouv', 'E' || g::text, 'nouv' || g::text || '@a.sn',
         'aaaaaa11-0000-0000-0000-0000000000cb', 'EN_ATTENTE'
    from generate_series(1, 3) g;
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a1');
select is(
  (select pg_temp.temp_try($$select public.decide_registration_requests(
       array(select id from public.registration_requests where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1' and status = 'EN_ATTENTE' and first_name = 'Nouv')::uuid[],
       true, null)$$)),
  'refusé'::text, 'l''approbation en lot qui dépasserait la limite de la formule est refusée'
) as b33;

select pg_temp.temp_role('postgres');
select is(
  (select count(*) from public.students where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1'),
  2::bigint, 'aucun élève créé au-delà de la limite de la formule (le lot est rejeté en bloc)'
) as b34;

-- ===========================================================================
-- 11 bis. Approbation en lot : le traitement doit aboutir
--      (régression AUD-008 : la fonction échouait sur une erreur de type
--       « record = integer » et aucune approbation n'était possible)
-- ===========================================================================
select pg_temp.temp_role('postgres');
update public.subscriptions set student_limit = 300 where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1';
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a1');
select is(
  (select pg_temp.temp_try($$select public.decide_registration_requests(
       array(select id from public.registration_requests
              where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1' and status = 'EN_ATTENTE')::uuid[],
       true, null)$$)),
  'ok'::text, 'l''approbation en lot aboutit'
) as b41;

select pg_temp.temp_role('postgres');
select is(
  (select count(*) from public.registration_requests
    where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1' and status = 'APPROUVEE'),
  3::bigint, 'les 3 demandes approuvées sont marquées APPROUVEE'
) as b42;
select is(
  (select count(*) from public.students where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1'),
  5::bigint, 'les 3 élèves approuvés sont créés'
) as b43;

-- ===========================================================================
-- 12. Le directeur seul crée / désactive le personnel
-- ===========================================================================
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a3'); -- enseignant
select is(
  (select pg_temp.temp_try($$insert into public.teachers (school_id, kind, first_name, last_name, email)
     values ('aaaaaa11-0000-0000-0000-0000000000a1', 'professeur', 'Intrus', 'X', 'i@a.sn')$$)),
  'refusé'::text, 'un enseignant ne crée pas de compte au personnel'
) as b35;

select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a7'); -- économe
select is(
  (select pg_temp.temp_try($$insert into public.teachers (school_id, kind, first_name, last_name, email)
     values ('aaaaaa11-0000-0000-0000-0000000000a1', 'professeur', 'Intrus', 'X', 'i@a.sn')$$)),
  'refusé'::text, 'l''économe ne crée pas de compte au personnel'
) as b36;

-- Le directeur n'écrit pas dans les notes (rôle non enseignant) mais gère
-- les classes et les matières.
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a1');
select is(
  (select pg_temp.temp_try($$insert into public.class_rooms (school_id, name, level_id, cycle, capacity)
     values ('aaaaaa11-0000-0000-0000-0000000000a1', 'CM1-B', 'cm1', 'elementaire', 30)$$)),
  'ok'::text, 'le directeur crée une classe'
) as b37;

select is(
  (select pg_temp.temp_try($$insert into public.subjects (school_id, name, cycles)
     values ('aaaaaa11-0000-0000-0000-0000000000a1', 'Histoire', array['elementaire']::app_cycle[])$$)),
  'ok'::text, 'le directeur crée une matière'
) as b38;

-- ===========================================================================
-- 13. Suppression : une classe qui contient des élèves est protégée
-- ===========================================================================
select pg_temp.temp_role('postgres');
select is(
  (select pg_temp.temp_try($$delete from public.class_rooms
     where id = 'aaaaaa11-0000-0000-0000-0000000000ca'$$)),
  'refusé'::text, 'une classe contenant des élèves ne peut pas être supprimée'
) as b39;

select is(
  (select pg_temp.temp_try($$delete from public.class_rooms
     where id = 'aaaaaa11-0000-0000-0000-0000000000cc'$$)),
  'ok'::text, 'une classe vide peut être supprimée'
) as b40;

select * from finish();
rollback;
