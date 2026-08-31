
CREATE OR REPLACE FUNCTION public.crm_canon_wa_id(_wa_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _wa_id IS NULL THEN NULL
    WHEN _wa_id ~ '^55' AND length(_wa_id) = 12 AND substring(_wa_id, 5, 1) ~ '[6-9]'
      THEN substring(_wa_id, 1, 4) || '9' || substring(_wa_id, 5)
    ELSE _wa_id
  END
$$;

CREATE INDEX IF NOT EXISTS idx_crm_messages_contact_id ON public.crm_messages (contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_contact_id ON public.crm_activities (contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_scheduled_messages_contact_id ON public.crm_scheduled_messages (contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_flow_executions_contact_id ON public.crm_flow_executions (contact_id);
