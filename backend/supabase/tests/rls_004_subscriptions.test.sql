-- ============================================================================
-- Tests pgTAP — Phase 4 : abonnements (schéma courant, post-00055).
--
-- Les anciens tests (payment_transactions, apply_paid_subscription,
-- verify_matricule par anon, formule « pro ») décrivaient un schéma supprimé
-- en 00016 / 00043 / 00055. Ils sont remplacés par les garanties réelles :
-- catalogue d'offres, domaine app_plan_id et surfaces RPC exposées.
-- Exécution : npx supabase test db  (base locale requise)
-- ============================================================================

begin;
select plan(13);

-- ----------------------------------------------------------------------------
-- Catalogue public (00055) : trois offres, plus de « pro ».
-- ----------------------------------------------------------------------------
select is(count(*), 3::bigint, 'trois formules publiées') from public.plans;
select is(
  (select count(*) from public.plans where id = 'essentiel'),
  1::bigint, 'formule Découverte (essentiel) présente'
);
select is(
  (select count(*) from public.plans where id = 'premium'),
  1::bigint, 'formule Premium présente'
);
select is(
  (select count(*) from public.plans where id = 'illimite'),
  1::bigint, 'formule Groupe scolaire (illimite) présente'
);
select is(
  (select count(*) from public.plans where id = 'pro'),
  0::bigint, 'ancienne formule « pro » supprimée'
);
select is(
  (select price_per_student from public.plans where id = 'premium'),
  500, 'Premium est facturé 500 FCFA par élève et par mois'
);
select is(
  (select coalesce(on_quote, false) from public.plans where id = 'illimite'),
  true, 'Groupe scolaire est une offre sur devis'
);
select is(
  (select student_limit from public.plans where id = 'essentiel'),
  100, 'Découverte est limitée à 100 élèves'
);

-- Le domaine n'accepte plus « pro ».
select throws_ok(
  $$insert into public.plans (id, name, monthly_price, yearly_price)
    values ('pro', 'Ancienne offre', 1, 1)$$,
  '23514', null, 'le domaine refuse l''ancien identifiant pro'
);

-- ----------------------------------------------------------------------------
-- Surfaces RPC : les fonctions SECURITY DEFINER sensibles ne sont pas
-- exécutables par anon ; open_classes reste la seule surface publique.
-- ----------------------------------------------------------------------------
select is(
  has_function_privilege('anon'::regrole, 'public.open_classes(uuid, text)', 'execute'),
  true, 'open_classes reste callable par anon (page /inscription)'
);
select is(
  has_function_privilege('anon'::regrole, 'public.subscription_info(uuid)', 'execute'),
  false, 'anon ne lit pas subscription_info'
);
select is(
  has_function_privilege('anon'::regrole, 'public.complete_password_change()', 'execute'),
  false, 'anon ne peut pas appeler complete_password_change'
);
select is(
  has_function_privilege('anon'::regrole, 'public.request_subscription_activation(text, text, int)', 'execute'),
  false, 'anon ne peut pas demander d''activation'
);

select * from finish();
rollback;
