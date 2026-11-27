-- ============================================================================
-- 00057 — Anti-replay TOTP persistant (multi-instances).
--
-- L'anti-replay en mémoire du processus Node n'était pas partagé entre les
-- instances Render : un code consommé sur l'instance A pouvait être rejoué
-- sur l'instance B dans sa fenêtre de validité. On persiste donc le dernier
-- pas de temps consommé par agent, avec une mise à jour atomique
-- (GREATEST via ON CONFLICT ... WHERE), et une RPC réservée à service_role.
--
-- Idempotente.
-- ============================================================================

create table if not exists public.admin_totp_used_steps (
  agent_id uuid primary key references public.admin_agents(id) on delete cascade,
  last_used_step bigint not null
);

alter table public.admin_totp_used_steps enable row level security;
alter table public.admin_totp_used_steps force row level security;

revoke all on table public.admin_totp_used_steps from public, anon, authenticated;
grant all on table public.admin_totp_used_steps to service_role;

-- Consomme un pas de temps TOTP pour un agent. Renvoie true uniquement si
-- l'insertion (ou l'avancement atomique) a réellement eu lieu.
create or replace function public.consume_totp_step(p_agent_id uuid, p_step bigint)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_ok boolean := false;
begin
  if p_agent_id is null or p_step is null then
    return false;
  end if;

  insert into public.admin_totp_used_steps as s (agent_id, last_used_step)
  values (p_agent_id, p_step)
  on conflict (agent_id) do update
    set last_used_step = excluded.last_used_step
    where excluded.last_used_step > s.last_used_step
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

revoke execute on function public.consume_totp_step(uuid, bigint) from public, anon, authenticated;
grant execute on function public.consume_totp_step(uuid, bigint) to service_role;
