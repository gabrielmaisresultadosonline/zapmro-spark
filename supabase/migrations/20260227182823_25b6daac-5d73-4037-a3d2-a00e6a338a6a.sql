
-- Settings for MRO Direct+
CREATE TABLE public.mro_direct_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instagram_account_id text,
  page_access_token text,
  webhook_verify_token text DEFAULT encode(gen_random_bytes(16), 'hex'),
  is_active boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.mro_direct_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only on mro_direct_settings"
ON public.mro_direct_settings FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Automation rules
CREATE TABLE public.mro_direct_automations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_type text NOT NULL CHECK (automation_type IN ('dm_reply', 'comment_reply', 'welcome_follower')),
  is_active boolean DEFAULT true,
  trigger_keywords text[] DEFAULT '{}',
  reply_message text NOT NULL,
  target_post_id text, -- null = all posts (for comment_reply)
  delay_seconds integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.mro_direct_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only on mro_direct_automations"
ON public.mro_direct_automations FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Message logs
CREATE TABLE public.mro_direct_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id uuid REFERENCES public.mro_direct_automations(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  sender_id text,
  sender_username text,
  message_sent text,
  trigger_content text,
  status text DEFAULT 'sent',
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.mro_direct_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only on mro_direct_logs"
ON public.mro_direct_logs FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
