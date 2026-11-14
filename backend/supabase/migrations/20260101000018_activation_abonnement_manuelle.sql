-- ============================================================================
-- 00018 — Activation manuelle d'un abonnement et attribution du matricule.
--
-- Depuis 00016, le circuit paiement et `apply_paid_subscription` ont été
-- retirés. L'activation est désormais faite par le support. Cette RPC :
--   - est réservée à `service_role` ;
--   - valide la formule et le cycle dans `plans` ;
--   - crée ou prolonge l'abonnement (cumul sur une échéance active) ;
--   - attribue le matricule d'école au premier abonnement, puis le conserve ;
--   - journalise `subscription_events` et `audit_log`.
-- ============================================================================

create or replace function public.activate_school_subscription(
  p_school_id  uuid,
  p_plan_id    text,
  p_cycle      text,
  p_amount_paid int default null,
  p_payment_ref text default '',
  p_method     text default 'especes'
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_school    record;
  v_plan      record;
  v_sub       record;
  v_method    app_pay_method;
  v_days      int;
  v_amount    int;
  v_starts    date;
  v_ends      date;
  v_event     text;
  v_matricule text;
  v_ref       text;
  v_new       boolean := false;
begin
  if auth.role() is distinct from 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Activation réservée au support.';
  end if;

  select * into v_school from public.schools where id = p_school_id for update;
  if not found then
    raise exception 'École introuvable.';
  end if;

  select * into v_plan from public.plans where id::text = p_plan_id;
  if not found then
    raise exception 'Formule introuvable.';
  end if;

  if p_cycle is null or p_cycle not in ('monthly', 'yearly') then
    raise exception 'Cycle invalide (monthly ou yearly).';
  end if;
  if coalesce(p_method, 'especes') not in ('wave', 'orange_money', 'free_money', 'especes') then
    raise exception 'Moyen de paiement invalide.';
  end if;
  v_method := coalesce(p_method, 'especes')::app_pay_method;
  v_days := case when p_cycle = 'yearly' then 365 else 30 end;

  v_amount := coalesce(
    p_amount_paid,
    case when p_cycle = 'yearly' then v_plan.yearly_price else v_plan.monthly_price end
  );
  if v_amount < 0 then
    raise exception 'Montant invalide.';
  end if;

  v_ref := coalesce(
    nullif(trim(coalesce(p_payment_ref, '')), ''),
    'MANUAL-' || to_char(now(), 'YYYYMMDD-HH24MISS')
  );

  select * into v_sub from public.subscriptions where school_id = p_school_id for update;
  if found then
    if coalesce(v_sub.ends_at >= current_date, false) then
      v_starts := coalesce(v_sub.starts_at, current_date);
      v_ends   := v_sub.ends_at + v_days;
    else
      v_starts := current_date;
      v_ends   := current_date + v_days;
    end if;
    v_event := case when v_sub.plan_id = v_plan.id then 'renewal' else 'plan_change' end;
  else
    v_starts := current_date;
    v_ends   := current_date + v_days;
    v_event  := 'purchase';
    v_new    := true;
  end if;

  insert into public.subscriptions
    (school_id, plan_id, starts_at, ends_at, student_limit, amount_paid, payment_ref, method, paid_at)
  values
    (p_school_id, v_plan.id, v_starts, v_ends, v_plan.student_limit, v_amount, v_ref,
     v_method, now())
  on conflict (school_id) do update set
    plan_id       = excluded.plan_id,
    starts_at     = excluded.starts_at,
    ends_at       = excluded.ends_at,
    student_limit = excluded.student_limit,
    amount_paid   = excluded.amount_paid,
    payment_ref   = excluded.payment_ref,
    method        = excluded.method,
    paid_at       = excluded.paid_at;

  if v_school.matricule is null then
    v_matricule := public.generate_school_matricule();
    update public.schools set matricule = v_matricule where id = p_school_id;
  else
    v_matricule := v_school.matricule;
  end if;

  insert into public.subscription_events
    (school_id, event_type, plan_id, amount_paid, payment_ref, method, starts_at, ends_at, payload)
  values
    (p_school_id, v_event, v_plan.id, v_amount, v_ref, v_method,
     v_starts, v_ends, jsonb_build_object('source', 'manual_activation', 'cycle', p_cycle));

  insert into public.audit_log
    (school_id, actor_id, actor_role, action, entity, entity_id, payload)
  values
    (p_school_id, null, 'service_role', 'subscription_activated_manually', 'subscriptions', null,
     jsonb_build_object('plan', v_plan.id, 'cycle', p_cycle, 'amount', v_amount,
                        'payment_ref', v_ref, 'matricule_created', v_school.matricule is null));

  return jsonb_build_object(
    'school_id', p_school_id,
    'matricule', v_matricule,
    'matriculeCreated', v_school.matricule is null,
    'plan_id', v_plan.id,
    'plan_name', v_plan.name,
    'cycle', p_cycle,
    'amount_paid', v_amount,
    'payment_ref', v_ref,
    'method', v_method,
    'starts_at', v_starts,
    'ends_at', v_ends,
    'new_subscription', v_new
  );
end;
$$;

revoke execute on function public.activate_school_subscription(uuid, text, text, int, text, text)
  from public, anon, authenticated;
grant execute on function public.activate_school_subscription(uuid, text, text, int, text, text)
  to service_role;

comment on function public.activate_school_subscription(uuid, text, text, int, text, text)
  is 'Activation manuelle support : crée/prolonge l''abonnement et attribue le matricule d''école au premier achat.';
