-- ============================================================================
-- Migration 7 — Phase 4 : abonnements & paiements école.
--
-- Le client n'écrit JAMAIS dans subscriptions ni payment_transactions :
--  - start-subscription (direction) crée une transaction PENDING via le
--    service_role, prix et limite lus côté serveur dans public.plans ;
--  - payment-webhook (HMAC) appelle apply_paid_subscription, idempotent ;
--  - le matricule de l'école (5 caractères, alphabet sans 0/O/1/I) est attribué
--    au PREMIER paiement confirmé, puis ne change plus jamais ;
--  - ends_at est CUMULATIF : renouveler un abonnement encore actif repousse
--    l'échéance au lieu de la remplacer.
-- ============================================================================

-- Matricule d'école : 32 caractères sans 0/O/1/I, unique dans schools.matricule.
create or replace function public.generate_school_matricule()
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_code text;
begin
  for attempt in 1..50 loop
    v_code := public.app_random_code(5);
    if not exists (select 1 from public.schools s where s.matricule = v_code) then
      return v_code;
    end if;
  end loop;
  raise exception 'Impossible de générer un matricule unique, réessayez.';
end;
$$;

-- ----------------------------------------------------------------------------
-- APPLICATION IDEMPOTENTE d'un paiement CONFIRMÉ. Exécutée par le webhook
-- (service_role uniquement). La source de vérité du montant et de la formule
-- est la transaction PENDING créée par start-subscription, jamais le client.
-- Retourne un jsonb descriptif (identique pour un webhook rejoué).
-- ----------------------------------------------------------------------------
create or replace function public.apply_paid_subscription(
  p_provider     text,
  p_provider_ref text,
  p_status       text,                       -- 'succeeded' | 'failed'
  p_payload      jsonb default '{}'::jsonb   -- facultatif : complément provider
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_tx          record;
  v_school      record;
  v_plan        record;
  v_sub         record;
  v_result      jsonb;
  v_cycle       text;
  v_days        int;
  v_amount      int;
  v_event       text;
  v_starts      date;
  v_ends        date;
  v_matricule   text;
  v_created     boolean := false;
  v_new         boolean := false;
begin
  select * into v_tx from public.payment_transactions
  where provider = p_provider and provider_ref = p_provider_ref;
  if not found then
    raise exception 'Transaction inconnue.';
  end if;

  -- IDEMPOTENCE : déjà confirmée → on renvoie le même résultat.
  -- Le résultat est construit dans une variable jsonb dédiée : le renvoyer
  -- dans v_school (de type record / ligne schools) provoquait une erreur de
  -- cast au RETURN et le rejeu du webhook répondait 500.
  if v_tx.status = 'succeeded' then
    select * into v_sub from public.subscriptions where school_id = v_tx.school_id;
    select matricule into v_matricule from public.schools where id = v_tx.school_id;
    select jsonb_build_object(
      'idempotent', true,
      'matricule', v_matricule,
      'matriculeCreated', false,
      'plan_id', v_sub.plan_id,
      'amount', v_sub.amount_paid,
      'starts_at', v_sub.starts_at,
      'ends_at', v_sub.ends_at,
      'paid_at', v_sub.paid_at
    ) into v_result;
    return v_result;
  end if;

  if p_status <> 'succeeded' then
    update public.payment_transactions
    set status = 'failed', updated_at = now()
    where id = v_tx.id;
    insert into public.audit_log (school_id, actor_id, actor_role, action, entity, entity_id, payload)
    values (v_tx.school_id, null, 'service_role', 'subscription_payment_failed',
            'payment_transactions', v_tx.id, jsonb_build_object('provider', p_provider));
    return jsonb_build_object('status', 'failed', 'payment_ref', p_provider_ref);
  end if;

  select * into v_school from public.schools where id = v_tx.school_id;
  if not found then
    raise exception 'École introuvable.';
  end if;

  v_cycle  := v_tx.payload->>'cycle';
  v_amount := v_tx.amount;

  if v_cycle not in ('monthly', 'yearly') then
    raise exception 'Formule de facturation invalide.';
  end if;

  select * into v_plan from public.plans where id = v_tx.payload->>'plan_id';
  if not found then
    raise exception 'Formule d''abonnement introuvable.';
  end if;

  if v_amount <> (case when v_cycle = 'yearly' then v_plan.yearly_price else v_plan.monthly_price end) then
    raise exception 'Le montant payé ne correspond pas à la formule choisie.';
  end if;

  -- Marque la transaction (unique par (provider, provider_ref) : un seul état).
  update public.payment_transactions
  set status = 'succeeded', payload = v_tx.payload || coalesce(p_payload, '{}'), updated_at = now()
  where id = v_tx.id;

  v_days  := (case when v_cycle = 'yearly' then 365 else 30 end);
  select * into v_sub from public.subscriptions where school_id = v_school.id;

  if found then
    if v_sub.ends_at >= current_date then
      -- CUMULATIF : l'échéance active est repoussée de la durée achetée.
      v_ends   := v_sub.ends_at + v_days;
      v_starts := v_sub.starts_at;
    else
      -- L'abonnement était expiré : reprise au jour du paiement.
      v_ends   := current_date + v_days;
      v_starts := current_date;
    end if;
    if v_sub.plan_id = v_plan.id then
      v_event := 'renewal';
    else
      v_event := 'plan_change';
    end if;
  else
    v_ends   := current_date + v_days;
    v_starts := current_date;
    v_event  := 'purchase';
    v_new    := true;
  end if;

  if v_new then
    insert into public.subscriptions
      (school_id, plan_id, starts_at, ends_at, student_limit, amount_paid, payment_ref, method, paid_at)
    values
      (v_school.id, v_plan.id, v_starts, v_ends, v_plan.student_limit, v_amount, p_provider_ref, v_tx.method, now());
  else
    update public.subscriptions
    set plan_id       = v_plan.id,
        starts_at     = v_starts,
        ends_at       = v_ends,
        student_limit = v_plan.student_limit,
        amount_paid   = v_amount,
        payment_ref   = p_provider_ref,
        method        = v_tx.method,
        paid_at       = now()
    where school_id = v_school.id;
  end if;

  -- Matricule : attribué au PREMIER paiement confirmé, jamais après.
  if v_school.matricule is null then
    v_matricule := public.generate_school_matricule();
    update public.schools set matricule = v_matricule where id = v_school.id;
    v_created := true;
  else
    v_matricule := v_school.matricule;
  end if;

  insert into public.subscription_events
    (school_id, event_type, plan_id, amount_paid, payment_ref, method, starts_at, ends_at)
  values
    (v_school.id, v_event, v_plan.id, v_amount, p_provider_ref, v_tx.method, v_starts, v_ends);

  insert into public.audit_log (school_id, actor_id, actor_role, action, entity, entity_id, payload)
  values (v_school.id, null, 'service_role',
          case when v_new then 'subscription_purchased' else 'subscription_renewed' end,
          'subscriptions', null,
          jsonb_build_object('plan', v_plan.id, 'amount', v_amount, 'cycle', v_cycle));

  return jsonb_build_object(
    'idempotent', false,
    'matricule', v_matricule,
    'matriculeCreated', v_created,
    'plan_id', v_plan.id,
    'plan_name', v_plan.name,
    'amount', v_amount,
    'method', v_tx.method,
    'starts_at', v_starts,
    'ends_at', v_ends,
    'paid_at', now()
  );
end;
$$;

revoke execute on function public.apply_paid_subscription(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_paid_subscription(text, text, text, jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- Vérification publique du matricule (formulaire d'inscription).
-- Contrôles et messages identiques à schoolService.verifyMatricule :
-- format → introuvable → blocked → EXPIRE → inscriptions fermées → ok.
-- ----------------------------------------------------------------------------
create or replace function public.verify_matricule(p_matricule text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_code text;
  v_school record;
  v_info public.subscription_info_result;
begin
  -- Nettoyage identique à formatMatriculeInput : majuscules,
  -- espaces/tirets retirés, caractères ambigus supprimés.
  v_code := regexp_replace(upper(coalesce(p_matricule, '')), '[^A-Z0-9]', '', 'g');
  v_code := translate(v_code, '01OI', '');
  if length(v_code) <> 5
     or regexp_replace(v_code, '[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]', '', 'g') <> '' then
    return jsonb_build_object(
      'ok', false, 'reason', 'format',
      'message', 'Le matricule comporte 5 caractères (lettres et chiffres, sans 0 ni O). Exemple : X7K9Q.'
    );
  end if;

  select * into v_school from public.schools where matricule = v_code;
  if not found then
    return jsonb_build_object(
      'ok', false, 'reason', 'introuvable',
      'message', 'Matricule introuvable. Vérifiez auprès de votre école.'
    );
  end if;

  v_info := public.subscription_info(v_school.id);

  if v_info.blocked then
    return jsonb_build_object(
      'ok', false, 'reason', 'abonnement_bloque',
      'message', format('%s n''accepte plus de nouvelles inscriptions. Contactez l''école pour plus d''informations.', v_school.name),
      'school', jsonb_build_object('id', v_school.id, 'name', v_school.name, 'city', v_school.city,
                                   'logo_url', v_school.logo_url, 'cycles', v_school.cycles,
                                   'registration_open', v_school.registration_open)
    );
  end if;

  if v_info.status = 'EXPIRE' then
    return jsonb_build_object(
      'ok', false, 'reason', 'abonnement_expire',
      'message', format('%s n''accepte pas de nouvelles inscriptions pour le moment. Contactez l''école.', v_school.name),
      'school', jsonb_build_object('id', v_school.id, 'name', v_school.name, 'city', v_school.city,
                                   'logo_url', v_school.logo_url, 'cycles', v_school.cycles,
                                   'registration_open', v_school.registration_open)
    );
  end if;

  if not v_school.registration_open then
    return jsonb_build_object(
      'ok', false, 'reason', 'inscriptions_fermees',
      'message', format('Les inscriptions sont temporairement fermées à %s. Contactez l''école pour connaître la date de réouverture.', v_school.name),
      'school', jsonb_build_object('id', v_school.id, 'name', v_school.name, 'city', v_school.city,
                                   'logo_url', v_school.logo_url, 'cycles', v_school.cycles,
                                   'registration_open', false)
    );
  end if;

  return jsonb_build_object(
    'ok', true, 'reason', null, 'message', null,
    'school', jsonb_build_object('id', v_school.id, 'name', v_school.name, 'city', v_school.city,
                                 'logo_url', v_school.logo_url, 'cycles', v_school.cycles,
                                 'registration_open', v_school.registration_open,
                                 'auto_approve_students', v_school.auto_approve_students)
  );
end;
$$;

revoke execute on function public.generate_school_matricule() from anon, public;
grant execute on function public.generate_school_matricule() to authenticated;

revoke execute on function public.verify_matricule(text) from public;
-- anon est explicitement autorisé (fonction stable, lecture seule) : le
-- formulaire d'inscription appelle cette vérification sans session. Le
-- service_role l'utilise aussi via verify-matricule.
grant execute on function public.verify_matricule(text) to anon, authenticated, service_role;
comment on table public.payment_transactions is
  'Registre des tentatives de paiement. Ecriture par service_role uniquement (start-subscription / payment-webhook).';