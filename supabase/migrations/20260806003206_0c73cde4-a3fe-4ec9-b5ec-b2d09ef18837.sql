
CREATE TEMP TABLE _dupe_map ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY user_id, public.crm_canon_wa_id(wa_id)
      ORDER BY (last_message_received_at IS NULL), last_message_received_at DESC NULLS LAST, created_at ASC
    ) AS keeper_id
  FROM public.crm_contacts
)
SELECT id AS dupe_id, keeper_id FROM ranked WHERE id <> keeper_id;

CREATE INDEX ON _dupe_map (dupe_id);

UPDATE public.crm_messages m SET contact_id = d.keeper_id FROM _dupe_map d WHERE m.contact_id = d.dupe_id;
UPDATE public.crm_activities a SET contact_id = d.keeper_id FROM _dupe_map d WHERE a.contact_id = d.dupe_id;
UPDATE public.crm_scheduled_messages s SET contact_id = d.keeper_id FROM _dupe_map d WHERE s.contact_id = d.dupe_id;
UPDATE public.crm_flow_executions f SET contact_id = d.keeper_id FROM _dupe_map d WHERE f.contact_id = d.dupe_id;

UPDATE public.crm_contacts k
SET name = src.name
FROM (
  SELECT d.keeper_id, max(c.name) AS name
  FROM _dupe_map d JOIN public.crm_contacts c ON c.id = d.dupe_id
  WHERE c.name IS NOT NULL AND c.name <> '' AND c.name <> c.wa_id
  GROUP BY d.keeper_id
) src
WHERE k.id = src.keeper_id AND (k.name IS NULL OR k.name = '' OR k.name = k.wa_id);

DELETE FROM public.crm_contacts c USING _dupe_map d WHERE c.id = d.dupe_id;

CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_user_canon_wa_id_key
  ON public.crm_contacts (user_id, public.crm_canon_wa_id(wa_id));
