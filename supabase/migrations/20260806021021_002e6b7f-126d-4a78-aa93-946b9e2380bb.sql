ALTER TABLE public.crm_settings
  ADD COLUMN IF NOT EXISTS ai_recovery_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_recovery_delay_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS ai_recovery_max_attempts integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS ai_recovery_finalized_status text NOT NULL DEFAULT 'Finalizado agente IA';