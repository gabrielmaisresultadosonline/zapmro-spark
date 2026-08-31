
-- Z-API Settings table
CREATE TABLE public.zapi_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id text,
  token text,
  client_token text,
  is_connected boolean DEFAULT false,
  phone_number text,
  webhook_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.zapi_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on zapi_settings"
  ON public.zapi_settings FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Z-API Messages table for storing conversations
CREATE TABLE public.zapi_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text,
  phone text NOT NULL,
  contact_name text,
  direction text NOT NULL DEFAULT 'incoming',
  message_type text NOT NULL DEFAULT 'text',
  content text,
  media_url text,
  status text DEFAULT 'sent',
  is_read boolean DEFAULT false,
  timestamp bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.zapi_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on zapi_messages"
  ON public.zapi_messages FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Z-API Contacts table
CREATE TABLE public.zapi_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  name text,
  profile_pic_url text,
  last_message_at timestamptz,
  unread_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.zapi_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on zapi_contacts"
  ON public.zapi_contacts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.zapi_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.zapi_contacts;
