-- ============================================================
-- ZAPMRO — 2. ESTRUTURA (TABELAS)
-- Gerado em: 2026-08-29T14:18:03.232Z
-- ============================================================
BEGIN;
SET session_replication_role = replica;

CREATE TABLE IF NOT EXISTS public.admin_announcement_views (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  announcement_id uuid NOT NULL,
  user_id uuid NOT NULL,
  view_count integer DEFAULT 0 NOT NULL,
  last_viewed_at timestamp with time zone,
  dismissed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.admin_announcements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  frequency text DEFAULT 'once'::text NOT NULL,
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.ads_admins (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  password text NOT NULL,
  name text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.ads_balance_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  leads_quantity integer NOT NULL,
  nsu_order text NOT NULL,
  infinitepay_link text,
  status text DEFAULT 'pending'::text NOT NULL,
  paid_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.ads_client_data (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  niche text,
  region text,
  instagram text,
  whatsapp text,
  telegram_group text,
  logo_url text,
  observations text,
  sales_page_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  offer_description text,
  competitor1_instagram text,
  competitor2_instagram text,
  media_urls ARRAY DEFAULT '{}'::text[],
  edit_count integer DEFAULT 0,
  campaign_active boolean DEFAULT false,
  campaign_activated_at timestamp with time zone,
  campaign_end_date timestamp with time zone,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.ads_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  email text NOT NULL,
  name text NOT NULL,
  amount numeric NOT NULL,
  nsu_order text NOT NULL,
  infinitepay_link text,
  status text DEFAULT 'pending'::text NOT NULL,
  paid_at timestamp with time zone,
  expired_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  invoice_slug text,
  transaction_nsu text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.ads_users (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  password text NOT NULL,
  phone text,
  status text DEFAULT 'pending'::text NOT NULL,
  subscription_start timestamp with time zone,
  subscription_end timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.broadcast_email_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  recipient_email text NOT NULL,
  recipient_name text,
  subject text NOT NULL,
  body text NOT NULL,
  status text DEFAULT 'sent'::text NOT NULL,
  error_message text,
  sent_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.call_analytics (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_type text NOT NULL,
  user_agent text,
  referrer text,
  device_type text,
  source_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.corretor_announcement_views (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  announcement_id uuid NOT NULL,
  user_id uuid NOT NULL,
  viewed_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.corretor_announcements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  content text,
  image_url text,
  video_url text,
  is_active boolean DEFAULT true,
  is_blocking boolean DEFAULT false,
  display_duration integer DEFAULT 0,
  start_date timestamp with time zone DEFAULT now(),
  end_date timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.corretor_corrections_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  text_length integer DEFAULT 0,
  correction_type text DEFAULT 'text'::text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.corretor_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  name text,
  phone text,
  amount numeric DEFAULT 19.90 NOT NULL,
  nsu_order text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  infinitepay_link text,
  expired_at timestamp with time zone,
  paid_at timestamp with time zone,
  access_created boolean DEFAULT false,
  email_sent boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.corretor_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  setting_key text NOT NULL,
  setting_value text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.corretor_users (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  name text,
  status text DEFAULT 'active'::text NOT NULL,
  days_remaining integer DEFAULT 30 NOT NULL,
  subscription_start timestamp with time zone DEFAULT now(),
  subscription_end timestamp with time zone,
  last_access timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  corrections_count integer DEFAULT 0,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.created_accesses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_email text NOT NULL,
  customer_name text,
  username text NOT NULL,
  password text NOT NULL,
  service_type text NOT NULL,
  access_type text NOT NULL,
  days_access integer DEFAULT 365,
  api_created boolean DEFAULT false,
  email_sent boolean DEFAULT false,
  email_sent_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  expiration_date timestamp with time zone,
  expiration_warning_sent boolean DEFAULT false,
  expiration_warning_sent_at timestamp with time zone,
  expired_notification_sent boolean DEFAULT false,
  expired_notification_sent_at timestamp with time zone,
  email_opened boolean DEFAULT false,
  email_opened_at timestamp with time zone,
  tracking_id text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.crm_access_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.crm_activities (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  contact_id uuid,
  activity_type text NOT NULL,
  description text,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now(),
  user_id uuid DEFAULT auth.uid(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.crm_broadcasts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  message_text text,
  buttons jsonb,
  status text DEFAULT 'pending'::text,
  total_contacts integer DEFAULT 0,
  sent_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  type text DEFAULT 'message'::text,
  template_id text,
  flow_id uuid,
  random_delay_min integer DEFAULT 5,
  random_delay_max integer DEFAULT 30,
  target_type text DEFAULT 'contacts'::text,
  uploaded_numbers ARRAY,
  user_id uuid DEFAULT auth.uid(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  wa_id text NOT NULL,
  name text,
  last_interaction timestamp with time zone,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'new'::text,
  is_qualified boolean DEFAULT false,
  sale_closed boolean DEFAULT false,
  total_messages_received integer DEFAULT 0,
  total_messages_sent integer DEFAULT 0,
  current_flow_id uuid,
  current_step_index integer,
  flow_state text DEFAULT 'idle'::text,
  last_flow_interaction timestamp with time zone,
  custom_labels ARRAY DEFAULT '{}'::text[],
  current_node_id text,
  next_execution_time timestamp with time zone,
  source_type text DEFAULT 'system'::text,
  ai_active boolean DEFAULT true,
  ai_strategy_active boolean DEFAULT true,
  last_ai_strategy text,
  ai_strategy_history jsonb DEFAULT '[]'::jsonb,
  google_sync_account_id uuid,
  ai_analysis_history jsonb DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  flow_timeout_minutes integer DEFAULT 20,
  flow_timeout_node_id text,
  last_read_at timestamp with time zone DEFAULT now(),
  last_message_received_at timestamp with time zone,
  user_id uuid DEFAULT auth.uid(),
  ai_agent_prompt text,
  countdown_trigger_sent_at timestamp with time zone,
  google_sync_claim_token uuid,
  google_sync_claimed_at timestamp with time zone,
  google_synced_at timestamp with time zone,
  countdown_trigger_last_sent_at timestamp with time zone,
  countdown_trigger_total_sent integer DEFAULT 0 NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.crm_flow_executions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  contact_id uuid,
  flow_id uuid,
  current_node_id text,
  state jsonb DEFAULT '{}'::jsonb,
  last_interaction timestamp with time zone DEFAULT now(),
  waiting_since timestamp with time zone,
  waiting_for_type text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  user_id uuid DEFAULT auth.uid(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.crm_flow_steps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  flow_id uuid,
  step_order integer NOT NULL,
  message_text text,
  buttons jsonb,
  delay_seconds integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  step_type text DEFAULT 'text'::text,
  media_url text,
  media_type text,
  user_id uuid DEFAULT auth.uid(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.crm_flows (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  trigger_keyword text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  trigger_type text DEFAULT 'keyword'::text,
  trigger_keywords ARRAY,
  nodes jsonb DEFAULT '[]'::jsonb,
  edges jsonb DEFAULT '[]'::jsonb,
  user_id uuid DEFAULT auth.uid(),
  trigger_tag text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.crm_google_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  expiry_date bigint,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  user_id uuid DEFAULT auth.uid(),
  auto_sync boolean DEFAULT true NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.crm_google_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now(),
  user_id uuid DEFAULT auth.uid(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.crm_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  contact_id uuid,
  direction text,
  message_type text DEFAULT 'text'::text,
  content text,
  meta_message_id text,
  status text,
  created_at timestamp with time zone DEFAULT now(),
  media_url text,
  error_message text,
  error_code text,
  metadata jsonb,
  user_id uuid DEFAULT auth.uid(),
  is_deleted boolean DEFAULT false NOT NULL,
  deleted_at timestamp with time zone,
  deleted_by text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.crm_metrics (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  date date DEFAULT CURRENT_DATE,
  sent_count integer DEFAULT 0,
  responded_count integer DEFAULT 0,
  qualified_count integer DEFAULT 0,
  sales_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  user_id uuid DEFAULT auth.uid(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.crm_profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  full_name text,
  whatsapp_number text,
  role text DEFAULT 'user'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  trial_ends_at timestamp with time zone DEFAULT (now() + '2 days'::interval),
  access_until timestamp with time zone,
  is_paid boolean DEFAULT false NOT NULL,
  plan text,
  PRIMARY KEY (id),
  CONSTRAINT crm_profiles_user_id_key UNIQUE (user_id)

);

CREATE TABLE IF NOT EXISTS public.crm_sales_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  whatsapp text NOT NULL,
  password_hash text NOT NULL,
  plan text NOT NULL,
  plan_label text NOT NULL,
  amount numeric NOT NULL,
  nsu_order text NOT NULL,
  infinitepay_link text,
  invoice_slug text,
  transaction_nsu text,
  status text DEFAULT 'pending'::text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  paid_at timestamp with time zone,
  raw_webhook jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.crm_scheduled_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  contact_id uuid,
  flow_id uuid,
  node_id text,
  scheduled_for timestamp with time zone NOT NULL,
  message_data jsonb NOT NULL,
  status text DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT now(),
  user_id uuid DEFAULT auth.uid(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.crm_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  meta_access_token text,
  meta_phone_number_id text,
  meta_waba_id text,
  meta_app_id text,
  meta_app_secret text,
  webhook_verify_token text DEFAULT (gen_random_uuid())::text,
  initial_auto_response_enabled boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  initial_response_text text DEFAULT 'Olá! Como posso te ajudar hoje?'::text,
  initial_response_buttons jsonb DEFAULT '[{"id": "opt_1", "text": "Quero saber mais"}, {"id": "opt_2", "text": "Falar com atendente"}]'::jsonb,
  openai_api_key text,
  ai_agent_enabled boolean DEFAULT false,
  ai_agent_trigger text DEFAULT 'first_message'::text,
  initial_flow_id uuid,
  shortcut_size integer DEFAULT 100,
  tag_size integer DEFAULT 100,
  ai_system_prompt text DEFAULT 'Você é um assistente de vendas profissional para a empresa Mais Resultados Online. Responda em Português do Brasil.'::text,
  ai_operation_mode text DEFAULT 'chat'::text,
  auto_generate_strategy boolean DEFAULT false,
  strategy_generation_prompt text DEFAULT 'Analise o histórico acima e gere 3 estratégias personalizadas para converter este cliente. Sugira também 2 perguntas que eliminem as principais dúvidas dele.'::text,
  ai_agent_trigger_keyword text,
  business_hours_enabled boolean DEFAULT false,
  business_hours_start text DEFAULT '08:00'::text,
  business_hours_end text DEFAULT '18:00'::text,
  business_hours_tz text DEFAULT 'America/Sao_Paulo'::text,
  outside_hours_message text DEFAULT 'Nossos administradores não estão ativos no momento. Seguiremos com o atendimento automatizado e em breve retornaremos com um atendimento humano.'::text,
  google_client_id text,
  google_client_secret text,
  google_auto_sync boolean DEFAULT false,
  vps_transcoder_url text,
  user_id uuid DEFAULT auth.uid(),
  webhook_identifier text DEFAULT (gen_random_uuid())::text,
  meta_display_phone_number text,
  meta_verified_name text,
  countdown_trigger_enabled boolean DEFAULT false,
  countdown_trigger_threshold_minutes integer DEFAULT 60,
  countdown_trigger_message_type text DEFAULT 'message'::text,
  countdown_trigger_content text,
  countdown_trigger_flow_id uuid,
  countdown_trigger_template_id text,
  business_description text,
  meta_business_id text,
  ai_agent_prompt text,
  ai_agent_label_on_transfer text,
  countdown_trigger_status_filter ARRAY DEFAULT '{}'::text[] NOT NULL,
  save_deleted_messages boolean DEFAULT false NOT NULL,
  ai_recovery_enabled boolean DEFAULT false NOT NULL,
  ai_recovery_delay_minutes integer DEFAULT 60 NOT NULL,
  ai_recovery_max_attempts integer DEFAULT 2 NOT NULL,
  ai_recovery_finalized_status text DEFAULT 'Finalizado agente IA'::text NOT NULL,
  ai_recovery_scope text DEFAULT 'ai_only'::text NOT NULL,
  countdown_trigger_scope text DEFAULT 'always'::text NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.crm_statuses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  label text NOT NULL,
  value text NOT NULL,
  color text DEFAULT 'blue'::text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_starred boolean DEFAULT false,
  user_id uuid DEFAULT auth.uid(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.crm_templates (
  id text NOT NULL,
  name text NOT NULL,
  category text,
  language text,
  status text,
  components jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  knowledge_description text,
  is_pix boolean DEFAULT false,
  pix_code text,
  is_carousel boolean DEFAULT false,
  user_id uuid DEFAULT auth.uid(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.crm_webhook_delivery_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  webhook_id uuid,
  to_number text NOT NULL,
  message text,
  status text NOT NULL,
  error_message text,
  order_id text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  user_id uuid DEFAULT auth.uid(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.crm_webhooks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  secret_token text DEFAULT encode(extensions.gen_random_bytes(32), 'hex'::text) NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  response_type text DEFAULT 'text'::text NOT NULL,
  template_id text,
  last_used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  default_status text DEFAULT 'new'::text NOT NULL,
  message_template text,
  metadata jsonb DEFAULT '{}'::jsonb,
  user_id uuid DEFAULT auth.uid(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.desconto_alunos_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  is_active boolean DEFAULT true,
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.free_trial_registrations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  whatsapp text NOT NULL,
  instagram_username text NOT NULL,
  generated_username text NOT NULL,
  generated_password text NOT NULL,
  mro_master_user text NOT NULL,
  registered_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  instagram_removed boolean DEFAULT false,
  instagram_removed_at timestamp with time zone,
  email_sent boolean DEFAULT false,
  expiration_email_sent boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  profile_screenshot_url text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.free_trial_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  mro_master_username text NOT NULL,
  mro_master_password text NOT NULL,
  welcome_video_url text,
  installation_video_url text,
  usage_video_url text,
  download_link text,
  group_link text,
  trial_duration_hours integer DEFAULT 24,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  welcome_video_thumbnail text,
  installation_video_thumbnail text,
  usage_video_thumbnail text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.infinitepay_webhook_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  event_type text DEFAULT 'webhook_received'::text NOT NULL,
  order_nsu text,
  transaction_nsu text,
  email text,
  username text,
  affiliate_id text,
  amount numeric,
  status text DEFAULT 'received'::text NOT NULL,
  payload jsonb,
  result_message text,
  order_found boolean DEFAULT false,
  order_id uuid,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.inteligencia_fotos_admins (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  password text NOT NULL,
  name text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.inteligencia_fotos_generations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  template_id uuid,
  input_image_url text NOT NULL,
  generated_image_url text NOT NULL,
  format text DEFAULT 'post'::text NOT NULL,
  saved boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.inteligencia_fotos_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  setting_key text NOT NULL,
  setting_value text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.inteligencia_fotos_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  image_url text NOT NULL,
  prompt text NOT NULL,
  title text,
  description text,
  category text,
  is_active boolean DEFAULT true,
  order_index integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.inteligencia_fotos_users (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  password text NOT NULL,
  name text NOT NULL,
  phone text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  last_access timestamp with time zone,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.license_keys (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  password text NOT NULL,
  license_key text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  last_validated_at timestamp with time zone,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.license_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  admin_email text DEFAULT 'mro@gmail.com'::text NOT NULL,
  admin_password text DEFAULT 'Ga145523@'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.live_analytics (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  session_id uuid NOT NULL,
  visitor_id text NOT NULL,
  watch_percentage integer DEFAULT 0 NOT NULL,
  device_type text,
  user_agent text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.live_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text DEFAULT 'Fazendo 5k com a MRO'::text NOT NULL,
  description text,
  video_url text,
  status text DEFAULT 'active'::text NOT NULL,
  fake_viewers_min integer DEFAULT 14 NOT NULL,
  fake_viewers_max integer DEFAULT 200 NOT NULL,
  whatsapp_group_link text,
  cta_title text DEFAULT 'Fature mais de 5k prestando serviço para as empresas'::text,
  cta_description text DEFAULT 'Rode a ferramenta na sua maquina/notebook/pc e cobre mensalmente das empresas por isso. Receba todo o passo a passo de como fechar contratos, de como apresentar esse serviço e como faturar de verdade.'::text,
  cta_button_text text DEFAULT 'Acesse o GRUPO para liberar o desconto'::text,
  cta_button_link text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  ended_at timestamp with time zone,
  hls_url text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.live_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  admin_email text DEFAULT 'mro@gmail.com'::text NOT NULL,
  admin_password text DEFAULT 'Ga145523@'::text NOT NULL,
  default_whatsapp_group text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.metodo_seguidor_admins (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email character varying(255) NOT NULL,
  password character varying(255) NOT NULL,
  name character varying(100),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.metodo_seguidor_banners (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title character varying,
  description text,
  image_url text NOT NULL,
  link_url text,
  link_text character varying,
  is_active boolean DEFAULT true,
  order_index integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.metodo_seguidor_modules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title character varying(255) NOT NULL,
  description text,
  thumbnail_url text,
  order_index integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.metodo_seguidor_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nsu_order character varying(50) NOT NULL,
  email character varying(255) NOT NULL,
  phone character varying(20),
  instagram_username character varying(100),
  amount numeric NOT NULL,
  status character varying(20) DEFAULT 'pending'::character varying,
  infinitepay_link text,
  paid_at timestamp with time zone,
  verified_at timestamp with time zone,
  expired_at timestamp with time zone,
  user_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.metodo_seguidor_upsells (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  module_id uuid,
  title character varying NOT NULL,
  description text,
  thumbnail_url text,
  button_text character varying DEFAULT 'Saiba Mais'::character varying,
  button_url text NOT NULL,
  price character varying,
  original_price character varying,
  is_active boolean DEFAULT true,
  show_after_days integer DEFAULT 2,
  order_index integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.metodo_seguidor_users (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  username character varying(50) NOT NULL,
  password character varying(100) NOT NULL,
  email character varying(255) NOT NULL,
  phone character varying(20),
  instagram_username character varying(100),
  subscription_status character varying(20) DEFAULT 'pending'::character varying,
  subscription_start timestamp with time zone,
  subscription_end timestamp with time zone,
  payment_id character varying(100),
  email_sent boolean DEFAULT false,
  email_sent_at timestamp with time zone,
  last_access timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.metodo_seguidor_videos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  module_id uuid,
  title character varying(255) NOT NULL,
  description text,
  video_url text,
  video_type character varying(20) DEFAULT 'youtube'::character varying,
  thumbnail_url text,
  duration character varying(20),
  order_index integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  show_title boolean DEFAULT true,
  show_number boolean DEFAULT true,
  show_play_button boolean DEFAULT true,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mro_direct_ai_pauses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sender_id text NOT NULL,
  is_paused boolean DEFAULT false NOT NULL,
  paused_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mro_direct_automations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  automation_type text NOT NULL,
  is_active boolean DEFAULT true,
  trigger_keywords ARRAY DEFAULT '{}'::text[],
  reply_message text NOT NULL,
  target_post_id text,
  delay_seconds integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  response_mode text DEFAULT 'manual'::text NOT NULL,
  ai_prompt text,
  comment_reply_text text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mro_direct_known_followers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  instagram_account_id text NOT NULL,
  follower_id text NOT NULL,
  follower_username text,
  welcomed boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mro_direct_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  automation_id uuid,
  event_type text NOT NULL,
  sender_id text,
  sender_username text,
  message_sent text,
  trigger_content text,
  status text DEFAULT 'sent'::text,
  error_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  direction text DEFAULT 'outgoing'::text NOT NULL,
  incoming_text text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mro_direct_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  instagram_account_id text,
  page_access_token text,
  webhook_verify_token text DEFAULT encode(extensions.gen_random_bytes(16), 'hex'::text),
  is_active boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  follower_count_baseline integer,
  follower_polling_active boolean DEFAULT false,
  last_follower_check timestamp with time zone,
  instagram_username text,
  follower_check_threshold integer DEFAULT 2,
  instagram_user_id text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mro_euro_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  username text NOT NULL,
  phone text,
  plan_type text DEFAULT 'annual'::text NOT NULL,
  amount numeric DEFAULT 300 NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  stripe_session_id text,
  stripe_payment_intent text,
  api_created boolean DEFAULT false,
  email_sent boolean DEFAULT false,
  paid_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mro_images (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  url text NOT NULL,
  prompt text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mro_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  username text NOT NULL,
  plan_type text DEFAULT 'annual'::text NOT NULL,
  amount numeric NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  nsu_order text NOT NULL,
  infinitepay_link text,
  api_created boolean DEFAULT false,
  email_sent boolean DEFAULT false,
  paid_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  phone text,
  expired_at timestamp with time zone,
  transaction_nsu text,
  invoice_slug text,
  whatsapp_sent boolean DEFAULT false,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mro_profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  instagram_username text,
  instagram_id text,
  meta_access_token text,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mro_schedules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  content_text text,
  image_id uuid,
  scheduled_for timestamp with time zone NOT NULL,
  status text DEFAULT 'pending'::text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mro_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mro_strategies (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  title text NOT NULL,
  content text NOT NULL,
  type text,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.paid_users (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  username text NOT NULL,
  instagram_username text,
  stripe_customer_id text,
  subscription_status text DEFAULT 'pending'::text,
  subscription_id text,
  subscription_end timestamp with time zone,
  strategies_generated integer DEFAULT 0,
  creatives_used integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  password text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.payment_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  nsu_order text NOT NULL,
  amount numeric DEFAULT 97.00 NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  infinitepay_link text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '00:30:00'::interval) NOT NULL,
  paid_at timestamp with time zone,
  verified_at timestamp with time zone,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.promo33_users (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  password text NOT NULL,
  name text,
  phone text,
  instagram_username text,
  instagram_data jsonb DEFAULT '{}'::jsonb,
  strategies_generated jsonb DEFAULT '[]'::jsonb,
  subscription_status text DEFAULT 'pending'::text NOT NULL,
  subscription_start timestamp with time zone,
  subscription_end timestamp with time zone,
  payment_id text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.prompts_mro_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  folder_name text NOT NULL,
  prompt_text text NOT NULL,
  image_url text,
  is_active boolean DEFAULT true,
  order_index integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  category text DEFAULT 'geral'::text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.prompts_mro_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  name text,
  phone text,
  amount numeric DEFAULT 97 NOT NULL,
  plan_type text DEFAULT 'annual'::text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  nsu_order text NOT NULL,
  infinitepay_link text,
  paid_at timestamp with time zone,
  expired_at timestamp with time zone,
  completed_at timestamp with time zone,
  access_created boolean DEFAULT false,
  email_sent boolean DEFAULT false,
  transaction_nsu text,
  invoice_slug text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.prompts_mro_payment_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  email text NOT NULL,
  amount numeric DEFAULT 67 NOT NULL,
  nsu_order text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  infinitepay_link text,
  paid_at timestamp with time zone,
  expired_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.prompts_mro_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  admin_email text DEFAULT 'mro@gmail.com'::text NOT NULL,
  admin_password text DEFAULT 'Ga145523@'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.prompts_mro_users (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  password text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  last_access timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  copies_count integer DEFAULT 0 NOT NULL,
  copies_limit integer DEFAULT 5 NOT NULL,
  is_paid boolean DEFAULT false NOT NULL,
  payment_nsu text,
  paid_at timestamp with time zone,
  subscription_end timestamp with time zone,
  phone text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.promptsin_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  name text,
  phone text,
  amount numeric DEFAULT 0 NOT NULL,
  plan_type text DEFAULT 'monthly'::text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  stripe_session_id text,
  stripe_payment_intent text,
  paid_at timestamp with time zone,
  completed_at timestamp with time zone,
  access_created boolean DEFAULT false,
  email_sent boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.promptsin_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  admin_email text DEFAULT 'mro@gmail.com'::text NOT NULL,
  admin_password text DEFAULT 'Ga145523@'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.promptsin_users (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  name text NOT NULL,
  password text NOT NULL,
  phone text,
  copies_count integer DEFAULT 0 NOT NULL,
  copies_limit integer DEFAULT 5 NOT NULL,
  is_paid boolean DEFAULT false NOT NULL,
  paid_at timestamp with time zone,
  subscription_end timestamp with time zone,
  stripe_customer_id text,
  stripe_session_id text,
  plan_type text DEFAULT 'monthly'::text,
  status text DEFAULT 'active'::text NOT NULL,
  last_access timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.renda_extra_analytics (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_type text NOT NULL,
  source_url text,
  user_agent text,
  device_type text,
  referrer text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.renda_extra_aula_analytics (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_type text NOT NULL,
  source_url text,
  user_agent text,
  device_type text,
  referrer text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.renda_extra_aula_leads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nome_completo text NOT NULL,
  email text NOT NULL,
  whatsapp text NOT NULL,
  aula_liberada boolean DEFAULT false,
  email_enviado boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.renda_extra_aula_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  admin_email text DEFAULT 'mro@gmail.com'::text NOT NULL,
  admin_password text DEFAULT 'Ga145523@'::text NOT NULL,
  youtube_url text DEFAULT 'https://www.youtube.com/watch?v=-0CHlqHVe0g'::text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.renda_extra_email_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid,
  email_to text NOT NULL,
  email_type text NOT NULL,
  subject text,
  status text DEFAULT 'sent'::text NOT NULL,
  error_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.renda_extra_leads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nome_completo text NOT NULL,
  email text NOT NULL,
  whatsapp text NOT NULL,
  trabalha_atualmente boolean DEFAULT false,
  media_salarial text NOT NULL,
  tipo_computador text NOT NULL,
  instagram_username text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  email_confirmacao_enviado boolean DEFAULT false,
  email_confirmacao_enviado_at timestamp with time zone,
  email_lembrete_enviado boolean DEFAULT false,
  email_lembrete_enviado_at timestamp with time zone,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.renda_extra_materiais (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text DEFAULT ''::text NOT NULL,
  video_url text NOT NULL,
  file_name text NOT NULL,
  file_size bigint DEFAULT 0,
  order_index integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.renda_extra_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  whatsapp_group_link text,
  launch_date timestamp with time zone DEFAULT '2026-01-21 09:00:00+00'::timestamp with time zone,
  admin_email text DEFAULT 'mro@gmail.com'::text,
  admin_password text DEFAULT 'Ga145523@'::text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.renda_extra_v2_analytics (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_type text NOT NULL,
  source_url text,
  user_agent text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.renda_extra_v2_email_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid,
  email_to text NOT NULL,
  email_type text NOT NULL,
  subject text,
  status text DEFAULT 'pending'::text NOT NULL,
  error_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.renda_extra_v2_leads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nome_completo text NOT NULL,
  email text NOT NULL,
  whatsapp text NOT NULL,
  trabalha_atualmente text,
  media_salarial text,
  tipo_computador text,
  instagram_username text,
  email_confirmacao_enviado boolean DEFAULT false,
  email_confirmacao_enviado_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.renda_extra_v2_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  admin_email text DEFAULT 'mro@gmail.com'::text NOT NULL,
  admin_password text DEFAULT 'Ga145523@'::text NOT NULL,
  whatsapp_group_link text,
  launch_date timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.rendaext_analytics (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_type text NOT NULL,
  user_agent text,
  referrer text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  source_url text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.rendaext_audio_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text,
  percent integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.rendaext_email_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid,
  recipient_email text NOT NULL,
  subject text,
  status text DEFAULT 'sent'::text NOT NULL,
  error_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  email_to text,
  email_type text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.rendaext_leads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nome_completo text NOT NULL,
  email text NOT NULL,
  whatsapp text NOT NULL,
  source text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  trabalha_atualmente boolean,
  media_salarial text,
  tipo_computador text,
  instagram_username text,
  email_confirmacao_enviado boolean DEFAULT false,
  email_confirmacao_enviado_at timestamp with time zone,
  email_lembrete_enviado boolean DEFAULT false,
  audio_listened_percent integer DEFAULT 0,
  audio_listened_at timestamp with time zone,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.rendaext_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid,
  nome_completo text NOT NULL,
  email text NOT NULL,
  whatsapp text NOT NULL,
  amount numeric DEFAULT 19.90 NOT NULL,
  nsu_order text NOT NULL,
  infinitepay_link text,
  status text DEFAULT 'pending'::text NOT NULL,
  paid_at timestamp with time zone,
  email_sent boolean DEFAULT false,
  email_sent_at timestamp with time zone,
  expired_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  audio_listened_percent integer DEFAULT 0,
  audio_listened_at timestamp with time zone,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.rendaext_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  admin_email text DEFAULT 'mro@gmail.com'::text NOT NULL,
  admin_password text DEFAULT 'Ga145523@'::text NOT NULL,
  whatsapp_group_link text,
  launch_date timestamp with time zone,
  session_secret text DEFAULT encode(extensions.gen_random_bytes(32), 'hex'::text) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.sales_modules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  cover_url text,
  order_index integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.sales_tutorials (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  module text DEFAULT 'Geral'::text NOT NULL,
  title text NOT NULL,
  description text,
  cover_url text,
  video_url text,
  button1_label text,
  button1_url text,
  button2_label text,
  button2_url text,
  order_index integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  module_id uuid,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.squarecloud_user_profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  squarecloud_username text NOT NULL,
  instagram_username text NOT NULL,
  profile_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  synced_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  profile_screenshot_url text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ticket_number text NOT NULL,
  platform text NOT NULL,
  username text NOT NULL,
  email text,
  subject text NOT NULL,
  message text NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  priority text DEFAULT 'normal'::text NOT NULL,
  admin_notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  resolved_at timestamp with time zone,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  role USER-DEFINED NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  squarecloud_username text NOT NULL,
  email text,
  days_remaining integer DEFAULT 365,
  profile_sessions jsonb DEFAULT '[]'::jsonb,
  archived_profiles jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  last_access timestamp with time zone DEFAULT now(),
  lifetime_creative_used_at timestamp with time zone,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_page_options (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  label text NOT NULL,
  message text NOT NULL,
  icon_type text DEFAULT 'sparkles'::text NOT NULL,
  color text DEFAULT '#25D366'::text NOT NULL,
  order_index integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_page_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  whatsapp_number text DEFAULT '5511999999999'::text NOT NULL,
  whatsapp_message text DEFAULT 'Gostaria de saber sobre o sistema inovador!'::text NOT NULL,
  page_title text DEFAULT 'Gabriel está disponível agora'::text NOT NULL,
  page_subtitle text DEFAULT 'Gostaria de saber sobre o sistema inovador?'::text NOT NULL,
  button_text text DEFAULT 'FALAR COM GABRIEL AGORA'::text NOT NULL,
  admin_email text DEFAULT 'mro@gmail.com'::text NOT NULL,
  admin_password text DEFAULT 'Ga145523@'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  session_secret text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.wpp_bot_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid,
  lead_name text,
  phone text NOT NULL,
  message text NOT NULL,
  scheduled_for timestamp with time zone DEFAULT now() NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  error_message text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.wpp_bot_messages_v2 (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid,
  lead_name text,
  phone text NOT NULL,
  message text NOT NULL,
  scheduled_for timestamp with time zone DEFAULT now() NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  error_message text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.wpp_bot_session (
  id text DEFAULT 'renda_extra'::text NOT NULL,
  status text DEFAULT 'disconnected'::text NOT NULL,
  qr_code text,
  phone_number text,
  last_heartbeat timestamp with time zone,
  request_qr boolean DEFAULT false NOT NULL,
  request_logout boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.wpp_bot_session_v2 (
  id text NOT NULL,
  status text DEFAULT 'disconnected'::text NOT NULL,
  request_qr boolean DEFAULT false NOT NULL,
  request_logout boolean DEFAULT false NOT NULL,
  qr_code text,
  phone_number text,
  last_heartbeat timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.wpp_bot_settings (
  id text DEFAULT 'renda_extra'::text NOT NULL,
  message_template text DEFAULT '*Mais De 5k mensal?*

sim essa é nossa proposta, vejo que fez um cadastro em nosso site chegou a acessar nossa live gravada que disponibilziamos no site?'::text NOT NULL,
  delay_minutes integer DEFAULT 30 NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.wpp_bot_settings_v2 (
  id text NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  delay_minutes integer DEFAULT 30 NOT NULL,
  message_template text DEFAULT 'Olá! Vi seu cadastro e queria te explicar melhor como funciona.'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.wpp_connection_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_type text NOT NULL,
  status text NOT NULL,
  details text,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.zapi_contacts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  phone text NOT NULL,
  name text,
  profile_pic_url text,
  last_message_at timestamp with time zone,
  unread_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  tags ARRAY DEFAULT '{}'::text[],
  crm_status text DEFAULT 'novo'::text,
  source text DEFAULT 'organico'::text,
  notes text,
  is_hot_lead boolean DEFAULT false,
  is_group boolean DEFAULT false,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.zapi_flow_executions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  flow_id uuid NOT NULL,
  phone text NOT NULL,
  current_step integer DEFAULT 0,
  status text DEFAULT 'running'::text,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  paused_at timestamp with time zone,
  last_step_at timestamp with time zone,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.zapi_flow_steps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  flow_id uuid NOT NULL,
  step_order integer DEFAULT 0 NOT NULL,
  step_type text DEFAULT 'text'::text NOT NULL,
  content text,
  media_url text,
  delay_seconds integer DEFAULT 2,
  simulate_typing boolean DEFAULT true,
  typing_duration_ms integer DEFAULT 3000,
  wait_for_reply boolean DEFAULT false,
  wait_timeout_seconds integer DEFAULT 300,
  button_text text,
  button_options jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  wait_indefinitely boolean DEFAULT false,
  followup_enabled boolean DEFAULT false,
  followup_delay_seconds integer DEFAULT 600,
  followup_type text DEFAULT 'text'::text,
  followup_content text,
  followup_media_url text,
  followup_flow_id text,
  button_actions jsonb DEFAULT '[]'::jsonb,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.zapi_flows (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  trigger_type text DEFAULT 'manual'::text NOT NULL,
  trigger_keywords ARRAY DEFAULT '{}'::text[],
  trigger_on_first_message boolean DEFAULT false,
  trigger_on_specific_message boolean DEFAULT false,
  trigger_specific_text text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.zapi_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  message_id text,
  phone text NOT NULL,
  contact_name text,
  direction text DEFAULT 'incoming'::text NOT NULL,
  message_type text DEFAULT 'text'::text NOT NULL,
  content text,
  media_url text,
  status text DEFAULT 'sent'::text,
  is_read boolean DEFAULT false,
  "timestamp" bigint,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  metadata jsonb,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.zapi_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  instance_id text,
  token text,
  client_token text,
  is_connected boolean DEFAULT false,
  phone_number text,
  webhook_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.zapmro_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  username text NOT NULL,
  phone text,
  plan_type text DEFAULT 'annual'::text NOT NULL,
  amount numeric DEFAULT 397 NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  nsu_order text NOT NULL,
  infinitepay_link text,
  api_created boolean DEFAULT false,
  email_sent boolean DEFAULT false,
  paid_at timestamp with time zone,
  completed_at timestamp with time zone,
  expired_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.zapmro_users (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  username text NOT NULL,
  email text,
  email_locked boolean DEFAULT false,
  days_remaining integer DEFAULT 365,
  last_access timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);



SET session_replication_role = DEFAULT;
COMMIT;