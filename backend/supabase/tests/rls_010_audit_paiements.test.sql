-- ============================================================================
-- AUDIT — Axe C : argent réel (schéma courant, post-00016 / 00055 / 00056).
--
-- Les tests historiques reposaient sur payment_transactions et apply_paid_*
-- (supprimés en 00016) et contenaient une assertion tautologique sur la
-- limite d'élèves (c32). Ils sont remplacés par les contrôles réellement
-- applicables : statut manuel NULL, référence unique, devis avec montant.
-- Exécution : npx supabase test db  (base locale requise)
-- ============================================================================

begin;
set local search_path = pgtap, public, extensions;
grant usage on schema pgtap to public;
select plan(13);

create or replace function pg_temp.temp_setup() returns void
language plpgsql volatile as $$
declare
  a uuid := 'aaaaaa11-0000-0000-0000-0000000000a1';
begin
  insert into public.schools (id, name, city, cycles)
    values (a, 'École A', 'Dakar', array['elementaire']::public.app_cycle[]);
  insert into public.school_settings (school_id) values (a);
  insert into public.subscriptions (school_id, plan_id, starts_at, ends_at)
    values (a, 'essentiel', current_date, current_date + 30);
  insert into public.class_rooms (id, school_id, name, level_id, cycle, capacity)
    values ('aaaaaa11-0000-0000-0000-0000000000ca', a, 'CM1-A', 'cm1', 'elementaire', 30);
  insert into public.parents (id, school_id, first_name, last_name, email)
    values ('eeeeee55-0000-0000-0000-0000000000ea', a, 'Awa', 'PA', 'awa@a.sn');
  insert into public.students (id, school_id, class_id, matricule, child_code, first_name, last_name, gender)
    values ('eeeeee55-0000-0000-0000-0000000000a1', a, 'aaaaaa11-0000-0000-0000-0000000000ca',
            'ECA0001', 'ABCDA2', 'Leila', 'A1', 'F');
  insert into public.payments (id, school_id, student_id, kind, label, due_date, amount)
    values ('11111111-0000-0000-0000-000000000001', a, 'eeeeee55-0000-0000-0000-0000000000a1',
            'mensualite', 'Octobre', current_date, 20000),
           ('11111111-0000-0000-0000-000000000002', a, 'eeeeee55-0000-0000-0000-0000000000a1',
            'mensualite', 'Novembre', current_date + 30, 20000);
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
    values ('faa11111-0000-0000-0000-0000000000a2', 'eco.a@a.sn', crypt('x', gen_salt('bf')), now(),
            jsonb_build_object('role', 'econome', 'school_id', a));
  insert into public.profiles (id, school_id, role, status, first_name, last_name, email)
    values ('faa11111-0000-0000-0000-0000000000a2', a, 'econome', 'ACTIF', 'Eco', 'A', 'eco.a@a.sn');
end;
$$;
select pg_temp.temp_setup();

create or replace function pg_temp.temp_statu(p_user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user_id, 'role', 'authenticated',
      'app_metadata', jsonb_build_object('role',
        (select role from public.profiles where id = p_user_id),
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

select is((select count(*) from public.payments), 2::bigint, 'deux échéances en base');

-- ----------------------------------------------------------------------------
-- (M10/M11) Statut manuel : NULL rejeté, référence non vide et unique.
-- ----------------------------------------------------------------------------
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a2'); -- économe
select is(
  (select pg_temp.temp_try($$select public.set_payment_manual_status(
     '11111111-0000-0000-0000-000000000001', null)$$)),
  'refusé'::text, 'un statut NULL est refusé'
);
select is(
  (select pg_temp.temp_try($$select public.set_payment_manual_status(
     '11111111-0000-0000-0000-000000000001', 'paye', 'REF-001')$$)),
  'ok'::text, 'encaissement « payé » avec référence accepté'
);
select pg_temp.temp_role('postgres');
select is(
  (select paid_amount from public.payments where id = '11111111-0000-0000-0000-000000000001'),
  20000, 'le montant est solder intégralement'
);
select is(
  (select reference from public.payments where id = '11111111-0000-0000-0000-000000000001'),
  'REF-001'::text, 'la référence fournie est conservée'
);
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a2');
select is(
  (select pg_temp.temp_try($$select public.set_payment_manual_status(
     '11111111-0000-0000-0000-000000000002', 'paye', 'REF-001')$$)),
  'refusé'::text, 'une référence déjà utilisée est refusée'
);
select is(
  (select pg_temp.temp_try($$select public.set_payment_manual_status(
     '11111111-0000-0000-0000-000000000002', 'paye', '  ')$$)),
  'refusé'::text, 'une référence vide est refusée'
);
select pg_temp.temp_role('postgres');
select is(
  (select paid_amount from public.payments where id = '11111111-0000-0000-0000-000000000002'),
  0, 'la seconde échéance reste impayée'
);
select is(
  has_function_privilege('anon'::regrole,
    'public.set_payment_manual_status(uuid, text, text)', 'execute'),
  false, 'anon ne peut pas solder une échéance'
);

-- ----------------------------------------------------------------------------
-- (M8) Formule sur devis : montant obligatoire pour le support.
-- ----------------------------------------------------------------------------
select pg_temp.temp_role('service_role');
select is(
  (select pg_temp.temp_try($$select public.activate_school_subscription(
     'aaaaaa11-0000-0000-0000-0000000000a1', 'illimite', 'monthly')$$)),
  'refusé'::text, 'devis sans montant refusé'
);
select is(
  (select pg_temp.temp_try($$select public.activate_school_subscription(
     'aaaaaa11-0000-0000-0000-0000000000a1', 'illimite', 'monthly', 50000, 'DEV-001', 'especes')$$)),
  'ok'::text, 'devis avec montant > 0 accepté par le support'
);
select pg_temp.temp_role('postgres');
select is(
  (select plan_id::text from public.subscriptions
    where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1'),
  'illimite'::text, 'l''abonnement passe à la formule sur devis'
);
select is(
  (select amount_paid from public.subscriptions
    where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1'),
  50000, 'le montant négocié est enregistré'
);

select * from finish();
rollback;
