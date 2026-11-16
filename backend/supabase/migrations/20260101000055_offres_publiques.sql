-- ============================================================================
-- 00055 — Offres publiques : Découverte, Premium (par élève), Groupe scolaire.
--
-- Le catalogue en base ne correspondait plus aux offres publiées sur le site :
--   * « Pro » (30 000 FCFA/mois), « Premium » (50 000 FCFA/mois) et
--     « Illimité » (90 000 FCFA/mois) n'existaient pas ;
--   * la seule offre payante réelle est facturée PAR ÉLÈVE
--     (500 FCFA par élève et par mois, élèves illimités) ;
--   * le « Groupe scolaire » (réseau d'établissements) est établi SUR DEVIS.
--
-- Cette migration :
--   1. ajoute à public.plans : price_per_student, on_quote, sort_order ;
--   2. réaligne les trois formules sur les offres du site (prix, libellés,
--     fonctionnalités, ordre d'affichage) ;
--   3. fusionne l'ancienne formule « pro » dans « premium » (abonnements,
--     demandes d'activation, écoles, journal) puis la supprime ;
--   4. recalcule les montants côté serveur : prix par élève × effectif
--     (× 10 mois pour un règlement annuel, 2 mois offerts) et refus des
--     formules sur devis ;
--   5. corrige l'inscription directeur : une formule facturée par élève n'est
--     plus considérée comme gratuite (elle exige un encaissement) ;
--   6. autorise l'événement d'abonnement « requested » (inscription d'une
--     formule payante) que le contrainte d'origine interdisait.
--
-- Idempotente : peut être rejouée sans erreur.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colonnes tarifaires du catalogue
-- ----------------------------------------------------------------------------
alter table public.plans
  add column if not exists price_per_student int not null default 0 check (price_per_student >= 0),
  add column if not exists on_quote boolean not null default false,
  add column if not exists sort_order int not null default 0;

comment on column public.plans.price_per_student is
  'Tarif mensuel par élève (0 = forfait mensuel) : Premium = 500 FCFA par élève et par mois.';
comment on column public.plans.on_quote is
  'Formule établie sur devis (Groupe scolaire) : aucun montant public.';
comment on column public.plans.sort_order is
  'Ordre d''affichage des formules (1 = Découverte, 2 = Premium, 3 = Groupe scolaire).';

-- ----------------------------------------------------------------------------
-- 2. Fusion de « pro » dans « premium » (avant suppression de la ligne)
-- ----------------------------------------------------------------------------
update public.subscriptions        set plan_id = 'premium' where plan_id = 'pro';
update public.subscription_requests set plan_id = 'premium' where plan_id = 'pro';
update public.schools              set requested_plan = 'premium' where requested_plan = 'pro';
update public.subscription_events  set plan_id = 'premium' where plan_id = 'pro';

delete from public.plans where id = 'pro';

-- Le domaine app_plan_id n'autorise plus que les trois formules réelles.
-- Contrôle préalable : aucune référence à « pro » ne doit subsister.
do $$
declare
  v_left int;
begin
  select count(*) into v_left
  from (
    select plan_id::text as v from public.subscriptions where plan_id::text = 'pro'
    union all
    select plan_id::text from public.subscription_events where plan_id::text = 'pro'
    union all
    select plan_id::text from public.subscription_requests where plan_id::text = 'pro'
    union all
    select requested_plan::text from public.schools where requested_plan::text = 'pro'
  ) t;
  if v_left > 0 then
    raise exception 'Des references a la formule pro subsistent : migration annulee.';
  end if;
end;
$$;

alter domain public.app_plan_id drop constraint if exists app_plan_id_check;

alter domain public.app_plan_id
  add constraint app_plan_id_check
  check (value in ('essentiel', 'premium', 'illimite'));

comment on domain public.app_plan_id is
  'Identifiants des formules d''abonnement : Decouverte, Premium, Groupe scolaire.';

-- ----------------------------------------------------------------------------
-- 3. Catalogue réel des formules
-- ----------------------------------------------------------------------------
insert into public.plans
  (id, name, tagline, student_limit, monthly_price, yearly_price,
   price_per_student, on_quote, sort_order, features, highlight)
values
  ('essentiel', 'Découverte', 'Pour démarrer une école', 100, 0, 0, 0, false, 1,
   array['Jusqu''à 100 élèves',
         'Classes, notes et bulletins automatiques',
         'Espace parents',
         'Création d''accès du personnel',
         'Support par WhatsApp'],
   false),
  ('premium', 'Premium', 'La formule la plus choisie', null, 0, 0, 500, false, 2,
   array['Élèves illimités',
         'Tous les modules du plan Découverte',
         'Paiements Wave / Orange Money / Free Money',
         'Affectations et emplois du temps',
         'Rappels automatiques des impayés',
         'Comptes économe, secrétaire et surveillant inclus',
         'Export des données et rapports',
         'Accompagnement dédié'],
   true),
  ('illimite', 'Groupe scolaire', 'Réseaux d''écoles', null, 0, 0, 0, true, 3,
   array['Plusieurs établissements',
         'Tableau de bord consolidé',
         'Formation sur site',
         'Intégrations sur mesure',
         'Gestionnaire de compte dédié'],
   false)
on conflict (id) do update set
  name             = excluded.name,
  tagline          = excluded.tagline,
  student_limit    = excluded.student_limit,
  monthly_price    = excluded.monthly_price,
  yearly_price     = excluded.yearly_price,
  price_per_student = excluded.price_per_student,
  on_quote         = excluded.on_quote,
  sort_order       = excluded.sort_order,
  features         = excluded.features,
  highlight        = excluded.highlight;

-- ----------------------------------------------------------------------------
-- 4. Demande d'activation : montant recalculé côté serveur (par élève)
-- ----------------------------------------------------------------------------
create or replace function public.request_subscription_activation(
  p_plan_id      text,
  p_cycle        text,
  p_student_count int
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_profile    record;
  v_plan       record;
  v_request_id uuid;
  v_request    record;
  v_amount     int;
  v_months     int;
begin
  perform public.assert_active_account();

  select * into v_profile from public.profiles where id = auth.uid();
  if not found
     or v_profile.role <> 'directeur'
     or v_profile.school_id is null then
    raise exception 'Action reservee a la direction de l''ecole.';
  end if;

  if p_student_count is null or p_student_count < 1 or p_student_count > 100000 then
    raise exception 'Effectif invalide.';
  end if;
  if p_cycle is null or p_cycle not in ('monthly', 'yearly') then
    raise exception 'Cycle invalide (monthly ou yearly).';
  end if;

  select * into v_plan from public.plans where id::text = p_plan_id;
  if not found then
    raise exception 'Formule introuvable.';
  end if;
  -- Une formule sur devis n'a pas de montant calculable : elle passe par le support.
  if coalesce(v_plan.on_quote, false) then
    raise exception 'Cette formule est etablie sur devis : contactez le support.';
  end if;
  if v_plan.student_limit is not null and p_student_count > v_plan.student_limit then
    raise exception 'La formule % est limitee a % eleves.', v_plan.name, v_plan.student_limit;
  end if;

  if exists (
    select 1 from public.subscriptions s
    where s.school_id = v_profile.school_id
      and s.ends_at >= current_date
  ) then
    raise exception 'Votre ecole dispose deja d''un abonnement actif.';
  end if;

  -- Règlement annuel : 10 mois facturés (2 mois offerts).
  v_months := case when p_cycle = 'yearly' then 10 else 1 end;

  -- Formule facturée par élève (Premium) ou forfait mensuel.
  if coalesce(v_plan.price_per_student, 0) > 0 then
    v_amount := v_plan.price_per_student * p_student_count * v_months;
  else
    v_amount := case when p_cycle = 'yearly' then v_plan.yearly_price else v_plan.monthly_price end;
  end if;

  insert into public.subscription_requests
    (school_id, requested_by, plan_id, cycle, student_count, amount)
  values
    (v_profile.school_id, auth.uid(), v_plan.id, p_cycle, p_student_count, v_amount)
  on conflict (school_id) where status = 'EN_ATTENTE'
  do update set
    requested_by  = excluded.requested_by,
    plan_id       = excluded.plan_id,
    cycle         = excluded.cycle,
    student_count = excluded.student_count,
    amount        = excluded.amount,
    created_at    = now()
  returning id into v_request_id;

  select * into v_request from public.subscription_requests where id = v_request_id;

  insert into public.audit_log
    (school_id, actor_id, actor_role, action, entity, entity_id, payload)
  values
    (v_profile.school_id, auth.uid(), v_profile.role, 'subscription_requested',
     'subscription_requests', v_request_id,
     jsonb_build_object('plan', v_plan.id, 'cycle', p_cycle,
                        'student_count', p_student_count, 'amount', v_amount));

  return jsonb_build_object(
    'id', v_request.id,
    'school_id', v_request.school_id,
    'plan_id', v_request.plan_id,
    'cycle', v_request.cycle,
    'student_count', v_request.student_count,
    'amount', v_request.amount,
    'status', v_request.status,
    'created_at', v_request.created_at,
    'decided_at', v_request.decided_at
  );
end;
$$;

revoke execute on function public.request_subscription_activation(text, text, int)
  from public, anon;
grant execute on function public.request_subscription_activation(text, text, int)
  to authenticated, service_role;

comment on function public.request_subscription_activation(text, text, int)
  is 'Cree ou remplace la demande d''activation en attente de l''ecole du directeur connecte (montant recalcule : par eleve ou forfait).';

-- ----------------------------------------------------------------------------
-- 5. Activation manuelle par le support : montant par élève, refus du devis
-- ----------------------------------------------------------------------------
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
  v_students  int := 0;
  v_months    int;
  v_free      boolean := false;
  v_starts    date;
  v_ends      date;
  v_event     text;
  v_matricule text;
  v_ref       text;
  v_new       boolean := false;
  v_old_free  boolean := false;
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
  if coalesce(v_plan.on_quote, false) then
    raise exception 'Formule sur devis : le montant doit être saisi par le support après négociation.';
  end if;

  if p_cycle is null or p_cycle not in ('monthly', 'yearly') then
    raise exception 'Cycle invalide (monthly ou yearly).';
  end if;
  if coalesce(p_method, 'especes') not in ('wave', 'orange_money', 'free_money', 'especes') then
    raise exception 'Moyen de paiement invalide.';
  end if;
  v_method := coalesce(p_method, 'especes')::app_pay_method;

  -- Effectif de l'école : base de la facturation par élève.
  select count(*) into v_students from public.students where school_id = p_school_id;

  -- Formule gratuite = aucun tarif (ni forfait, ni par élève, ni sur devis).
  v_free := coalesce(v_plan.monthly_price, 0) = 0
            and coalesce(v_plan.yearly_price, 0) = 0
            and coalesce(v_plan.price_per_student, 0) = 0;

  -- Une formule gratuite est toujours accordée pour un an, quel que soit le
  -- cycle choisi dans la console.
  v_days := case
    when v_free then 365
    when p_cycle = 'yearly' then 365
    else 30
  end;

  -- Règlement annuel : 10 mois facturés (2 mois offerts).
  v_months := case when p_cycle = 'yearly' then 10 else 1 end;

  v_amount := coalesce(
    p_amount_paid,
    case
      when coalesce(v_plan.price_per_student, 0) > 0
        then v_plan.price_per_student * v_students * v_months
      when p_cycle = 'yearly' then v_plan.yearly_price
      else v_plan.monthly_price
    end
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
    v_old_free := coalesce(
      (select p.monthly_price = 0 and p.yearly_price = 0 and coalesce(p.price_per_student, 0) = 0
         from public.plans p where p.id = v_sub.plan_id),
      false
    );

    if v_free then
      -- (Re)mise à une formule gratuite : nouvelle année pleine.
      v_starts := current_date;
      v_ends   := current_date + v_days;
    elsif coalesce(v_sub.ends_at >= current_date, false) and not v_old_free then
      -- Renouvellement / changement de formule payante : cumul.
      v_starts := coalesce(v_sub.starts_at, current_date);
      v_ends   := v_sub.ends_at + v_days;
    else
      -- Passage d'une formule gratuite à une formule payante : le paiement
      -- démarre aujourd'hui, il n'achète pas l'année gratuite restante.
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
     v_starts, v_ends, jsonb_build_object('source', 'manual_activation', 'cycle', p_cycle,
                                          'students', v_students, 'months', v_months));

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
    'student_count', v_students,
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
  is 'Activation manuelle support : crée/prolonge l''abonnement (montant par élève), sans prolonger une période gratuite.';

-- ----------------------------------------------------------------------------
-- 6. Inscription directeur : une formule payante n'est plus « gratuite »
--
-- 00051 distinguait la formule gratuite (prix mensuel ET annuel à 0). Avec la
-- facturation par élève, Premium a un prix nul mais n'est pas gratuit : la
-- détection doit aussi regarder price_per_student.
-- ----------------------------------------------------------------------------
create or replace function public.finish_director_registration(
  p_user_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_school_name text,
  p_city text,
  p_address text,
  p_cycles text[],
  p_plan_id text default 'essentiel'
)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_school_id uuid;
  v_cycles_text text[];
  v_matricule text;
  v_plan record;
  v_days int;
  v_ends date;
  v_ref text;
  v_is_free boolean;
begin
  if p_user_id is null then
    raise exception 'Compte introuvable.';
  end if;
  if p_cycles is null or array_length(p_cycles, 1) = 0
     or not app_valid_cycles(p_cycles) then
    raise exception 'Sélectionnez au moins un cycle.';
  end if;
  if exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Un compte existe déjà avec cet e-mail.';
  end if;

  select * into v_plan
  from public.plans
  where id::text = coalesce(nullif(trim(p_plan_id), ''), 'essentiel');
  if not found then
    raise exception 'Formule d''abonnement inconnue.';
  end if;

  -- Seule la formule gratuite (aucun tarif : ni forfait, ni par élève) ouvre
  -- droit à l'année de découverte offerte. Toute formule payante exige un
  -- encaissement / une activation support avant toute écriture.
  v_is_free := coalesce(v_plan.monthly_price, 0) = 0
               and coalesce(v_plan.yearly_price, 0) = 0
               and coalesce(v_plan.price_per_student, 0) = 0;

  v_cycles_text := p_cycles;

  for attempt in 1..50 loop
    v_matricule := public.app_random_code(5);
    if not exists (select 1 from public.schools s where s.matricule = v_matricule) then
      exit;
    end if;
    if attempt = 50 then
      raise exception 'Impossible de générer un matricule unique, réessayez.';
    end if;
  end loop;

  insert into public.schools
    (name, city, address, phone, email, cycles, registration_open,
     auto_approve_students, matricule, requested_plan)
  values
    (trim(p_school_name), trim(p_city), trim(p_address), trim(p_phone), trim(p_email),
     v_cycles_text::app_cycle[], true, false, v_matricule, v_plan.id)
  returning id into v_school_id;

  insert into public.school_settings (school_id, school_year, period_type, current_period, annex_fees, sibling_discount)
  values (
    v_school_id,
    extract(year from now())::int::text || '-' || (extract(year from now())::int + 1)::text,
    'semestre', 'S1',
    '{"cantine": 10000, "transport": 15000, "tenue": 12000}'::jsonb,
    10
  );

  insert into public.level_fees (school_id, level_id, inscription, mensualite)
  select v_school_id, lf.level_id, lf.inscription, lf.mensualite
  from (values
    ('elementaire', 'ci',   30000, 20000), ('elementaire', 'cp',   30000, 20000),
    ('elementaire', 'ce1',  30000, 22500), ('elementaire', 'ce2',  30000, 25000),
    ('elementaire', 'cm1',  35000, 25000), ('elementaire', 'cm2',  35000, 27500),
    ('moyen',       '6e',   40000, 30000), ('moyen',       '5e',   40000, 30000),
    ('moyen',       '4e',   40000, 32500), ('moyen',       '3e',   45000, 35000),
    ('secondaire',  '2nde', 50000, 40000), ('secondaire',  '1ere', 50000, 42500),
    ('secondaire',  'tle',  55000, 45000)
  ) as lf(cycle, level_id, inscription, mensualite)
  where lf.cycle in (select unnest(v_cycles_text));

  -- Matières du curriculum sénégalais, filtrées selon les cycles choisis par l'école.
  insert into public.subjects (school_id, name, cycles)
  select v_school_id, s.name,
    (select array_agg(x)::app_cycle[] from (select unnest(s.cycles::text[]) intersect select unnest(v_cycles_text)) as t(x))
  from (values
    ('Français',                    array['elementaire','moyen','secondaire']),
    ('Mathématiques',               array['elementaire','moyen','secondaire']),
    ('Histoire et Géographie',      array['elementaire','moyen','secondaire']),
    ('Éducation physique et sportive', array['elementaire','moyen','secondaire']),
    ('Éveil scientifique',          array['elementaire']),
    ('Instruction civique',         array['elementaire']),
    ('Éducation artistique',        array['elementaire','moyen']),
    ('Langue nationale',            array['elementaire','moyen']),
    ('Arabe',                       array['elementaire','moyen','secondaire']),
    ('Éducation religieuse',        array['elementaire','moyen','secondaire']),
    ('Anglais',                     array['moyen','secondaire']),
    ('Sciences de la Vie et de la Terre', array['moyen','secondaire']),
    ('Sciences Physiques',          array['moyen','secondaire']),
    ('Éducation Civique et Morale', array['moyen','secondaire']),
    ('Technologie',                 array['moyen','secondaire']),
    ('Économie Familiale et Sociale', array['moyen']),
    ('Philosophie',                 array['secondaire']),
    ('Sciences Économiques et Sociales', array['secondaire']),
    ('Informatique',                array['secondaire'])
  ) as s(name, cycles)
  where exists (select 1 from unnest(s.cycles::text[]) c where c = any(v_cycles_text));

  insert into public.profiles (id, school_id, role, status, first_name, last_name, phone, email)
  values (p_user_id, v_school_id, 'directeur', 'ACTIF', trim(p_first_name), trim(p_last_name), trim(p_phone), trim(p_email));

  -- Année de découverte UNIQUEMENT pour la formule gratuite ; pour une
  -- formule payante, l'abonnement naît expiré (activation requise).
  if v_is_free then
    v_days := 365;
    v_ends := current_date + v_days;
  else
    v_days := 0;
    v_ends := current_date - 1;
  end if;
  v_ref := 'INSCRIPTION-' || v_matricule;

  insert into public.subscriptions
    (school_id, plan_id, starts_at, ends_at, student_limit, amount_paid, payment_ref, method, paid_at)
  values
    (v_school_id, v_plan.id, current_date, v_ends, v_plan.student_limit, 0, v_ref, null, now());

  insert into public.subscription_events
    (school_id, event_type, plan_id, amount_paid, payment_ref, method, starts_at, ends_at, payload)
  values
    (v_school_id, case when v_is_free then 'purchase' else 'requested' end, v_plan.id, 0, v_ref, null, current_date, v_ends,
     jsonb_build_object('source', 'registration', 'plan', v_plan.id, 'days', v_days, 'free_plan', v_is_free));

  insert into public.audit_log (school_id, actor_id, actor_role, action, entity, entity_id, payload)
  values (v_school_id, p_user_id, 'directeur', 'register_director', 'schools', v_school_id,
          jsonb_build_object('requested_plan', v_plan.id, 'subscription_ends_at', v_ends,
                             'amount_paid', 0, 'free_plan', v_is_free));

  return v_school_id;
end;
$$;

revoke execute on function public.finish_director_registration(uuid, text, text, text, text, text, text, text, text[], text)
  from public, anon, authenticated;
grant execute on function public.finish_director_registration(uuid, text, text, text, text, text, text, text, text[], text)
  to service_role;

comment on function public.finish_director_registration(uuid, text, text, text, text, text, text, text, text[], text)
  is 'Inscription directeur atomique. Année gratuite uniquement si la formule est gratuite (aucun tarif) ; sinon abonnement expiré à la création, activation requise.';

-- ----------------------------------------------------------------------------
-- 7. Événement « requested » (inscription d'une formule payante)
--
-- La contrainte d'origine n'autorisait que purchase / renewal / plan_change /
-- expiration_warning : l'inscription d'une formule payante échouait donc sur
-- l'insertion du journal.
-- ----------------------------------------------------------------------------
alter table public.subscription_events
  drop constraint if exists subscription_events_event_type_check;

alter table public.subscription_events
  add constraint subscription_events_event_type_check
  check (event_type in ('purchase', 'renewal', 'plan_change', 'expiration_warning', 'requested'));
