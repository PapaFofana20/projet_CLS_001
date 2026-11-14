-- 00016 — Retrait temporaire du paiement (Wave / Orange Money / Free).
--
-- Les échéances de scolarité restent gérées (suivi des soldes + saisie
-- manuelle des espèces par l'économe via `record_cash_payment`). Ce qui est
-- retiré ici, c'est uniquement le circuit de paiement EN LIGNE :
--
--   - `payment_transactions` : registre des tentatives de paiement (plus
--     aucun flux ne l'écrit ni ne le lit) ;
--   - `start_installment_payments` : initiation d'un paiement d'échéances par
--     la famille (appelle le prestataire) ;
--   - `apply_paid_installment` / `apply_paid_subscription` : application d'une
--     confirmation prestataire (webhook signé, supprimé) ;
--   - `new_payment_reference` : génération de références prestataires.
--
-- L'ACTIVATION D'ABONNEMENT devient manuelle : le support insère la ligne
-- `subscriptions` directement (SQL Editor, rôle service_role), ex. :
--
--   insert into public.subscriptions (school_id, plan, cycle, amount, paid_at, ends_at)
--   values ('<uuid école>', 'staffroom', 'yearly', 84000, now(), now() + interval '1 year');
--
-- Les tables de domaine (payments, scolarité, plans, subscriptions) restent.

drop function if exists public.apply_paid_subscription(text, text, text, jsonb);
drop function if exists public.apply_paid_installment(text, text, text, jsonb);
drop function if exists public.start_installment_payments(uuid[], text, text);
drop function if exists public.new_payment_reference(text);

drop table if exists public.payment_transactions;
