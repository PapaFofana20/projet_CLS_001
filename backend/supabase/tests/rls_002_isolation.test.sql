-- ============================================================================
-- Tests pgTAP — Phase 2 : isolation multi-écoles & statuts de compte.
-- Exécution : npx supabase test db  (base locale requise)
-- ============================================================================

begin;
select plan(11);

-- ----------------------------------------------------------------------------
-- Jeu d'essai : deux écoles A et B, comptes dans chacune
-- ----------------------------------------------------------------------------
create or replace function temp_setup() returns void
language plpgsql volatile as $$
declare
  a uuid := 'aaaaaa11-0000-0000-0000-000000000001';
  b uuid := 'bbbbbb22-0000-0000-0000-000000000001';
begin
  insert into public.schools (id, name, cycles) values (a, 'École A', array['elementaire','moyen','secondaire']::app_cycle[]);
  insert into public.schools (id, name, cycles) values (b, 'École B', array['elementaire','moyen','secondaire']::app_cycle[]);
  insert into public.school_settings (school_id) values (a), (b);

  insert into public.subscriptions (school_id, plan_id, starts_at, ends_at, student_limit)
  values (a, 'essentiel', current_date, current_date + 30, 300),
         (b, 'essentiel', current_date, current_date + 30, 300);

  insert into public.teachers (id, school_id, kind, first_name, last_name, email)
  values ('dddddd44-0000-0000-0000-000000001212', a, 'professeur', 'Moussa A', 'A', 'moussa.a@schoola.sn'),
         ('dddddd44-0000-0000-0000-000000001313', b, 'professeur', 'Moussa B', 'B', 'moussa.b@schoolb.sn');
  insert into public.class_rooms (id, school_id, name, level_id, cycle, capacity)
  values ('aaaaaa11-0000-0000-0000-0000000000ca', a, 'CM1-A', 'cm1', 'elementaire', 30),
         ('bbbbbb22-0000-0000-0000-0000000000ca', b, 'CM1-B', 'cm1', 'elementaire', 30);

  insert into public.subjects (id, school_id, name, cycles)
  values ('cccccc33-0000-0000-0000-000000001111', a, 'Français A', array['elementaire','moyen','secondaire']::app_cycle[]);

  insert into public.class_subjects (school_id, class_id, subject_id, coefficient)
  values (a, 'aaaaaa11-0000-0000-0000-0000000000ca', 'cccccc33-0000-0000-0000-000000001111', 2);

  

  insert into public.teaching_assignments (school_id, teacher_id, class_id, subject_id)
  values (a, 'dddddd44-0000-0000-0000-000000001212', 'aaaaaa11-0000-0000-0000-0000000000ca', 'cccccc33-0000-0000-0000-000000001111');

  insert into public.parents (id, school_id, first_name, last_name, email)
  values ('eeeeee55-0000-0000-0000-000000001717', a, 'Awa', 'P1', 'awa.p1@schoola.sn'),
         ('eeeeee55-0000-0000-0000-000000001818', a, 'Bibi', 'P2', 'bibi.p2@schoola.sn');
  insert into public.students (id, school_id, class_id, matricule, child_code, first_name, last_name, gender, birth_date, parent_id)
  values ('eeeeee55-0000-0000-0000-000000001414', a, 'aaaaaa11-0000-0000-0000-0000000000ca', 'ECA0001', 'ABCD23', 'Elève A1', 'A1', 'F', '2014-01-01', null),
         ('eeeeee55-0000-0000-0000-000000001515', a, 'aaaaaa11-0000-0000-0000-0000000000ca', 'ECA0002', 'ABCD24', 'Elève A2', 'A2', 'M', '2012-02-02', null),
         ('eeeeee55-0000-0000-0000-000000001616', b, 'bbbbbb22-0000-0000-0000-0000000000ca', 'ECB0001', 'BBBD25', 'Elève B1', 'B1', 'F', '2013-03-03', null);

  
  update public.students set parent_id = 'eeeeee55-0000-0000-0000-000000001717' where id = 'eeeeee55-0000-0000-0000-000000001414';
  update public.students set parent_id = 'eeeeee55-0000-0000-0000-000000001818' where id = 'eeeeee55-0000-0000-0000-000000001515';

  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
  values
    ('ffaaaa11-0000-0000-0000-0000000000da', 'dir.a@schoola.sn', crypt('demo1234!', gen_salt('bf')), now(), '{"role":"directeur","school_id":"aaaaaa11-0000-0000-0000-000000000001"}'),
    ('ffaaaa11-0000-0000-0000-000000001919', 'enattente.a@schoola.sn', crypt('demo1234!', gen_salt('bf')), now(), '{"role":"parent","school_id":"aaaaaa11-0000-0000-0000-000000000001"}'),
    ('ffaaaa11-0000-0000-0000-000000001a1a', 'desactive.a@schoola.sn', crypt('demo1234!', gen_salt('bf')), now(), '{"role":"parent","school_id":"aaaaaa11-0000-0000-0000-000000000001"}'),
    ('ffaaaa11-0000-0000-0000-000000001b1b', 'teach.a@schoola.sn', crypt('demo1234!', gen_salt('bf')), now(), '{"role":"professeur","school_id":"aaaaaa11-0000-0000-0000-000000000001"}'),
    ('ffaaaa11-0000-0000-0000-000000001c1c', 'parent.a@schoola.sn', crypt('demo1234!', gen_salt('bf')), now(), '{"role":"parent","school_id":"aaaaaa11-0000-0000-0000-000000000001"}'),
    ('ffbbbb22-0000-0000-0000-0000000000db', 'dir.b@schoolb.sn', crypt('demo1234!', gen_salt('bf')), now(), '{"role":"directeur","school_id":"bbbbbb22-0000-0000-0000-000000000001"}');
  insert into public.profiles (id, school_id, role, status, first_name, last_name, email, parent_id, teacher_id)
  values
    ('ffaaaa11-0000-0000-0000-0000000000da', a, 'directeur', 'ACTIF', 'Direct', 'A', 'dir.a@schoola.sn', null, null),
    ('ffaaaa11-0000-0000-0000-000000001919', a, 'parent', 'EN_ATTENTE', 'Attente', 'A', 'enattente.a@schoola.sn', 'eeeeee55-0000-0000-0000-000000001818', null),
    ('ffaaaa11-0000-0000-0000-000000001a1a', a, 'parent', 'DESACTIVE', 'Desact', 'A', 'desactive.a@schoola.sn', 'eeeeee55-0000-0000-0000-000000001717', null),
    ('ffaaaa11-0000-0000-0000-000000001b1b', a, 'professeur', 'ACTIF', 'Moussa A', 'A', 'teach.a@schoola.sn', null, 'dddddd44-0000-0000-0000-000000001212'),
    ('ffaaaa11-0000-0000-0000-000000001c1c', a, 'parent', 'ACTIF', 'Awa', 'P1', 'parent.a@schoola.sn', 'eeeeee55-0000-0000-0000-000000001717', null),
    ('ffbbbb22-0000-0000-0000-0000000000db', b, 'directeur', 'ACTIF', 'Direct', 'B', 'dir.b@schoolb.sn', null, null);

  
