-- ============================================================================
-- 00046 — Statut de paiement manuel par échéance (fiche élève).
--
-- Sur la fiche d'un élève (onglet Paiements), la direction / l'économe peut
-- choisir pour chaque mois : « À venir » (par défaut), « Payé » ou « Impayé ».
-- Le statut automatique (paye / partiel / en_retard / a_venir, trigger
-- trg_set_payment_status) reste le comportement par défaut quand aucun choix
-- manuel n'existe. Le choix manuel est stocké dans payments.manual_status et
-- le trigger le traduit vers l'enum existant (impaye -> en_retard) pour ne
-- pas casser les requêtes existantes.
--
-- Cohérence des montants :
--   - « Payé »   -> paid_amount = amount (encaissement espèces), paid_at posé.
--   - « Impayé » / « À venir » -> paid_amount = 0, paid_at annulé.
-- Un encaissement espèces ultérieur (record_cash_payment) efface le choix
-- manuel pour retrouver le calcul automatique (partiel / payé).
-- ============================================================================

alter table public.payments
  add column if not exists manual_status text
  check (manual_status in ('a_venir', 'paye', 'impaye'));

-- Le trigger respecte le choix manuel quand il existe.
create or replace function public.set_payment_status() returns trigger
language plpgsql volatile as $$
begin
  if new.manual_status = 'paye' then
    new.status := 'paye'::app_payment_status;
  elsif new.manual_status = 'impaye' then
    new.status := 'en_retard'::app_payment_status;
  elsif new.manual_status = 'a_venir' then
    new.status := 'a_venir'::app_payment_status;
  else
    new.status := public.payment_status_of(new.amount, new.paid_amount, new.due_date);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_payment_status on public.payments;
create trigger trg_set_payment_status
  before insert or update on public.payments
  for each row execute function public.set_payment_status();

-- ----------------------------------------------------------------------------
-- Un encaissement espèces efface le choix manuel : le statut redevient calculé.
-- (Logique reprise de record_cash_payment_unchecked, migration 00009 / 00017.)
-- ----------------------------------------------------------------------------
create or replace function public.record_cash_payment_unchecked(p_payment_id uuid, p_amount int)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_school uuid := public.current_school_id();
  v_role text := public.current_role();
  v_p public.payments%rowtype;
  v_added int;
  v_ref text;
begin
  if v_role not in ('directeur','econome') then
    raise exception 'Seuls l''économe et la direction encaissent les espèces.';
  end if;
  if not public.school_is_writable(v_school) then
    raise exception 'Mode lecture seule : l''abonnement de votre école est expiré. Les modifications sont désactivées.';
  end if;
  select * into v_p from public.payments
  where id = p_payment_id and school_id = v_school;
  if not found then
    raise exception 'Échéance introuvable.';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > v_p.amount - v_p.paid_amount then
    raise exception 'Montant invalide.';
  end if;

  v_added := least(p_amount, v_p.amount - v_p.paid_amount);
  v_ref := 'EC-' || (100000 + floor(random() * 900000))::int::text;
  update public.payments
  set paid_amount = least(v_p.amount, v_p.paid_amount + v_added),
      method = 'especes',
      paid_at = now(),
      manual_status = null,
      reference = coalesce(v_p.reference, v_ref)
  where id = p_payment_id;

  insert into public.audit_log (school_id, actor_id, actor_role, action, entity, entity_id, payload)
  values (v_school, auth.uid(), v_role, 'payment_recorded_cash', 'payments', p_payment_id,
          jsonb_build_object('amount', v_added, 'reference', v_ref));

  select * into v_p from public.payments where id = p_payment_id;
  return jsonb_build_object(
    'payment_id', p_payment_id,
    'paid_amount', v_p.paid_amount,
    'status', v_p.status,
    'reference', v_ref
  );
end;
$$;

revoke execute on function public.record_cash_payment_unchecked(uuid, int)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Choix manuel du statut d'une échéance (directeur / économe).
-- ----------------------------------------------------------------------------
create or replace function public.set_payment_manual_status_unchecked(p_payment_id uuid, p_manual_status text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_school uuid := public.current_school_id();
  v_role text := public.current_role();
  v_p public.payments%rowtype;
  v_ref text;
begin
  if v_role not in ('directeur','econome') then
    raise exception 'Seuls l''économe et la direction modifient le statut de paiement.';
  end if;
  if not public.school_is_writable(v_school) then
    raise exception 'Mode lecture seule : l''abonnement de votre école est expiré. Les modifications sont désactivées.';
  end if;
  if p_manual_status not in ('a_venir', 'paye', 'impaye') then
    raise exception 'Statut invalide.';
  end if;
  select * into v_p from public.payments
  where id = p_payment_id and school_id = v_school;
  if not found then
    raise exception 'Échéance introuvable.';
  end if;

  if p_manual_status = 'paye' then
    v_ref := coalesce(v_p.reference, 'EC-' || (100000 + floor(random() * 900000))::int::text);
    update public.payments
    set manual_status = 'paye',
        paid_amount = amount,
        method = coalesce(method, 'especes'),
        paid_at = coalesce(paid_at, now()),
        reference = v_ref
    where id = p_payment_id;
  else
    -- 'impaye' ou 'a_venir' : rien n'a été encaissé pour cette échéance.
    update public.payments
    set manual_status = p_manual_status,
        paid_amount = 0,
        method = null,
        paid_at = null
    where id = p_payment_id;
  end if;

  insert into public.audit_log (school_id, actor_id, actor_role, action, entity, entity_id, payload)
  values (v_school, auth.uid(), v_role, 'payment_manual_status', 'payments', p_payment_id,
          jsonb_build_object('manual_status', p_manual_status, 'label', v_p.label));

  select * into v_p from public.payments where id = p_payment_id;
  return jsonb_build_object(
    'payment_id', p_payment_id,
    'manual_status', v_p.manual_status,
    'paid_amount', v_p.paid_amount,
    'status', v_p.status
  );
end;
$$;

revoke execute on function public.set_payment_manual_status_unchecked(uuid, text)
  from public, anon, authenticated;

create or replace function public.set_payment_manual_status(p_payment_id uuid, p_manual_status text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.assert_active_account();
  return public.set_payment_manual_status_unchecked(p_payment_id, p_manual_status);
end;
$$;

revoke execute on function public.set_payment_manual_status(uuid, text) from anon, public;
grant execute on function public.set_payment_manual_status(uuid, text) to authenticated;
