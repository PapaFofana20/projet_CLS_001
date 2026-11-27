-- ============================================================================
-- AUDIT — Axe A : isolation multi-écoles et RLS
--
-- Ces tests décrivent le comportement ATTENDU (sécurisé). Ils doivent être
-- VERTS après correction. Sur le code audité, ils ÉCHOUENT : chaque échec
-- matérialise un défaut (fuite inter-écoles, écriture non cloisonnée,
-- fonction security definer non restreinte).
--
-- Exécution : npx supabase test db   (base locale requise)
-- ============================================================================

begin;
set local search_path = pgtap, public, extensions;
grant usage on schema pgtap to public;
-- 54 assertions d'origine - 3 tests sur des objets supprimés
-- (payment_transactions en 00016, apply_paid_* en 00016) + 2 assertions
-- pour complete_password_change (audit C3).
select plan(53);

-- ----------------------------------------------------------------------------
-- Jeu d'essai : deux écoles A et B, jeux de données complets.
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
    values (a, 'cm1', 30000, 20000), (b, 'cm1', 30000, 20000);
  insert into public.subscriptions (school_id, plan_id, starts_at, ends_at, student_limit)
    values (a, 'essentiel', current_date, current_date + 30, 300),
           (b, 'essentiel', current_date, current_date + 30, 300);
  insert into public.subscription_events (school_id, event_type, plan_id, amount_paid)
    values (a, 'purchase', 'essentiel', 30000), (b, 'purchase', 'essentiel', 30000);
  insert into public.counters (school_id, counter, year, value) values (a, 'x', '2026-2027', 3);

  insert into public.class_rooms (id, school_id, name, level_id, cycle, capacity) values
    ('aaaaaa11-0000-0000-0000-0000000000ca', a, 'CM1-A', 'cm1', 'elementaire', 30),
    ('bbbbbb22-0000-0000-0000-0000000000ca', b, 'CM1-B', 'cm1', 'elementaire', 30);
  insert into public.subjects (id, school_id, name, cycles) values
    ('cccccc33-0000-0000-0000-0000000000aa', a, 'Français A', array['elementaire']::app_cycle[]),
    ('cccccc33-0000-0000-0000-0000000000ba', b, 'Français B', array['elementaire']::app_cycle[]);
  insert into public.class_subjects (school_id, class_id, subject_id, coefficient) values
    (a, 'aaaaaa11-0000-0000-0000-0000000000ca', 'cccccc33-0000-0000-0000-0000000000aa', 2),
    (b, 'bbbbbb22-0000-0000-0000-0000000000ca', 'cccccc33-0000-0000-0000-0000000000ba', 2);
  insert into public.teachers (id, school_id, kind, first_name, last_name, email) values
    ('dddddd44-0000-0000-0000-0000000000aa', a, 'professeur', 'Moussa', 'A', 'moussa.a@a.sn'),
    ('dddddd44-0000-0000-0000-0000000000ba', b, 'professeur', 'Moussa', 'B', 'moussa.b@b.sn');
  insert into public.teaching_assignments (school_id, teacher_id, class_id, subject_id) values
    (a, 'dddddd44-0000-0000-0000-0000000000aa', 'aaaaaa11-0000-0000-0000-0000000000ca', 'cccccc33-0000-0000-0000-0000000000aa'),
    (b, 'dddddd44-0000-0000-0000-0000000000ba', 'bbbbbb22-0000-0000-0000-0000000000ca', 'cccccc33-0000-0000-0000-0000000000ba');
  insert into public.parents (id, school_id, first_name, last_name, email) values
    ('eeeeee55-0000-0000-0000-0000000000ea', a, 'Awa', 'PA', 'awa@a.sn'),
    ('eeeeee55-0000-0000-0000-0000000000eb', b, 'Awa', 'PB', 'awa@b.sn');
  insert into public.students
    (id, school_id, class_id, matricule, child_code, first_name, last_name, gender, birth_date, parent_id) values
    ('eeeeee55-0000-0000-0000-0000000000a1', a, 'aaaaaa11-0000-0000-0000-0000000000ca', 'ECA0001', 'ABCDA2', 'Leila', 'A1', 'F', '2014-01-01', 'eeeeee55-0000-0000-0000-0000000000ea'),
    ('eeeeee55-0000-0000-0000-0000000000b1', b, 'bbbbbb22-0000-0000-0000-0000000000ca', 'ECB0001', 'ABCDB2', 'Leila', 'B1', 'F', '2014-01-01', 'eeeeee55-0000-0000-0000-0000000000eb');

  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data) values
    ('faa11111-0000-0000-0000-0000000000a1', 'dir.a@a.sn', crypt('x', gen_salt('bf')), now(), '{"role":"directeur","school_id":"aaaaaa11-0000-0000-0000-0000000000a1"}'),
    ('faa11111-0000-0000-0000-0000000000a2', 'dir.b@b.sn', crypt('x', gen_salt('bf')), now(), '{"role":"directeur","school_id":"bbbbbb22-0000-0000-0000-0000000000b1"}'),
    ('faa11111-0000-0000-0000-0000000000a3', 'ens.a@a.sn', crypt('x', gen_salt('bf')), now(), '{"role":"professeur","school_id":"aaaaaa11-0000-0000-0000-0000000000a1"}'),
    ('faa11111-0000-0000-0000-0000000000a4', 'par.a@a.sn', crypt('x', gen_salt('bf')), now(), '{"role":"parent","school_id":"aaaaaa11-0000-0000-0000-0000000000a1"}'),
    ('faa11111-0000-0000-0000-0000000000a5', 'ele.a@a.sn', crypt('x', gen_salt('bf')), now(), '{"role":"eleve","school_id":"aaaaaa11-0000-0000-0000-0000000000a1"}'),
    ('faa11111-0000-0000-0000-0000000000a6', 'eco.a@a.sn', crypt('x', gen_salt('bf')), now(), '{"role":"econome","school_id":"aaaaaa11-0000-0000-0000-0000000000a1"}'),
    ('faa11111-0000-0000-0000-0000000000a7', 'sur.a@a.sn', crypt('x', gen_salt('bf')), now(), '{"role":"surveillant","school_id":"aaaaaa11-0000-0000-0000-0000000000a1"}');

  insert into public.profiles (id, school_id, role, status, first_name, last_name, email, teacher_id, parent_id, student_id) values
    ('faa11111-0000-0000-0000-0000000000a1', a, 'directeur', 'ACTIF', 'Dir', 'A', 'dir.a@a.sn', null, null, null),
    ('faa11111-0000-0000-0000-0000000000a2', b, 'directeur', 'ACTIF', 'Dir', 'B', 'dir.b@b.sn', null, null, null),
    ('faa11111-0000-0000-0000-0000000000a3', a, 'professeur', 'ACTIF', 'Ens', 'A', 'ens.a@a.sn', 'dddddd44-0000-0000-0000-0000000000aa', null, null),
    ('faa11111-0000-0000-0000-0000000000a4', a, 'parent', 'ACTIF', 'Par', 'A', 'par.a@a.sn', null, 'eeeeee55-0000-0000-0000-0000000000ea', null),
    ('faa11111-0000-0000-0000-0000000000a5', a, 'eleve', 'ACTIF', 'Ele', 'A', 'ele.a@a.sn', null, null, 'eeeeee55-0000-0000-0000-0000000000a1'),
    ('faa11111-0000-0000-0000-0000000000a6', a, 'econome', 'ACTIF', 'Eco', 'A', 'eco.a@a.sn', null, null, null),
    ('faa11111-0000-0000-0000-0000000000a7', a, 'surveillant', 'ACTIF', 'Sur', 'A', 'sur.a@a.sn', null, null, null);

  insert into public.grades (school_id, student_id, class_id, subject_id, period, composition) values
    (a, 'eeeeee55-0000-0000-0000-0000000000a1', 'aaaaaa11-0000-0000-0000-0000000000ca', 'cccccc33-0000-0000-0000-0000000000aa', 'S1', 12),
    (b, 'eeeeee55-0000-0000-0000-0000000000b1', 'bbbbbb22-0000-0000-0000-0000000000ca', 'cccccc33-0000-0000-0000-0000000000ba', 'S1', 15);
  insert into public.report_metas (school_id, student_id, period, conduct, absences, comment) values
    (a, 'eeeeee55-0000-0000-0000-0000000000a1', 'S1', 'Bonne', 1, ' RAS'),
    (b, 'eeeeee55-0000-0000-0000-0000000000b1', 'S1', 'Bonne', 2, ' RAS');
  insert into public.payments (school_id, student_id, kind, label, due_date, amount, paid_amount) values
    (a, 'eeeeee55-0000-0000-0000-0000000000a1', 'mensualite', 'Octobre', current_date, 20000, 0),
    (b, 'eeeeee55-0000-0000-0000-0000000000b1', 'mensualite', 'Octobre', current_date, 20000, 0);
  -- payment_transactions supprimé en 00016 : fixture retirée.
  insert into public.absences (school_id, student_id, absence_date, absence_type, motif) values
    (a, 'eeeeee55-0000-0000-0000-0000000000a1', current_date, 'absence', 'Maladie'),
    (b, 'eeeeee55-0000-0000-0000-0000000000b1', current_date, 'absence', 'Maladie');
  insert into public.registration_requests (school_id, user_id, role, first_name, last_name, email, status) values
    (a, 'faa11111-0000-0000-0000-0000000000a1', 'eleve', 'Demande', 'A', 'dem.a@a.sn', 'EN_ATTENTE'),
    (b, 'faa11111-0000-0000-0000-0000000000a2', 'eleve', 'Demande', 'B', 'dem.b@b.sn', 'EN_ATTENTE');