end;
$$;
select temp_setup();

-- Simulation de session : rôle authenticated + claims JWT.
create or replace function temp_act_as(p_user_id uuid) returns text
language sql as $$
  select (
    select case
      when p_user_id = 'ffaaaa11-0000-0000-0000-000000001919' then '{"sub":"ffaaaa11-0000-0000-0000-000000001919","app_metadata":{"role":"parent","school_id":"aaaaaa11-0000-0000-0000-000000000001"}}'
      when p_user_id = 'ffaaaa11-0000-0000-0000-000000001a1a' then '{"sub":"ffaaaa11-0000-0000-0000-000000001a1a","app_metadata":{"role":"parent","school_id":"aaaaaa11-0000-0000-0000-000000000001"}}'
      when p_user_id = 'ffaaaa11-0000-0000-0000-000000001b1b' then '{"sub":"ffaaaa11-0000-0000-0000-000000001b1b","app_metadata":{"role":"professeur","school_id":"aaaaaa11-0000-0000-0000-000000000001"}}'
      when p_user_id = 'ffaaaa11-0000-0000-0000-000000001c1c' then '{"sub":"ffaaaa11-0000-0000-0000-000000001c1c","app_metadata":{"role":"parent","school_id":"aaaaaa11-0000-0000-0000-000000000001"}}'
      when p_user_id = 'ffbbbb22-0000-0000-0000-0000000000db' then '{"sub":"ffbbbb22-0000-0000-0000-0000000000db","app_metadata":{"role":"directeur","school_id":"bbbbbb22-0000-0000-0000-000000000001"}}'
      else '{"sub":"ffaaaa11-0000-0000-0000-0000000000da","app_metadata":{"role":"directeur","school_id":"aaaaaa11-0000-0000-0000-000000000001"}}'
    end
  )
