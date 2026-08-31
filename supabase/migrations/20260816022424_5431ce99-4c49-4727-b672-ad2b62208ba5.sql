
DROP INDEX IF EXISTS public.crm_contacts_user_canon_wa_id_key;

CREATE OR REPLACE FUNCTION public.crm_canon_wa_id(_wa_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN _wa_id IS NULL THEN NULL
    WHEN _wa_id ~ '^55[0-9]{10}$'
      THEN substring(_wa_id, 1, 4) || '9' || substring(_wa_id, 5)
    ELSE _wa_id
  END
$function$;

DO $$
DECLARE
  grp RECORD;
  survivor UUID;
  dup UUID;
  d_rec public.crm_contacts%ROWTYPE;
BEGIN
  FOR grp IN
    SELECT user_id, public.crm_canon_wa_id(wa_id) AS canon, array_agg(id) AS ids
    FROM public.crm_contacts
    GROUP BY 1, 2
    HAVING count(*) > 1
  LOOP
    SELECT id INTO survivor
    FROM public.crm_contacts
    WHERE id = ANY(grp.ids)
    ORDER BY (COALESCE(total_messages_received,0) + COALESCE(total_messages_sent,0)) DESC,
             last_message_received_at DESC NULLS LAST,
             created_at ASC
    LIMIT 1;

    FOR dup IN SELECT unnest(grp.ids) EXCEPT SELECT survivor LOOP
      UPDATE public.crm_messages SET contact_id = survivor WHERE contact_id = dup;
      UPDATE public.crm_activities SET contact_id = survivor WHERE contact_id = dup;
      UPDATE public.crm_scheduled_messages SET contact_id = survivor WHERE contact_id = dup;
      UPDATE public.crm_flow_executions SET contact_id = survivor WHERE contact_id = dup;

      SELECT * INTO d_rec FROM public.crm_contacts WHERE id = dup;
      DELETE FROM public.crm_contacts WHERE id = dup;

      UPDATE public.crm_contacts s SET
        total_messages_received = COALESCE(s.total_messages_received,0) + COALESCE(d_rec.total_messages_received,0),
        total_messages_sent = COALESCE(s.total_messages_sent,0) + COALESCE(d_rec.total_messages_sent,0),
        last_message_received_at = GREATEST(COALESCE(s.last_message_received_at, d_rec.last_message_received_at), COALESCE(d_rec.last_message_received_at, s.last_message_received_at)),
        last_interaction = GREATEST(COALESCE(s.last_interaction, d_rec.last_interaction), COALESCE(d_rec.last_interaction, s.last_interaction)),
        name = COALESCE(NULLIF(s.name, ''), d_rec.name)
      WHERE s.id = survivor;
    END LOOP;
  END LOOP;
END $$;

UPDATE public.crm_contacts
SET wa_id = public.crm_canon_wa_id(wa_id)
WHERE wa_id IS DISTINCT FROM public.crm_canon_wa_id(wa_id);

CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_user_canon_wa_id_key
  ON public.crm_contacts (user_id, public.crm_canon_wa_id(wa_id));
