-- 20260101000044_admin_mfa.sql
-- Ajout du MFA/TOTP sur la console d'administration Classora.
-- Renommé depuis l'ancien préfixe « 0045 » : ce préfixe était trié avant
-- 20260101000001 par la CLI, donc ALTER TABLE public.admin_agents échouait
-- (table créée en 20260101000024). Le nouveau préfixe place cette migration
-- après 0043 et avant 0054 qui référence admin_mfa_sessions.
--
-- Colonnes sur admin_agents :
--   totp_secret      : secret base32 généré côté serveur, stocké haché ? non,
--                      le secret brut est nécessaire pour générer les codes.
--                      Il est protégé par le service_role (jamais exposé au client).
--   totp_enabled     : MFA activé pour cet agent.
--   totp_enabled_at  : horodatage de l'activation.
--
-- Table admin_mfa_sessions :
--   Sessions pré-authentifiées (après mot de passe, avant validation TOTP).
--   Durée de vie courte (5 min). Utilisées par /admin/mfa/verify pour compléter
--   l'authentification à 2 facteurs.

ALTER TABLE public.admin_agents
  ADD COLUMN IF NOT EXISTS totp_secret TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS totp_enabled_at TIMESTAMPTZ;

-- Index pour nettoyage rapide des sessions expirées.
CREATE TABLE IF NOT EXISTS public.admin_mfa_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.admin_agents(id) ON DELETE CASCADE,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_mfa_sessions_agent_id
  ON public.admin_mfa_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_admin_mfa_sessions_expires_at
  ON public.admin_mfa_sessions(expires_at);

-- RLS : seuls service_role peut écrire ; les agents ne lisent pas leurs propres
-- sessions (contrôle côté route Express via service_role).
ALTER TABLE public.admin_mfa_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_mfa_sessions FORCE ROW LEVEL SECURITY;

-- Pas de policy client : aucune lecture/écriture via clé anon.
-- service_role (bypass RLS) gère tout côté serveur.

-- Commentaires pour la documentation.
COMMENT ON COLUMN public.admin_agents.totp_secret IS 'Secret TOTP base32 (RFC 6238) pour MFA console admin.';
COMMENT ON COLUMN public.admin_agents.totp_enabled IS 'MFA activé pour cet agent administratif.';
COMMENT ON COLUMN public.admin_agents.totp_enabled_at IS 'Date/heure dactivation du MFA.';
