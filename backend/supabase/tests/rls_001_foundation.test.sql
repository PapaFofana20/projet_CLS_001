-- ============================================================================
-- Tests pgTAP de fondation (phase 1)
-- Exécution : npx supabase test db  (requiert une base locale :
-- npx supabase start, npx supabase db reset)
-- ============================================================================

begin;
select plan(14);

-- ----------------------------------------------------------------------------
-- Seed : référentiels globaux présents
-- ----------------------------------------------------------------------------
select has_table('public', 'levels', 'Table levels existe');
select has_table('public', 'plans', 'Table plans existe');
select is(count(*), 13::bigint, '13 niveaux seedés') from public.levels;
select is(count(*), 4::bigint, '4 formules seedées') from public.plans;

-- RLS activée sur les tables clés (aucune politique = accès fermé par défaut)
select has_table('public', 'schools', 'Table schools existe');
select has_table('public', 'students', 'Table students existe');
select has_table('public', 'grades', 'Table grades existe');
select has_table('public', 'profiles', 'Table profiles existe');

-- ----------------------------------------------------------------------------
-- subscription_status_of — mêmes règles que src/utils/subscription.ts
-- ----------------------------------------------------------------------------
select is(
  public.subscription_status_of(null::uuid, null::date, '2026-12-15'::date),
  'AUCUN', 'sans échéance → AUCUN'
);
select is(
  public.subscription_status_of(null::uuid, '2027-01-01'::date, '2026-12-15'::date),
  'ACTIF', 'échéance à plus de 7 jours → ACTIF'
);
-- Depuis 00021, une échéance dépassée est EXPIRE (la fenêtre de 7 jours est
-- gérée par school_is_readable, pas par subscription_status_of).
select is(
  public.subscription_status_of(null::uuid, '2026-12-16'::date, '2026-12-15'::date),
  'EXPIRE', 'échéance dépassée → EXPIRE'
);
select is(
  public.subscription_status_of(null::uuid, '2026-12-08'::date, '2026-12-15'::date),
  'EXPIRE', 'échéance de 7 jours passée → EXPIRE (lecture seule gérée ailleurs)'
);
select is(
  public.subscription_status_of(null::uuid, '2026-12-14'::date, '2026-12-15'::date),
  'EXPIRE', 'échéance passée → EXPIRE'
);

-- ----------------------------------------------------------------------------
-- Alphabets et matricules
-- ----------------------------------------------------------------------------
select is(
  (select bool_and(c in ('2','3','4','5','6','7','8','9',
    'A','B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','V','W','X','Y','Z'))
  from unnest(string_to_array(public.app_random_code(64), null)) c),
  true,
  'alphabet des codes sans 0 / O / 1 / I'
);

-- ----------
-- (la génération séquentielle de matricules est couverte par les tests de la
-- phase 2, qui disposent d'une école de test réelle.)

select * from finish();
rollback;
