-- ============================================================================
-- AUDIT — Axe C : abonnements, matricule d'école, paiements (argent réel)
--
-- Comportement ATTENDU. Les échecs observés sur le code audité matérialisent
-- des défauts financiers (paiement impossible, échéancier non généré,
-- matricule non attribué) ou des absences de garde-fou.
--
-- Exécution : npx supabase test db   (base locale requise)
-- ============================================================================

begin;
set local search_path = pgtap, public, extensions;
grant usage on schema pgtap to public;
select plan(34);

create or replace function pg_temp.temp_setup() returns void
language plpgsql volatile as $$
declare
  a uuid := 'aaaaaa11-0000-0000-0000-0000000000a1';
begin
  insert into public.schools (id, name, city, cycles, auto_approve_students)
    values (a, 'École A', 'Dakar', array['elementaire','moyen','secondaire']::app_cycle[], false);
  insert into public.school_settings (school_id) values (a);
  insert into public.level_fees (school_id, level_id, inscription, mensualite)
    values (a, 'cm1', 30000, 20000), (a, '6e', 40000, 30000);
  insert into public.subscriptions (school_id, plan_id, starts_at, ends_at, student_limit)
    values (a, 'pro', current_date, current_date + 30, 300);
  insert into public.class_rooms (id, school_id, name, level_id, cycle, capacity) values
    ('aaaaaa11-0000-0000-0000-0000000000ca', a, 'CM1-A', 'cm1', 'elementaire', 30),
    ('aaaaaa11-0000-0000-0000-0000000000cb', a, '6e-A', '6e', 'moyen', 30);
  insert into public.subjects (id, school_id, name, cycles) values
    ('cccccc33-0000-0000-0000-0000000000aa', a, 'Français A', array['elementaire']::app_cycle[]);
  insert into public.teachers (id, school_id, kind, first_name, last_name, email) values
    ('dddddd44-0000-0000-0000-0000000000aa', a, 'instituteur', 'Titu', 'A', 'titu.a@a.sn');
  insert into public.parents (id, school_id, first_name, last_name, email) values
    ('eeeeee55-0000-0000-0000-0000000000ea', a, 'Awa', 'PA', 'awa@a.sn');
  insert into public.students
    (id, school_id, class_id, matricule, child_code, first_name, last_name, gender, parent_id) values
    ('eeeeee55-0000-0000-0000-0000000000a1', a, 'aaaaaa11-0000-0000-0000-0000000000ca', 'ECA0001', 'ABCDA2', 'Leila', 'A1', 'F', 'eeeeee55-0000-0000-0000-0000000000ea');
  insert into public.payments (school_id, student_id, kind, label, due_date, amount) values
    (a, 'eeeeee55-0000-0000-0000-0000000000a1', 'mensualite', 'Octobre', current_date, 20000);
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data) values
    ('faa11111-0000-0000-0000-0000000000a1', 'dir.a@a.sn', crypt('x', gen_salt('bf')), now(), '{"role":"directeur","school_id":"aaaaaa11-0000-0000-0000-0000000000a1"}'),
    ('faa11111-0000-0000-0000-0000000000a2', 'eco.a@a.sn', crypt('x', gen_salt('bf')), now(), '{"role":"econome","school_id":"aaaaaa11-0000-0000-0000-0000000000a1"}'),
    ('faa11111-0000-0000-0000-0000000000a3', 'par.a@a.sn', crypt('x', gen_salt('bf')), now(), '{"role":"parent","school_id":"aaaaaa11-0000-0000-0000-0000000000a1"}'),
    ('faa11111-0000-0000-0000-0000000000a4', 'ele.a@a.sn', crypt('x', gen_salt('bf')), now(), '{"role":"eleve","school_id":"aaaaaa11-0000-0000-0000-0000000000a1"}');
  insert into public.profiles (id, school_id, role, status, first_name, last_name, email, teacher_id, parent_id, student_id) values
    ('faa11111-0000-0000-0000-0000000000a1', a, 'directeur', 'ACTIF', 'Dir', 'A', 'dir.a@a.sn', null, null, null),
    ('faa11111-0000-0000-0000-0000000000a2', a, 'econome', 'ACTIF', 'Eco', 'A', 'eco.a@a.sn', null, null, null),
    ('faa11111-0000-0000-0000-0000000000a3', a, 'parent', 'ACTIF', 'Awa', 'PA', 'par.a@a.sn', null, 'eeeeee55-0000-0000-0000-0000000000ea', null),
    ('faa11111-0000-0000-0000-0000000000a4', a, 'eleve', 'ACTIF', 'Leila', 'A1', 'ele.a@a.sn', null, null, 'eeeeee55-0000-0000-0000-0000000000a1');
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
    raise notice 'AUDITNOTE|erreur SQL : %', sqlerrm;
    return 'refusé';
  end;