$$;

create or replace function temp_statu(p_user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claims', temp_act_as(p_user_id), true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. anonyme : rien n'est lisible
-- ----------------------------------------------------------------------------
select set_config('role', 'anon', true);
select set_config('search_path', 'pgtap, public, extensions', true);
select is(
  (select count(*) from public.students),
  0::bigint, 'anon ne lit aucun élève (RLS fermée)'
) as anon_students_closes;

-- ----------------------------------------------------------------------------
-- 2. directeurs de A : uniquement les élèves de A
-- ----------------------------------------------------------------------------
select temp_statu('ffaaaa11-0000-0000-0000-0000000000da');
select is(
  (select count(*) from public.students where school_id = 'aaaaaa11-0000-0000-0000-000000000001'),
  2::bigint, 'le directeur de A voit les 2 élèves de A'
) as dir_a_students;
select is(
  (select count(*) from public.students where school_id = 'bbbbbb22-0000-0000-0000-000000000001'),
  0::bigint, 'le directeur de A ne voit Rien de l''école B'
) as dir_a_no_school_b;

-- ----------------------------------------------------------------------------
-- 3. compte EN_ATTENTE : rien n'est lisible, même dans son école
-- ----------------------------------------------------------------------------
select temp_statu('ffaaaa11-0000-0000-0000-000000001919');
select is(
  (select count(*) from public.students),
  0::bigint, 'un compte EN_ATTENTE ne lit aucun élève'
) as en_attente_bloque;

-- ----------------------------------------------------------------------------
-- 4. compte désactivé pareillement bloqué (statut DESACTIVE initial)
-- ----------------------------------------------------------------------------
select temp_statu('ffaaaa11-0000-0000-0000-000000001a1a');
select is(
  (select count(*) from public.students),
  0::bigint, 'un compte DESACTIVE ne lit aucun élève'
) as desactive_bloque;

-- ----------------------------------------------------------------------------
-- 5. parent : il ne voit que SES élèves (p1 → s1 uniquement)
-- ----------------------------------------------------------------------------
select temp_statu('ffaaaa11-0000-0000-0000-000000001c1c');
select is(
  (select count(*) from public.students),
  1::bigint, 'le parent p1 ne voit que son propre enfant'
) as parent_isolated;

-- ----------------------------------------------------------------------------
-- 6. professeur affecté : l''élève de sa classe seulement (pas les élèves d''une autre école)
-- ----------------------------------------------------------------------------
select temp_statu('ffaaaa11-0000-0000-0000-000000001b1b');
select is(
  (select count(*) from public.students),
  2::bigint, 'le professeur affecté au CM1-A voit les élèves de SA classe'
) as teacher_scope;

-- ----------------------------------------------------------------------------
-- 7. abonnement expiré : lecture seule puis blocage total sur les écritures
-- ----------------------------------------------------------------------------
select set_config('role', 'postgres', true);
select set_config('search_path', 'pgtap, public, extensions', true);
select set_config('search_path', 'pgtap, public, extensions', true);
update public.subscriptions set ends_at = current_date - 4
where school_id = 'aaaaaa11-0000-0000-0000-000000000001';
select set_config('search_path', 'pgtap, public, extensions', true);
select is(
  (select (public.subscription_info('aaaaaa11-0000-0000-0000-000000000001')).status),
  'EXPIRE', 'échéance - 4 jours → statut EXPIRE'
) as status_expire;
select set_config('role', 'postgres', true);
select set_config('search_path', 'pgtap, public, extensions', true);
select set_config('search_path', 'pgtap, public, extensions', true);
select is(
  (select (public.subscription_info('aaaaaa11-0000-0000-0000-000000000001')).read_only),
  true, 'échéance - 4 jours → lecture seule'
) as read_only_true;
select is(
  public.school_is_writable('aaaaaa11-0000-0000-0000-000000000001'),
  false, 'école en lecture seule : écriture bloquée'
) as writable_false;

update public.subscriptions set ends_at = current_date - 30
where school_id = 'aaaaaa11-0000-0000-0000-000000000001';
select set_config('role', 'postgres', true);
select set_config('search_path', 'pgtap, public, extensions', true);
select set_config('search_path', 'pgtap, public, extensions', true);
select is(
  (select (public.subscription_info('aaaaaa11-0000-0000-0000-000000000001')).blocked),
  true, 'échéance - 30 jours → accès bloqué'
) as blocked_true;

select * from finish();
rollback;
