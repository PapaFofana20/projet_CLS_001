-- ============================================================================
-- Tests pgTAP — Phase 6 : paiements des familles (schéma courant).
--
-- Le registre payment_transactions et les RPC apply_paid_* / 
-- start_installment_payments ont été supprimés en 00016 : les tests qui les
-- invoquaient sont retirés. Les tests ci-dessous couvrent l'échéancier réel
-- et le nouveau contrôle du statut manuel (00046 / 00056).
-- Exécution : npx supabase test db  (base locale requise)
-- ============================================================================

begin;
select plan(12);

create or replace function pg_temp.temp_setup() returns void
language plpgsql volatile as $$
declare
  v_school uuid := 'aaaaaa11-0000-0000-0000-000000000001';
  v_dir uuid := 'ffaaaa11-0000-0000-0000-0000000000da';
begin
  insert into public.schools (id, name, cycles)
  values (v_school, 'École A', array['elementaire']::public.app_cycle[]);
  insert into public.school_settings (school_id, school_year)
  values (v_school, '2026-2027');
  insert into public.subscriptions (school_id, plan_id, starts_at, ends_at)
  values (v_school, 'essentiel', current_date, current_date + 30);
  insert into public.level_fees (school_id, level_id, inscription, mensualite)
  values (v_school, 'cm1', 20000, 15000);
  insert into public.class_rooms (id, school_id, name, level_id, cycle, capacity)
  values ('aaaaaa11-0000-0000-0000-0000000000ca', v_school, 'CM1-A', 'cm1', 'elementaire', 30);
  insert into public.parents (id, school_id, first_name, last_name, email)
  values ('eeeeee55-0000-0000-0000-000000001111', v_school, 'Awa', 'P1', 'awa.p1@schoola.sn');
  insert into public.students (id, school_id, class_id, matricule, child_code, first_name, last_name, gender, birth_date, parent_id)
  values ('eeeeee55-0000-0000-0000-000000001212', v_school, 'aaaaaa11-0000-0000-0000-0000000000ca',
          'ECA0001', 'ABCDEF', 'Leila', 'S1', 'F', '2014-01-01', 'eeeeee55-0000-0000-0000-000000001111');
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
  values (v_dir, 'dir.a@schoola.sn', crypt('x', gen_salt('bf')), now(),
          jsonb_build_object('role', 'directeur', 'school_id', v_school));
  insert into public.profiles (id, school_id, role, status, first_name, last_name, email)
  values (v_dir, v_school, 'directeur', 'ACTIF', 'Direct', 'A', 'dir.a@schoola.sn');
  perform public.build_payment_plan('eeeeee55-0000-0000-0000-000000001212');
end;
$$;
select pg_temp.temp_setup();

-- ----------------------------------------------------------------------------
-- Échéancier généré côté serveur
-- ----------------------------------------------------------------------------
select is(
  (select count(*) > 0 from public.payments where student_id = 'eeeeee55-0000-0000-0000-000000001212'),
  true, 'build_payment_plan crée au moins une échéance'
);
select is(
  (select count(*) from public.payments
    where student_id = 'eeeeee55-0000-0000-0000-000000001212' and kind = 'inscription'),
  1::bigint, 'une échéance d''inscription'
);
select is(
  (select count(*) from public.payments
    where student_id = 'eeeeee55-0000-0000-0000-000000001212' and kind = 'mensualite'),
  10::bigint, 'dix mensualités sur l''année scolaire'
);
select is(
  (select count(*) from public.payments
    where student_id = 'eeeeee55-0000-0000-0000-000000001212' and status = 'a_venir'),
  11::bigint, 'toutes les échéances commencent à a_venir'
);

-- ----------------------------------------------------------------------------
-- Droits d'exécution (00011 / 00056)
-- ----------------------------------------------------------------------------
select is(
  has_function_privilege('authenticated'::regrole,
    'public.set_payment_manual_status(uuid, text, text)', 'execute'),
  true, 'la RPC manuelle reste accessible à authenticated'
);
select is(
  has_function_privilege('anon'::regrole,
    'public.set_payment_manual_status(uuid, text, text)', 'execute'),
  false, 'anon ne peut pas modifier un statut de paiement'
);
select is(
  has_function_privilege('authenticated'::regrole,
    'public.set_payment_manual_status_unchecked(uuid, text, text)', 'execute'),
  false, 'la fonction _unchecked est interne'
);
select is(
  has_function_privilege('authenticated'::regrole,
    'public.record_cash_payment_unchecked(uuid, int)', 'execute'),
  false, 'record_cash_payment_unchecked est interne'
);

-- ----------------------------------------------------------------------------
-- Statut manuel NULL : refusé, l'encaissement existant n'est pas effacé.
-- ----------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'ffaaaa11-0000-0000-0000-0000000000da', true);
select set_config('request.jwt.claims',
  '{"sub":"ffaaaa11-0000-0000-0000-0000000000da","role":"authenticated",'
  || '"app_metadata":{"role":"directeur","school_id":"aaaaaa11-0000-0000-0000-000000000001"}}', true);
select set_config('role', 'authenticated', true);
select set_config('search_path', 'pgtap, public, extensions', true);

select throws_ok(
  $$select public.set_payment_manual_status_unchecked(
      (select id from public.payments limit 1), null)$$,
  'P0001', 'Statut invalide.', 'un statut NULL est refusé (plus d''effacement accidentel)'
);

select is(
  (select count(*) from public.payments where paid_amount > 0),
  0::bigint, 'aucun encaissement n''a été effacé par la tentative'
);

-- ----------------------------------------------------------------------------
-- Le registre de paiement n'existe plus : aucune fuite possible.
-- ----------------------------------------------------------------------------
select is(
  (select to_regclass('public.payment_transactions')::text),
  null::text, 'payment_transactions a été supprimé (00016)'
);
select is(
  (select count(*) from public.payments),
  11::bigint, 'l''échéancier complet reste lisible par la direction'
);

select * from finish();
rollback;
