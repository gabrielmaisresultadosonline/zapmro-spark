
-- Drop overly permissive RLS policies across many tables

-- broadcast_email_logs
DROP POLICY IF EXISTS "Anyone can read broadcast logs" ON public.broadcast_email_logs;

-- corretor
DROP POLICY IF EXISTS "Allow public read on corretor_corrections_log" ON public.corretor_corrections_log;
DROP POLICY IF EXISTS "Allow public read on corretor_settings" ON public.corretor_settings;
DROP POLICY IF EXISTS "Allow public read on corretor_users" ON public.corretor_users;

-- crm broad policies
DROP POLICY IF EXISTS "Allow public access to CRM activities" ON public.crm_activities;
DROP POLICY IF EXISTS "Allow public access to CRM broadcasts" ON public.crm_broadcasts;
DROP POLICY IF EXISTS "Admin can do everything on crm_broadcasts" ON public.crm_broadcasts;
DROP POLICY IF EXISTS "Allow public access to CRM flows" ON public.crm_flows;
DROP POLICY IF EXISTS "Allow public delete on crm_flows" ON public.crm_flows;
DROP POLICY IF EXISTS "Allow public insert on crm_flows" ON public.crm_flows;
DROP POLICY IF EXISTS "Allow public update on crm_flows" ON public.crm_flows;
DROP POLICY IF EXISTS "Allow public access to CRM flow steps" ON public.crm_flow_steps;
DROP POLICY IF EXISTS "Allow public delete on crm_flow_steps" ON public.crm_flow_steps;
DROP POLICY IF EXISTS "Allow public insert on crm_flow_steps" ON public.crm_flow_steps;
DROP POLICY IF EXISTS "Allow public update on crm_flow_steps" ON public.crm_flow_steps;
DROP POLICY IF EXISTS "Allow public access to CRM metrics" ON public.crm_metrics;
DROP POLICY IF EXISTS "Allow public access to CRM templates" ON public.crm_templates;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.crm_webhooks;
DROP POLICY IF EXISTS "Public access to crm_webhooks" ON public.crm_webhooks;
DROP POLICY IF EXISTS "Admin can view CRM webhook logs" ON public.crm_webhook_delivery_logs;

-- crm_flow_executions: drop broad authenticated policies
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.crm_flow_executions;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.crm_flow_executions;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.crm_flow_executions;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.crm_flow_executions;

-- crm_scheduled_messages: drop broad authenticated policies
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.crm_scheduled_messages;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.crm_scheduled_messages;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.crm_scheduled_messages;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.crm_scheduled_messages;

-- crm_google_tokens: drop overly permissive public policies
DROP POLICY IF EXISTS "Admins can update google tokens" ON public.crm_google_tokens;
DROP POLICY IF EXISTS "Admins can view google tokens" ON public.crm_google_tokens;

-- desconto_alunos_settings: keep public SELECT (used by landing page), drop unrestricted UPDATE
DROP POLICY IF EXISTS "Allow update" ON public.desconto_alunos_settings;

-- metodo_seguidor_banners: keep public SELECT (banners shown to all), drop unrestricted ALL
DROP POLICY IF EXISTS "Service role can manage banners" ON public.metodo_seguidor_banners;

-- mro_orders: restrict INSERT to service role (orders should be created via edge function)
DROP POLICY IF EXISTS "Public can create mro order" ON public.mro_orders;

-- mro_settings: drop public SELECT
DROP POLICY IF EXISTS "Admins can view settings" ON public.mro_settings;

-- prompts_mro_orders: drop public SELECT (PII)
DROP POLICY IF EXISTS "Anyone can read prompts orders" ON public.prompts_mro_orders;

-- rendaext_audio_events: drop public SELECT (contains emails)
DROP POLICY IF EXISTS "Anyone can view rendaext_audio_events" ON public.rendaext_audio_events;

-- whatsapp_page_settings: drop public SELECT (contains admin password). Public RPC get_whatsapp_public_config exposes safe fields.
DROP POLICY IF EXISTS "Allow public read on whatsapp_page_settings" ON public.whatsapp_page_settings;

-- zapmro_orders: drop public SELECT (PII)
DROP POLICY IF EXISTS "Anyone can read zapmro orders" ON public.zapmro_orders;

-- Fix mutable search_path on remaining functions
ALTER FUNCTION public.increment_crm_metric(text) SET search_path = public;
ALTER FUNCTION public.increment_broadcast_failed(uuid) SET search_path = public;
ALTER FUNCTION public.increment_broadcast_sent(uuid) SET search_path = public;
ALTER FUNCTION public.trigger_process_scheduled_messages() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.handle_mro_updated_at() SET search_path = public;
ALTER FUNCTION public.handle_updated_at() SET search_path = public;

-- Revoke EXECUTE on sensitive SECURITY DEFINER functions from anon/authenticated (kept available to service_role)
REVOKE EXECUTE ON FUNCTION public.increment_crm_metric(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_broadcast_failed(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_broadcast_sent(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_process_scheduled_messages() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_corretor_corrections(uuid) FROM anon;
