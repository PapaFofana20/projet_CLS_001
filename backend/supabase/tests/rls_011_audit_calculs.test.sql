-- ============================================================================
-- AUDIT — Axe E : exactitude métier (parité serveur ⇄ règles de référence
-- src/utils/grades.ts, payments.ts, subscription.ts)
--
-- Exécution : npx supabase test db   (base locale requise)
-- ============================================================================

begin;
set local search_path = pgtap, public, extensions;
grant usage on schema pgtap to public;
select plan(39);

-- ----------------------------------------------------------------------------
-- Jeu d'essai minimal
-- ----------------------------------------------------------------------------
insert into public.schools (id, name, cycles)
  values ('aaaaaa11-0000-0000-0000-0000000000a1', 'École A', array['elementaire','moyen']::app_cycle[]),
         ('bbbbbb22-0000-0000-0000-0000000000b1', 'École B', array['elementaire']::app_cycle[]);
insert into public.school_settings (school_id) values ('aaaaaa11-0000-0000-0000-0000000000a1');
insert into public.class_rooms (id, school_id, name, level_id, cycle, capacity)
  values ('aaaaaa11-0000-0000-0000-0000000000ca', 'aaaaaa11-0000-0000-0000-0000000000a1', 'CM1-A', 'cm1', 'elementaire', 30);
insert into public.subjects (id, school_id, name, cycles)
  values ('cccccc33-0000-0000-0000-0000000000aa', 'aaaaaa11-0000-0000-0000-0000000000a1', 'Français', array['elementaire']::app_cycle[]);
insert into public.students (id, school_id, class_id, matricule, child_code, first_name, last_name, gender)
  values ('eeeeee55-0000-0000-0000-0000000000a1', 'aaaaaa11-0000-0000-0000-0000000000a1',
          'aaaaaa11-0000-0000-0000-0000000000ca', 'ECA0001', 'ABCDA2', 'Leila', 'A1', 'F');

-- Un utilitaire : l'ordre SQL lève-t-il une exception ?
create or replace function pg_temp.pg_temp_is_error() returns boolean
language plpgsql volatile as $$
begin
  perform public.weighted_average(array[1::numeric], array[1::numeric, 2::numeric]);
  return false;
exception when others then
  return true;
end;
$$;

create or replace function pg_temp.pg_temp_is_error(p_sql text) returns boolean
language plpgsql volatile as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end;
$$;

-- ===========================================================================
-- 1. Moyenne par matière (grade_subject_average)
--    Référence : utils/grades.ts subjectAverage()
-- ===========================================================================
select is(public.grade_subject_average(15, 15, 12, 'elementaire'), 12::numeric,
  'élémentaire : la moyenne est la composition') as e01;
select is(public.grade_subject_average(10, 14, 12, 'moyen'), 12::numeric,
  'moyen : (moyenne des devoirs + composition) / 2') as e02;
select is(public.grade_subject_average(10, null, null, 'moyen'), 10::numeric,
  'devoir1 seul : la moyenne est le devoir1') as e03;
select is(public.grade_subject_average(null, null, 12, 'moyen'), 12::numeric,
  'composition seule : la moyenne est la composition') as e04;
select is(public.grade_subject_average(10, 14, null, 'moyen'), 12::numeric,
  'devoirs sans composition : moyenne des devoirs') as e05;
select is(public.grade_subject_average(null, null, null, 'moyen'), null::numeric,
  'aucune note : la moyenne est nulle') as e06;
select is(public.grade_subject_average(10, 11, null, 'moyen'), 10.5::numeric,
  'arrondi à 2 décimales') as e07;

-- ===========================================================================
-- 2. Moyenne générale pondérée (weighted_average)
-- ===========================================================================
select is(public.weighted_average(array[10::numeric, 14::numeric], array[1::numeric, 3::numeric]), 13::numeric,
  'moyenne pondérée par les coefficients') as e08;
select is(public.weighted_average(array[10::numeric, null::numeric], array[1::numeric, 5::numeric]), 10::numeric,
  'une matière sans note est ignorée (coefficient non compté)') as e09;
select is(public.weighted_average(array[null::numeric, null::numeric], array[1::numeric, 2::numeric]), null::numeric,
  'aucune note : la moyenne générale est nulle') as e10;
select is(public.weighted_average(array[10::numeric], array[0::numeric]), null::numeric,
  'coefficient 0 : pas de division par zéro') as e11;
select is(pg_temp.pg_temp_is_error(), true, 'tailles différentes : erreur explicite') as e12;

-- ===========================================================================
-- 3. Appréciations : seuils exacts
-- ===========================================================================
select is(public.appreciation_for(16), 'Excellent', 'seuil 16 : Excellent') as e13;
select is(public.appreciation_for(15.99), 'Très bien', 'juste sous 16 : Très bien') as e14;
select is(public.appreciation_for(14), 'Très bien', 'seuil 14 : Très bien') as e15;
select is(public.appreciation_for(12), 'Bien', 'seuil 12 : Bien') as e16;
select is(public.appreciation_for(10), 'Assez bien', 'seuil 10 : Assez bien') as e17;
select is(public.appreciation_for(8), 'Passable', 'seuil 8 : Passable') as e18;
select is(public.appreciation_for(5), 'Insuffisant', 'seuil 5 : Insuffisant') as e19;
select is(public.appreciation_for(4.99), 'Très faible', 'sous 5 : Très faible') as e20;
select is(public.appreciation_for(null), '—', 'sans note : tiret') as e21;