end;
$$;

create or replace function pg_temp.temp_err(p_sql text) returns text
language plpgsql as $$
begin
  begin
    execute p_sql;
    return 'ok';
  exception when others then
    return sqlerrm;
  end;
end;
$$;

-- ===========================================================================
-- 1. Le client ne peut PAS écrire dans les tables d'argent
-- ===========================================================================
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a1'); -- directeur

select is((select pg_temp.temp_try($$insert into public.subscriptions (school_id, plan_id, ends_at, student_limit, amount_paid) values ('aaaaaa11-0000-0000-0000-0000000000a1','illimite', current_date + 3650, 999999, 0)$$)),
  'refusé'::text, 'le directeur ne peut pas créer d''abonnement lui-même') as c01;
select pg_temp.temp_try($$update public.subscriptions set ends_at = current_date + 3650, student_limit = 999999 where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1'$$);
select pg_temp.temp_role('postgres');
select is((select ends_at::text from public.subscriptions where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1'),
  (current_date + 30)::text, 'le directeur ne peut pas prolonger l''abonnement lui-même') as c02;
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a1');
select is((select pg_temp.temp_try($$update public.schools set matricule = 'ZZZZZ' where id = 'aaaaaa11-0000-0000-0000-0000000000a1'$$)),
  'refusé'::text, 'le directeur ne peut pas écrire le matricule de son école') as c03;
select pg_temp.temp_try($$update public.plans set monthly_price = 1$$);
select pg_temp.temp_role('postgres');
select is((select monthly_price from public.plans where id = 'essentiel'),
  15000::int, 'le directeur ne peut pas modifier les formules') as c04;
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a1');
select is((select pg_temp.temp_try($$update public.payments set paid_amount = 20000, status = 'paye' where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1'$$)),
  'refusé'::text, 'le directeur ne peut pas solder une échéance lui-même') as c05;
select is((select pg_temp.temp_try($$insert into public.payment_transactions (tx_kind, school_id, provider, provider_ref, amount, method, phone, status) values ('subscription','aaaaaa11-0000-0000-0000-0000000000a1','wave','WV-0000-0001',1,'wave','7012345678','succeeded')$$)),
  'refusé'::text, 'le directeur ne peut pas écrire dans le registre des transactions') as c06;
select is((select pg_temp.temp_try($$insert into public.subscription_events (school_id, event_type, plan_id, amount_paid) values ('aaaaaa11-0000-0000-0000-0000000000a1','purchase','pro',300000)$$)),
  'refusé'::text, 'le directeur ne peut pas écrire dans l''historique d''abonnement') as c07;

-- ===========================================================================
-- 2. Encaissement en espèces (économe) : le paiement DOIT être enregistré
-- ===========================================================================
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a2'); -- économe
select is(
  (select pg_temp.temp_try($$select public.record_cash_payment(
     (select id from public.payments where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1' limit 1), 5000)$$)),
  'ok'::text, 'l''économe peut enregistrer un encaissement en espèces'
) as c08;

select pg_temp.temp_role('postgres');
select is(
  (select paid_amount from public.payments where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1'),
  5000::int, 'le montant encaissé est bien enregistré (5000 FCFA)'
) as c09;
select is(
  (select status::text from public.payments where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1'),
  'partiel'::text, 'le statut de l''échéance passe à « partiel »'
) as c10;
select is(
  (select count(distinct reference) from public.payments where reference is not null),
  1::bigint, 'la référence de reçu est unique'
) as c11;

-- Un montant nul, négatif ou supérieur au dû est refusé.
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a2');
select is((select pg_temp.temp_try($$select public.record_cash_payment((select id from public.payments limit 1), 0)$$)),
  'refusé'::text, 'un encaissement de 0 FCFA est refusé') as c12;
select is((select pg_temp.temp_try($$select public.record_cash_payment((select id from public.payments limit 1), -500)$$)),
  'refusé'::text, 'un encaissement négatif est refusé') as c13;
select is((select pg_temp.temp_try($$select public.record_cash_payment((select id from public.payments limit 1), 999999)$$)),
  'refusé'::text, 'un encaissement supérieur au dû est refusé') as c14;

-- ===========================================================================
-- 3. Paiement : la confirmation du prestataire DOIT créditer
-- ===========================================================================
select pg_temp.temp_role('postgres');
insert into public.payment_transactions
  (tx_kind, school_id, payment_id, provider, provider_ref, amount, method, phone, status)
  values ('installment', 'aaaaaa11-0000-0000-0000-0000000000a1',
          (select id from public.payments limit 1), 'wave', 'WV-4242-4242', 20000, 'wave', '7012345678', 'pending');
select pg_temp.temp_role('service_role');
select is(
  (select pg_temp.temp_try($$select public.apply_paid_installment('wave','WV-4242-4242','succeeded','{}'::jsonb)$$)),
  'ok'::text, 'la confirmation du prestataire est acceptée'
) as c15;
select pg_temp.temp_role('postgres');
select is(
  (select paid_amount from public.payments where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1'),
  20000::int, 'l''échéance est créditée du montant payé'
) as c16;
select is(
  (select status::text from public.payments where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1'),
  'paye'::text, 'le statut de l''échéance passe à « payé »'
) as c17;

-- Idempotence : un rejeu ne crédite pas deux fois.
select pg_temp.temp_role('service_role');
select is(
  (select pg_temp.temp_try($$select public.apply_paid_installment('wave','WV-4242-4242','succeeded','{}'::jsonb)$$)),
  'ok'::text, 'le rejeu du webhook est accepté (idempotent)'
) as c18;
select pg_temp.temp_role('postgres');
select is(
  (select paid_amount from public.payments where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1'),
  20000::int, 'le rejeu ne crédite PAS une deuxième fois'
) as c19;

-- Un statut « failed » ne crédite rien.
select pg_temp.temp_role('postgres');
insert into public.payment_transactions
  (tx_kind, school_id, payment_id, provider, provider_ref, amount, method, phone, status)
  values ('installment', 'aaaaaa11-0000-0000-0000-0000000000a1',
          (select id from public.payments limit 1), 'wave', 'WV-4343-4343', 20000, 'wave', '7012345678', 'pending');
select pg_temp.temp_role('service_role');
select is(
  (select pg_temp.temp_try($$select public.apply_paid_installment('wave','WV-4343-4343','failed','{}'::jsonb)$$)),
  'ok'::text, 'un paiement refusé par le prestataire est traité sans erreur'
) as c20;
select pg_temp.temp_role('postgres');
select is(
  (select paid_amount from public.payments where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1'),
  20000::int, 'un paiement « failed » ne crédite rien de plus'
) as c21;

-- ===========================================================================
-- 4. Montant de l'abonnement : contrôlé côté serveur
-- ===========================================================================
select pg_temp.temp_role('postgres');
insert into public.payment_transactions
  (tx_kind, school_id, provider, provider_ref, amount, method, phone, status, payload)
  values ('subscription', 'aaaaaa11-0000-0000-0000-0000000000a1', 'wave', 'WV-5555-5555', 1, 'wave', '7012345678', 'pending',
          '{"plan_id":"essentiel","cycle":"monthly"}');
select pg_temp.temp_role('service_role');
select is(
  (select pg_temp.temp_try($$select public.apply_paid_subscription('wave','WV-5555-5555','succeeded','{}'::jsonb)$$)),
  'refusé'::text, 'un montant d''abonnement falsifié est refusé'
) as c22;

-- ===========================================================================
-- 5. Matricule d'école : généré au premier paiement, jamais modifié ensuite
-- ===========================================================================
select pg_temp.temp_role('postgres');
insert into public.payment_transactions
  (tx_kind, school_id, provider, provider_ref, amount, method, phone, status, payload)
  values ('subscription', 'aaaaaa11-0000-0000-0000-0000000000a1', 'wave', 'WV-6666-6666', 15000, 'wave', '7012345678', 'pending',
          '{"plan_id":"essentiel","cycle":"monthly"}');
select pg_temp.temp_role('service_role');
select is(
  (select pg_temp.temp_try($$select public.apply_paid_subscription('wave','WV-6666-6666','succeeded','{}'::jsonb)$$)),
  'ok'::text, 'le paiement d''abonnement est appliqué'
) as c23;
select pg_temp.temp_role('postgres');
select is(
  (select length(matricule) from public.schools where id = 'aaaaaa11-0000-0000-0000-0000000000a1'),
  5::int, 'le matricule de l''école est attribué (5 caractères)'
) as c24;

-- Renouvellement : le matricule ne change pas.
select pg_temp.temp_role('postgres');
insert into public.payment_transactions
  (tx_kind, school_id, provider, provider_ref, amount, method, phone, status, payload)
  values ('subscription', 'aaaaaa11-0000-0000-0000-0000000000a1', 'wave', 'WV-7777-7777', 15000, 'wave', '7012345678', 'pending',
          '{"plan_id":"essentiel","cycle":"monthly"}');
select pg_temp.temp_role('service_role');
select pg_temp.temp_try($$select public.apply_paid_subscription('wave','WV-7777-7777','succeeded','{}'::jsonb)$$);
select pg_temp.temp_role('postgres');
select is(
  (select count(distinct matricule) from public.schools where id = 'aaaaaa11-0000-0000-0000-0000000000a1'),
  1::bigint, 'le matricule est unique et stable au renouvellement'
) as c25;

-- ===========================================================================
-- 6. Génération du code enfant : APPEL PAR LES FONCTIONS DE SÉCURITÉ DEFINER
-- ===========================================================================
select is(
  (select pg_temp.temp_try($$select public.generate_school_code('aaaaaa11-0000-0000-0000-0000000000a1', 6, 'child_code')$$)),
  'ok'::text, 'un code enfant peut être généré (fonction de sécurité definer)'
) as c26;

-- Inscription directe d'un élève par la direction (doit produire un matricule
-- ET un code enfant, puis l'échéancier).
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a1');
select is(
  (select pg_temp.temp_try($$select public.enroll_student(
     'aaaaaa11-0000-0000-0000-0000000000cb', 'Nouvel', 'Eleve', 'M', '2015-05-05'::date,
     '{}'::jsonb, null::uuid, 'Parent', 'Nom', '7012345678', 'p.a@a.sn', '')$$)),
  'ok'::text, 'la direction peut inscrire un élève'
) as c27;
select pg_temp.temp_role('postgres');
select is(
  (select count(*) from public.students where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1'),
  2::bigint, 'l''élève inscrit est créé'
) as c28;
select is(
  (select count(*) from public.payments p
    join public.students s on s.id = p.student_id
   where s.first_name = 'Nouvel'),
  11::bigint, 'l''échéancier de l''élève inscrit est généré (frais d''inscription + 10 mensualités)'
) as c29;

-- ===========================================================================
-- 7. Approbation automatique : l'échéancier doit être créé aussi
-- ===========================================================================
select pg_temp.temp_role('postgres');
update public.schools set auto_approve_students = true where id = 'aaaaaa11-0000-0000-0000-0000000000a1';
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
  values ('faa11111-0000-0000-0000-0000000000b1', 'auto.eleve@a.sn', crypt('x', gen_salt('bf')), now(),
          '{"role":"eleve","school_id":"aaaaaa11-0000-0000-0000-0000000000a1"}');
select pg_temp.temp_role('service_role');
select is(
  (select pg_temp.temp_err($$select public.finish_student_registration(
     'faa11111-0000-0000-0000-0000000000b1', 'aaaaaa11-0000-0000-0000-0000000000a1',
     'Auto', 'Eleve', '7012345678', 'auto.eleve@a.sn', 'M', '2015-05-05'::date,
     'aaaaaa11-0000-0000-0000-0000000000cb')$$)),
  'ok'::text, 'l''inscription avec approbation automatique aboutit'
) as c30;
select pg_temp.temp_role('postgres');
select is(
  (select count(*) from public.payments p
    join public.students s on s.id = p.student_id
   where s.first_name = 'Auto' and s.last_name = 'Eleve'),
  11::bigint, 'l''élève approuvée automatiquement a bien son échéancier (inscription + 10 mensualités)'
) as c31;

-- ===========================================================================
-- 8. Limite d'élèves de la formule : appliquée à l'approbation automatique
-- ===========================================================================
select pg_temp.temp_role('postgres');
update public.subscriptions set student_limit = 1 where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1';
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
  values ('faa11111-0000-0000-0000-0000000000b2', 'deuxieme.eleve@a.sn', crypt('x', gen_salt('bf')), now(),
          '{"role":"eleve","school_id":"aaaaaa11-0000-0000-0000-0000000000a1"}');
select pg_temp.temp_role('service_role');
select is(
  (select pg_temp.temp_err($$select public.finish_student_registration(
     'faa11111-0000-0000-0000-0000000000b2', 'aaaaaa11-0000-0000-0000-0000000000a1',
     'Deuxieme', 'Eleve', '7012345678', 'deuxieme.eleve@a.sn', 'M', '2015-05-05'::date,
     'aaaaaa11-0000-0000-0000-0000000000cb')$$)),
  'ok'::text, 'l''inscription au-delà de la limite est refusée (message métier) ou non approuvée'
) as c32;
select pg_temp.temp_role('postgres');
select is(
  (select count(*) from public.students where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1'),
  3::bigint, 'la limite d''élèves de la formule est respectée (1) : aucun élève au-delà'
) as c33;

-- ===========================================================================
-- 9. Abonnement expiré : lecture seule puis blocage (frontières J-7 / J+8)
-- ===========================================================================
select pg_temp.temp_role('postgres');
update public.subscriptions set ends_at = current_date - 7 where school_id = 'aaaaaa11-0000-0000-0000-0000000000a1';
select pg_temp.temp_statu('faa11111-0000-0000-0000-0000000000a1');
select is(
  (select pg_temp.temp_try($$insert into public.class_rooms (school_id, name, level_id, cycle, capacity)
     values ('aaaaaa11-0000-0000-0000-0000000000a1', 'CM1-Z', 'cm1', 'elementaire', 30)$$)),
  'refusé'::text, 'à J+7 après échéance, l''écriture est bloquée (lecture seule)'
) as c34;

select * from finish();
rollback;