end;
$$;
select pg_temp.temp_setup();

-- Session simulée : rôle PostgREST + claims JWT.
create or replace function pg_temp.temp_act_as(p_user_id uuid) returns text
language sql as $$
  select jsonb_build_object(
    'sub', p_user_id,
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'role', (select role from public.profiles where id = p_user_id),
      'school_id', (select school_id from public.profiles where id = p_user_id)))::text
$$;

-- SET ROLE réinitialise le search_path : on le restaure à chaque changement.
create or replace function pg_temp.temp_statu(p_user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claims', pg_temp.temp_act_as(p_user_id), true);
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

-- Exécute un ordre SQL et absorbe l'erreur (renvoie le message) : permet
-- d'affirmer sur l'ÉTAT FINAL de la donnée plutôt que sur l'exception.
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

-- Compte les lignes de B visibles depuis la session courante (-1 = pas d'accès).
create or replace function pg_temp.temp_visible_b(p_table text) returns bigint
language plpgsql stable as $$
declare v bigint;
begin
  execute format('select count(*) from public.%I where school_id = %L',
                 p_table, 'bbbbbb22-0000-0000-0000-0000000000b1') into v;
  return v;
exception when others then
  return -1;
end;
$$;

-- Compte les lignes de A visibles depuis la session courante (-1 = pas d'accès).
create or replace function pg_temp.temp_visible_a(p_table text) returns bigint
language plpgsql stable as $$
declare v bigint;
begin
  execute format('select count(*) from public.%I where school_id = %L',
                 p_table, 'aaaaaa11-0000-0000-0000-0000000000a1') into v;
  return v;
exception when others then
  return -1;
end;
$$;

-- ===========================================================================
-- 1. RLS activée sur TOUTES les tables du schéma public
-- ===========================================================================
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false),
  ''::text, 'RLS activée sur toutes les tables de public'
) as a01_rls_partout;

-- ===========================================================================
-- 2. Isolation en LECTURE : le directeur de A ne voit RIEN de l'école B
-- ===========================================================================
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a1');

select is(pg_temp.temp_visible_b('students') <= 0, true, 'A ne voit aucun élève de B (students)') as a02;
select is(pg_temp.temp_visible_b('teachers') <= 0, true, 'A ne voit aucun enseignant de B (teachers)') as a03;
select is(pg_temp.temp_visible_b('parents') <= 0, true, 'A ne voit aucun parent de B (parents)') as a04;
select is(pg_temp.temp_visible_b('class_rooms') <= 0, true, 'A ne voit aucune classe de B (class_rooms)') as a05;
select is(pg_temp.temp_visible_b('subjects') <= 0, true, 'A ne voit aucune matière de B (subjects)') as a06;
select is(pg_temp.temp_visible_b('class_subjects') <= 0, true, 'A ne voit aucun programme de B (class_subjects)') as a07;
select is(pg_temp.temp_visible_b('teaching_assignments') <= 0, true, 'A ne voit aucune affectation de B (teaching_assignments)') as a08;
select is(pg_temp.temp_visible_b('grades') <= 0, true, 'A ne voit aucune note de B (grades)') as a09;
select is(pg_temp.temp_visible_b('report_metas') <= 0, true, 'A ne voit aucune meta de bulletin de B (report_metas)') as a10;
select is(pg_temp.temp_visible_b('payments') <= 0, true, 'A ne voit aucune échéance de B (payments)') as a11;
-- payment_transactions supprimé en 00016 : test retiré (plus de registre).
select is(pg_temp.temp_visible_b('absences') <= 0, true, 'A ne voit aucune absence de B (absences)') as a16;
select is(pg_temp.temp_visible_b('registration_requests') <= 0, true, 'A ne voit aucune demande de B (registration_requests)') as a17;
select is(pg_temp.temp_visible_b('profiles') <= 0, true, 'A ne voit aucun profil de B (profiles)') as a18;
select is(pg_temp.temp_visible_b('school_settings') <= 0, true, 'A ne voit aucun paramétrage de B (school_settings)') as a19;
select is(pg_temp.temp_visible_b('level_fees') <= 0, true, 'A ne voit aucun frais de niveau de B (level_fees)') as a20;
select is(pg_temp.temp_visible_b('subscriptions') <= 0, true, 'A ne voit aucun abonnement de B (subscriptions)') as a21;
select is(pg_temp.temp_visible_b('subscription_events') <= 0, true, 'A ne voit aucun événement d''abonnement de B') as a22;
select is(pg_temp.temp_visible_b('counters') <= 0, true, 'A ne voit aucun compteur de B (counters)') as a23;
select is(
  (select count(*) from public.schools where id = 'bbbbbb22-0000-0000-0000-0000000000b1'),
  0::bigint, 'A ne voit pas l''école B (schools)'
) as a24;

-- Le directeur de A voit bien ses propres données (contrôle de non-régression).
select is(pg_temp.temp_visible_a('students'), 1::bigint, 'A voit ses propres élèves') as a25;
select is(pg_temp.temp_visible_a('payments'), 1::bigint, 'A voit ses propres échéances') as a26;

-- ===========================================================================
-- 3. Isolation en ÉCRITURE : état final de la donnée après tentative
-- ===========================================================================
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a1');
select pg_temp.temp_try($$update public.students set school_id = 'bbbbbb22-0000-0000-0000-0000000000b1'
     where id = 'eeeeee55-0000-0000-0000-0000000000a1'$$);
select pg_temp.temp_try($$update public.teachers set school_id = 'bbbbbb22-0000-0000-0000-0000000000b1'
     where id = 'dddddd44-0000-0000-0000-0000000000aa'$$);
select pg_temp.temp_try($$update public.school_settings set school_id = 'bbbbbb22-0000-0000-0000-0000000000b1'
     where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1'$$);
select pg_temp.temp_try($$update public.payments set school_id = 'bbbbbb22-0000-0000-0000-0000000000b1'
     where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1'$$);
select pg_temp.temp_try($$insert into public.students (school_id, class_id, matricule, child_code, first_name, last_name, gender)
     values ('bbbbbb22-0000-0000-0000-0000000000b1', 'bbbbbb22-0000-0000-0000-0000000000ca',
             'EVIL001', 'EVL234', 'Intrus', 'X', 'M')$$);
select pg_temp.temp_try($$insert into public.teachers (school_id, kind, first_name, last_name, email)
     values ('bbbbbb22-0000-0000-0000-0000000000b1', 'professeur', 'Intrus', 'X', 'i@b.sn')$$);
select pg_temp.temp_role('postgres');

select is(
  (select school_id::text from public.students where id = 'eeeeee55-0000-0000-0000-0000000000a1'),
  'aaaaaa11-0000-0000-0000-0000000000a1'::text,
  'un élève de A ne peut pas être déplacé vers l''école B'
) as a27;

select is(
  (select school_id::text from public.teachers where id = 'dddddd44-0000-0000-0000-0000000000aa'),
  'aaaaaa11-0000-0000-0000-0000000000a1'::text,
  'un enseignant de A ne peut pas être déplacé vers l''école B'
) as a28;

select is(
  (select school_id::text from public.school_settings where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1'),
  'aaaaaa11-0000-0000-0000-0000000000a1'::text,
  'les paramètres de A ne peuvent pas être déplacés vers B'
) as a29;

select is(
  (select count(*) from public.students where school_id = 'bbbbbb22-0000-0000-0000-0000000000b1'),
  1::bigint, 'le directeur de A ne peut pas créer d''élève dans l''école B'
) as a30;

select is(
  (select count(*) from public.teachers where school_id = 'bbbbbb22-0000-0000-0000-0000000000b1'),
  1::bigint, 'le directeur de A ne peut pas créer d''enseignant dans l''école B'
) as a31;

-- ===========================================================================
-- 4. Rôle ANONYME : lecture et écriture sur les tables métier
-- ===========================================================================
select pg_temp.temp_role('anon');

select is(pg_temp.temp_visible_a('students') <= 0, true, 'anon ne lit aucun élève') as a32;
select is(pg_temp.temp_visible_a('grades') <= 0, true, 'anon ne lit aucune note') as a33;
select is(pg_temp.temp_visible_a('payments') <= 0, true, 'anon ne lit aucune échéance') as a34;
select is(pg_temp.temp_visible_a('profiles') <= 0, true, 'anon ne lit aucun profil') as a35;
select is(pg_temp.temp_visible_a('teachers') <= 0, true, 'anon ne lit aucun enseignant') as a36;

select is(
  (select pg_temp.temp_try($$insert into public.students (school_id, class_id, matricule, child_code, first_name, last_name, gender)
     values ('aaaaaa11-0000-0000-0000-0000000000a1', 'aaaaaa11-0000-0000-0000-0000000000ca',
             'ANON001', 'ABC234', 'Anonyme', 'X', 'M')$$)),
  'refusé'::text, 'anon ne peut pas créer d''élève'
) as a37;

select is(
  (select pg_temp.temp_try($$insert into public.contact_messages (name, email, subject, message)
     values ('Anonyme', 'unique-a38@a.sn', 'Sujet', 'Message')$$)),
  'ok'::text, 'anon PEUT déposer un message (politique contact_messages_insert_anon)'
) as a38;

-- Les seules surfaces publiques autorisées : niveaux, formules, matricule.
select is((select count(*) from public.levels) > 0, true, 'anon lit les niveaux (référentiel public)') as a39;
select is((select count(*) from public.plans) > 0, true, 'anon lit les formules (référentiel public)') as a40;

-- ===========================================================================
-- 5. Fonctions SECURITY DEFINER : aucune ne doit être exécutable par anon
--    pour écrire dans une table métier.
-- ===========================================================================
select is(
  (select pg_temp.temp_try($$select public.build_payment_plan('eeeeee55-0000-0000-0000-0000000000b1')$$)),
  'refusé'::text, 'anon ne peut pas générer l''échéancier d''un élève de B'
) as a41;

select pg_temp.temp_role('postgres');
select is(
  (select count(*) from public.payments where student_id = 'eeeeee55-0000-0000-0000-0000000000b1'),
  1::bigint, 'l''échéancier de l''élève de B est inchangé (1 échéance)'
) as a42;

select pg_temp.temp_role('anon');
select is(
  (select pg_temp.temp_try($$select public.next_student_matricule('bbbbbb22-0000-0000-0000-0000000000b1', '2026-2027')$$)),
  'refusé'::text, 'anon ne peut pas consommer un matricule dans l''école B'
) as a43;

-- apply_paid_subscription / apply_paid_installment supprimés en 00016 :
-- les tests a44 / a45 sont retirés (les RPC n'existent plus).

select is(
  (select pg_temp.temp_try($$select public.enroll_student('aaaaaa11-0000-0000-0000-0000000000ca', 'X', 'Y', 'M', '2015-01-01',
       '{}'::jsonb, null, 'P', 'P', '771234567', 'p@a.sn', '')$$)),
  'refusé'::text, 'anon ne peut pas inscrire un élève'
) as a46;

-- Une fonction non restreinte ne doit pas exposer le détail d'un autre school_id.
select is(
  (select pg_temp.temp_try($$select public.subscription_info('bbbbbb22-0000-0000-0000-0000000000b1')$$)),
  'refusé'::text, 'anon ne peut pas consulter l''abonnement d''une autre école'
) as a47;

-- ===========================================================================
-- 6. Jointures croisées : une ligne de A ne peut pas référencer B
-- ===========================================================================
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a1');

select pg_temp.temp_try($$insert into public.class_subjects (school_id, class_id, subject_id, coefficient)
     values ('aaaaaa11-0000-0000-0000-0000000000a1', 'bbbbbb22-0000-0000-0000-0000000000ca',
             'cccccc33-0000-0000-0000-0000000000ba', 2)$$);
select pg_temp.temp_try($$select public.replace_cell_teachers(
       'bbbbbb22-0000-0000-0000-0000000000ca',
       'cccccc33-0000-0000-0000-0000000000ba',
       array['dddddd44-0000-0000-0000-0000000000aa'::uuid])$$);
select pg_temp.temp_role('postgres');

select is(
  (select count(*) from public.class_subjects
    where class_id = 'bbbbbb22-0000-0000-0000-0000000000ca'
      and school_id = 'aaaaaa11-0000-0000-0000-0000000000a1'),
  0::bigint, 'le directeur de A ne peut pas rattacher sa classe à une matière de B'
) as a48;

select is(
  (select count(*) from public.teaching_assignments
    where class_id = 'bbbbbb22-0000-0000-0000-0000000000ca'
      and school_id = 'aaaaaa11-0000-0000-0000-0000000000a1'),
  0::bigint, 'le directeur de A ne peut pas affecter un enseignant à une classe de B'
) as a49;

select is(
  (select count(*) from public.teaching_assignments
    where class_id = 'bbbbbb22-0000-0000-0000-0000000000ca'),
  1::bigint, 'aucune affectation de A ne pointe vers la classe de B'
) as a50;

-- ===========================================================================
-- 7. Escalade de privilèges : un utilisateur ne peut pas s'attribuer un rôle
-- ===========================================================================
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a4'); -- parent de A

select pg_temp.temp_try($$update public.profiles set role = 'directeur', school_id = 'bbbbbb22-0000-0000-0000-0000000000b1'
     where id = 'faa11111-0000-0000-0000-0000000000a4'$$);
select pg_temp.temp_try($$update public.profiles set status = 'DESACTIVE' where id = 'faa11111-0000-0000-0000-0000000000a4'$$);
select pg_temp.temp_try($$update public.profiles set email = 'pirate@evil.sn' where id = 'faa11111-0000-0000-0000-0000000000a4'$$);
select pg_temp.temp_role('postgres');

select is(
  (select role::text from public.profiles where id = 'faa11111-0000-0000-0000-0000000000a4'),
  'parent'::text, 'un parent ne peut pas s''attribuer le rôle directeur'
) as a51;

select is(
  (select email from public.profiles where id = 'faa11111-0000-0000-0000-0000000000a4'),
  'par.a@a.sn'::text, 'un parent ne peut pas changer son e-mail'
) as a52;

select is(
  (select school_id::text from public.profiles where id = 'faa11111-0000-0000-0000-0000000000a4'),
  'aaaaaa11-0000-0000-0000-0000000000a1'::text, 'le parent reste rattaché à SON école'
) as a53;

select is(
  (select status::text from public.profiles where id = 'faa11111-0000-0000-0000-0000000000a4'),
  'ACTIF'::text, 'un parent ne peut pas modifier son propre statut'
) as a54;

-- ===========================================================================
-- 8. Unicité par école et unicité globale de l'e-mail
-- ===========================================================================
select pg_temp.temp_role('postgres');
select is(
  (select pg_temp.temp_try($$insert into public.students (school_id, class_id, matricule, child_code, first_name, last_name, gender)
     values ('aaaaaa11-0000-0000-0000-0000000000a1', 'aaaaaa11-0000-0000-0000-0000000000ca',
             'ECA0001', 'ZZZZ99', 'Doublon', 'Mat', 'M')$$)),
  'refusé'::text, 'le matricule est unique PAR ÉCOLE'
) as a55;
select is(
  (select pg_temp.temp_try($$insert into public.students (school_id, class_id, matricule, child_code, first_name, last_name, gender)
     values ('bbbbbb22-0000-0000-0000-0000000000b1', 'bbbbbb22-0000-0000-0000-0000000000ca',
             'ECA0001', 'ZZZZ88', 'Doublon', 'Mat', 'M')$$)),
  'ok'::text, 'le même matricule est AUTORISÉ dans une autre école'
) as a56;
select is(
  (select pg_temp.temp_try($$insert into public.profiles (id, school_id, role, status, first_name, last_name, email)
     values ('faa11111-0000-0000-0000-0000000000ff', 'aaaaaa11-0000-0000-0000-0000000000a1',
             'parent', 'ACTIF', 'X', 'Y', 'par.a@a.sn')$$)),
  'refusé'::text, 'l''e-mail de profil est unique GLOBALEMENT'
) as a57;

-- ===========================================================================
-- 9. (C3) complete_password_change ne lève jamais le drapeau toute seule.
-- ===========================================================================
select pg_temp.temp_role('postgres');
update public.profiles set must_change_password = true
 where id = 'faa11111-0000-0000-0000-0000000000a4';
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a4');
select is(
  (select pg_temp.temp_try($$select public.complete_password_change()$$)),
  'ok'::text, 'la RPC de confirmation est autorisée pour un compte actif'
) as a58;
select pg_temp.temp_role('postgres');
select is(
  (select must_change_password from public.profiles
    where id = 'faa11111-0000-0000-0000-0000000000a4'),
  true, 'complete_password_change ne lève PAS must_change_password sans changement réel'
) as a59;

select * from finish();
rollback;