-- ===========================================================================
-- 4. Statut d'une échéance (payment_status_of)
--    Référence : utils/payments.ts computeStatus()
-- ===========================================================================
select is(public.payment_status_of(20000, 20000, current_date, current_date), 'paye'::app_payment_status,
  'soldé : paye') as e22;
select is(public.payment_status_of(20000, 5000, current_date, current_date), 'partiel'::app_payment_status,
  'partiel : partiel') as e23;
select is(public.payment_status_of(20000, 0, current_date, current_date), 'en_retard'::app_payment_status,
  'échue et non payée : en_retard') as e24;
select is(public.payment_status_of(20000, 0, current_date + 1, current_date), 'a_venir'::app_payment_status,
  'à venir : a_venir') as e25;

-- ===========================================================================
-- 5. Statut d'abonnement (subscription_status_of)
--    Référence : utils/subscription.ts computeSubscriptionInfo()
-- ===========================================================================
select is(public.subscription_status_of('99999999-0000-0000-0000-0000000000ff', current_date + 30, current_date), 'ACTIF'::text,
  'J+30 : ACTIF') as e26;
-- Depuis 00021 : toute échéance dépassée est EXPIRE ; la fenêtre de
-- lecture seule de 7 jours est portée par school_is_readable / subscription_info.
select is(public.subscription_status_of('99999999-0000-0000-0000-0000000000ff', current_date + 7, current_date), 'EXPIRE'::text,
  'J+7 : EXPIRE (lecture seule gérée par subscription_info)') as e27;
select is(public.subscription_status_of('99999999-0000-0000-0000-0000000000ff', current_date + 8, current_date), 'ACTIF'::text,
  'J+8 : ACTIF') as e28;
select is(public.subscription_status_of('99999999-0000-0000-0000-0000000000ff', current_date, current_date), 'ACTIF'::text,
  'J0 : ACTIF (échéance aujourd''hui incluse)') as e29;
select is(public.subscription_status_of('99999999-0000-0000-0000-0000000000ff', current_date - 1, current_date), 'EXPIRE'::text,
  'J+1 : EXPIRE') as e30;
select is(public.subscription_status_of('99999999-0000-0000-0000-0000000000ff', null, current_date), 'AUCUN'::text,
  'pas d''échéance : AUCUN') as e31;

-- ===========================================================================
-- 6. Fenêtre lecture seule puis blocage (subscription_info)
-- ===========================================================================
select is((select (si).read_only from public.subscription_info('99999999-0000-0000-0000-0000000000ff') si), false,
  'école inconnue : pas de lecture seule forcée') as e32;

-- ===========================================================================
-- 7. Matricule élève : séquence par école et par année, sans trou
-- ===========================================================================
create or replace function pg_temp.temp_seq() returns text
language plpgsql volatile as $$
declare r text;
begin
  r := public.next_student_matricule('aaaaaa11-0000-0000-0000-0000000000a1', '2026-2027');
  return r;
end;
$$;
select is(pg_temp.temp_seq(), 'EC260001'::text, 'premier matricule de l''année : EC260001') as e33;
select is(pg_temp.temp_seq(), 'EC260002'::text, 'matricule suivant : EC260002 (pas de trou)') as e34;
select is(public.next_student_matricule('bbbbbb22-0000-0000-0000-0000000000b1', '2026-2027'), 'EC260001'::text,
  'la séquence est propre à chaque école') as e35;
select is(public.next_student_matricule('aaaaaa11-0000-0000-0000-0000000000a1', '2027-2028'), 'EC270001'::text,
  'la séquence repart à 1 pour une nouvelle année scolaire') as e36;

-- ===========================================================================
-- 8. Bornes des notes : 0 et 20 acceptés, 20,01 et -0,01 refusés
-- ===========================================================================
select is(pg_temp.pg_temp_is_error($$insert into public.grades (school_id, student_id, class_id, subject_id, period, composition) values ('aaaaaa11-0000-0000-0000-0000000000a1','eeeeee55-0000-0000-0000-0000000000a1','aaaaaa11-0000-0000-0000-0000000000ca','cccccc33-0000-0000-0000-0000000000aa','S1',20.01)$$), true,
  'la note 20,01 est refusée par la contrainte') as e37;
select is(pg_temp.pg_temp_is_error($$insert into public.grades (school_id, student_id, class_id, subject_id, period, composition) values ('aaaaaa11-0000-0000-0000-0000000000a1','eeeeee55-0000-0000-0000-0000000000a1','aaaaaa11-0000-0000-0000-0000000000ca','cccccc33-0000-0000-0000-0000000000aa','S1',-0.01)$$), true,
  'la note -0,01 est refusée par la contrainte') as e38;
select is(pg_temp.pg_temp_is_error($$insert into public.grades (school_id, student_id, class_id, subject_id, period, composition) values ('aaaaaa11-0000-0000-0000-0000000000a1','eeeeee55-0000-0000-0000-0000000000a1','aaaaaa11-0000-0000-0000-0000000000ca','cccccc33-0000-0000-0000-0000000000aa','S1',20)$$), false,
  'la note 20 est acceptée') as e39;

select * from finish();
rollback;
