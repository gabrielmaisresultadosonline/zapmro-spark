ALTER TABLE public.crm_settings ADD COLUMN IF NOT EXISTS ai_recovery_scope TEXT NOT NULL DEFAULT 'ai_only';
ALTER TABLE public.crm_settings DROP CONSTRAINT IF EXISTS crm_settings_ai_recovery_scope_check;
ALTER TABLE public.crm_settings ADD CONSTRAINT crm_settings_ai_recovery_scope_check CHECK (ai_recovery_scope IN ('ai_only','all'));