-- ============================================================================
-- 00039 — Durcissement : mise à jour atomique d'un agent administratif
-- (correction de la condition de course « dernier superadmin »).
--
-- Le contrôle « ne pas rétrograder/désactiver le dernier superadmin actif »
-- était fait en deux temps (lecture du compteur puis UPDATE), ce qui laissait
-- une fenêtre de course entre deux requêtes concurrentes. On déplace le
-- contrôle ET la mise à jour dans une seule fonction transactionnelle qui
-- verrouille la table en mode exclusif pour la durée de l'opération.
--
-- Idempotente.
-- ============================================================================

create or replace function public.admin_update_agent(
  p_agent_id uuid,
  p_patch jsonb,
  p_downgrades boolean
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_is_active_superadmin boolean;
  v_active_superadmins int;
begin
  if p_agent_id is null then
    return false;
  end if;

  -- Sérialise toutes les mises à jour d'agents pour éviter la course.
  lock table public.admin_agents in exclusive mode;

  select exists (
    select 1 from public.admin_agents
    where id = p_agent_id and role = 'superadmin' and status = 'ACTIF'
  ) into v_is_active_superadmin;

  if coalesce(p_downgrades, false) and v_is_active_superadmin then
    select count(*) into v_active_superadmins
    from public.admin_agents
    where role = 'superadmin' and status = 'ACTIF';
    if v_active_superadmins <= 1 then
      return false;
    end if;
  end if;

  update public.admin_agents set
    role       = coalesce(p_patch->>'role',       role),
    status     = coalesce(p_patch->>'status',     status),
    first_name = coalesce(p_patch->>'first_name', first_name),
    last_name  = coalesce(p_patch->>'last_name',  last_name),
    phone      = coalesce(p_patch->>'phone',      phone),
    email      = coalesce(p_patch->>'email',      email),
    updated_at = now()
  where id = p_agent_id;

  return true;
end;
$$;

revoke execute on function public.admin_update_agent(uuid, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_update_agent(uuid, jsonb, boolean)
  to service_role;