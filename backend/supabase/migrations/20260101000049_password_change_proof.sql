-- ============================================================================
-- 00049 — Preuve réelle de changement de mot de passe (audit strict, 08/11/2026).
--
-- complete_password_change() (00038) levait le drapeau must_change_password
-- sans aucune preuve : tout compte authenticated pouvait le lever sans avoir
-- changé son mot de passe (le mot de passe temporaire, connu de la direction,
-- restait valide).
--
-- Correction — la preuve est mécanique, pas déclarative :
--   1. Un trigger sur auth.users (AFTER UPDATE OF encrypted_password) lève
--      le drapeau dès que le mot de passe change réellement côté Supabase
--      Auth. Aucune RPC ne peut le lever sans changement effectif.
--   2. complete_password_change() exige en plus is_active_user() (garde
--      restaurée, perdue entre 00017 et 00038) et ne sert plus qu'à journaliser
--      la confirmation côté client (le drapeau est déjà levé par le trigger ;
--      le UPDATE est un no-op de sécurité).
--   3. createStaffAccount insère le profil (must_change_password=true) APRÈS
--      la création de l'utilisateur Auth (INSERT, pas UPDATE) : le trigger
--      ne se déclenche pas à la création, le drapeau reste positionné.
--
-- Idempotente.
-- ============================================================================

create or replace function public.clear_must_change_password_on_password_change()
returns trigger
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  -- Le mot de passe vient réellement de changer : l'utilisateur n'a plus
  -- à être forcé à le changer (preuve mécanique, pas déclarative).
  update public.profiles
     set must_change_password = false
   where id = new.id
     and must_change_password = true;
  return new;
end;
$$;

drop trigger if exists clear_must_change_password_trg on auth.users;
create trigger clear_must_change_password_trg
  after update of encrypted_password on auth.users
  for each row execute function public.clear_must_change_password_on_password_change();

create or replace function public.complete_password_change()
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Vous devez être connecté.';
  end if;
  -- Garde restaurée (00017) : un compte DESACTIVE / en attente ne peut pas
  -- lever le drapeau. Le drapeau lui-même est levé par le trigger
  -- clear_must_change_password_trg lors du changement réel du mot de passe ;
  -- ce UPDATE est un no-op défensif (si le trigger a déjà agi).
  if not public.is_active_user() then
    raise exception 'Votre compte n''est pas actif.';
  end if;
  update public.profiles set must_change_password = false where id = v_uid;
  insert into public.audit_log (school_id, actor_id, actor_role, action, entity, entity_id)
  values (current_school_id(), v_uid, public.current_role(), 'password_change', 'profiles', v_uid);
end;
$$;

revoke execute on function public.complete_password_change() from public, anon;
grant execute on function public.complete_password_change() to authenticated, service_role;
