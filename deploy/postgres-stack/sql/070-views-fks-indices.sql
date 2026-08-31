-- ============================================================
-- ZAPMRO — 7. VIEWS / FKs / INDICES
-- Gerado em: 2026-08-29T14:18:03.232Z
-- ============================================================
BEGIN;
SET session_replication_role = replica;

CREATE OR REPLACE VIEW public.mro_orders_public AS  SELECT id,
    status,
    paid_at,
    completed_at,
    nsu_order,
    plan_type,
    amount,
    created_at,
    updated_at,
    api_created,
    email_sent
   FROM mro_orders;


ALTER TABLE public.admin_announcement_views ADD CONSTRAINT admin_announcement_views_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES admin_announcements(id) ON DELETE CASCADE;
ALTER TABLE public.admin_announcement_views ADD CONSTRAINT admin_announcement_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.ads_balance_orders ADD CONSTRAINT ads_balance_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES ads_users(id);
ALTER TABLE public.ads_client_data ADD CONSTRAINT ads_client_data_user_id_fkey FOREIGN KEY (user_id) REFERENCES ads_users(id);
ALTER TABLE public.ads_orders ADD CONSTRAINT ads_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES ads_users(id);
ALTER TABLE public.corretor_announcement_views ADD CONSTRAINT corretor_announcement_views_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES corretor_announcements(id) ON DELETE CASCADE;
ALTER TABLE public.corretor_announcement_views ADD CONSTRAINT corretor_announcement_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES corretor_users(id) ON DELETE CASCADE;
ALTER TABLE public.corretor_corrections_log ADD CONSTRAINT corretor_corrections_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES corretor_users(id) ON DELETE CASCADE;
ALTER TABLE public.crm_access_logs ADD CONSTRAINT crm_access_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.crm_activities ADD CONSTRAINT crm_activities_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES crm_contacts(id);
ALTER TABLE public.crm_activities ADD CONSTRAINT crm_activities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.crm_broadcasts ADD CONSTRAINT crm_broadcasts_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES crm_flows(id);
ALTER TABLE public.crm_broadcasts ADD CONSTRAINT crm_broadcasts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.crm_contacts ADD CONSTRAINT crm_contacts_current_flow_id_fkey FOREIGN KEY (current_flow_id) REFERENCES crm_flows(id);
ALTER TABLE public.crm_contacts ADD CONSTRAINT crm_contacts_google_sync_account_id_fkey FOREIGN KEY (google_sync_account_id) REFERENCES crm_google_accounts(id);
ALTER TABLE public.crm_contacts ADD CONSTRAINT crm_contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.crm_flow_executions ADD CONSTRAINT crm_flow_executions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE CASCADE;
ALTER TABLE public.crm_flow_executions ADD CONSTRAINT crm_flow_executions_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES crm_flows(id) ON DELETE CASCADE;
ALTER TABLE public.crm_flow_executions ADD CONSTRAINT crm_flow_executions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.crm_flow_steps ADD CONSTRAINT crm_flow_steps_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES crm_flows(id) ON DELETE CASCADE;
ALTER TABLE public.crm_flow_steps ADD CONSTRAINT crm_flow_steps_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.crm_flows ADD CONSTRAINT crm_flows_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.crm_google_accounts ADD CONSTRAINT crm_google_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.crm_google_tokens ADD CONSTRAINT crm_google_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.crm_messages ADD CONSTRAINT crm_messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE CASCADE;
ALTER TABLE public.crm_messages ADD CONSTRAINT crm_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.crm_metrics ADD CONSTRAINT crm_metrics_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.crm_profiles ADD CONSTRAINT crm_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.crm_scheduled_messages ADD CONSTRAINT crm_scheduled_messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE CASCADE;
ALTER TABLE public.crm_scheduled_messages ADD CONSTRAINT crm_scheduled_messages_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES crm_flows(id) ON DELETE CASCADE;
ALTER TABLE public.crm_scheduled_messages ADD CONSTRAINT crm_scheduled_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.crm_settings ADD CONSTRAINT crm_settings_initial_flow_id_fkey FOREIGN KEY (initial_flow_id) REFERENCES crm_flows(id);
ALTER TABLE public.crm_settings ADD CONSTRAINT crm_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.crm_statuses ADD CONSTRAINT crm_statuses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.crm_templates ADD CONSTRAINT crm_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.crm_webhook_delivery_logs ADD CONSTRAINT crm_webhook_delivery_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.crm_webhook_delivery_logs ADD CONSTRAINT crm_webhook_delivery_logs_webhook_id_fkey FOREIGN KEY (webhook_id) REFERENCES crm_webhooks(id) ON DELETE SET NULL;
ALTER TABLE public.crm_webhooks ADD CONSTRAINT crm_webhooks_template_id_fkey FOREIGN KEY (template_id) REFERENCES crm_templates(id);
ALTER TABLE public.crm_webhooks ADD CONSTRAINT crm_webhooks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.inteligencia_fotos_generations ADD CONSTRAINT inteligencia_fotos_generations_template_id_fkey FOREIGN KEY (template_id) REFERENCES inteligencia_fotos_templates(id) ON DELETE SET NULL;
ALTER TABLE public.inteligencia_fotos_generations ADD CONSTRAINT inteligencia_fotos_generations_user_id_fkey FOREIGN KEY (user_id) REFERENCES inteligencia_fotos_users(id) ON DELETE CASCADE;
ALTER TABLE public.live_analytics ADD CONSTRAINT live_analytics_session_id_fkey FOREIGN KEY (session_id) REFERENCES live_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.metodo_seguidor_orders ADD CONSTRAINT metodo_seguidor_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES metodo_seguidor_users(id);
ALTER TABLE public.metodo_seguidor_upsells ADD CONSTRAINT metodo_seguidor_upsells_module_id_fkey FOREIGN KEY (module_id) REFERENCES metodo_seguidor_modules(id) ON DELETE CASCADE;
ALTER TABLE public.metodo_seguidor_videos ADD CONSTRAINT metodo_seguidor_videos_module_id_fkey FOREIGN KEY (module_id) REFERENCES metodo_seguidor_modules(id) ON DELETE CASCADE;
ALTER TABLE public.mro_direct_logs ADD CONSTRAINT mro_direct_logs_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES mro_direct_automations(id) ON DELETE SET NULL;
ALTER TABLE public.mro_images ADD CONSTRAINT mro_images_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.mro_profiles ADD CONSTRAINT mro_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.mro_schedules ADD CONSTRAINT mro_schedules_image_id_fkey FOREIGN KEY (image_id) REFERENCES mro_images(id) ON DELETE SET NULL;
ALTER TABLE public.mro_schedules ADD CONSTRAINT mro_schedules_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.mro_strategies ADD CONSTRAINT mro_strategies_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.prompts_mro_payment_orders ADD CONSTRAINT prompts_mro_payment_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES prompts_mro_users(id);
ALTER TABLE public.renda_extra_email_logs ADD CONSTRAINT renda_extra_email_logs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES renda_extra_leads(id);
ALTER TABLE public.renda_extra_v2_email_logs ADD CONSTRAINT renda_extra_v2_email_logs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES renda_extra_v2_leads(id) ON DELETE CASCADE;
ALTER TABLE public.rendaext_email_logs ADD CONSTRAINT rendaext_email_logs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES rendaext_leads(id) ON DELETE SET NULL;
ALTER TABLE public.rendaext_orders ADD CONSTRAINT rendaext_orders_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES rendaext_leads(id) ON DELETE SET NULL;
ALTER TABLE public.sales_tutorials ADD CONSTRAINT sales_tutorials_module_id_fkey FOREIGN KEY (module_id) REFERENCES sales_modules(id) ON DELETE SET NULL;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.zapi_flow_executions ADD CONSTRAINT zapi_flow_executions_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES zapi_flows(id) ON DELETE CASCADE;
ALTER TABLE public.zapi_flow_steps ADD CONSTRAINT zapi_flow_steps_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES zapi_flows(id) ON DELETE CASCADE;


CREATE INDEX idx_ann_views_user ON public.admin_announcement_views USING btree (user_id);
CREATE INDEX idx_ann_active ON public.admin_announcements USING btree (active);
CREATE INDEX idx_call_analytics_created_at ON public.call_analytics USING btree (created_at DESC);
CREATE INDEX idx_call_analytics_event_type ON public.call_analytics USING btree (event_type);
CREATE INDEX idx_corretor_corrections_created_at ON public.corretor_corrections_log USING btree (created_at);
CREATE INDEX idx_corretor_corrections_user_id ON public.corretor_corrections_log USING btree (user_id);
CREATE INDEX idx_corretor_orders_email ON public.corretor_orders USING btree (email);
CREATE INDEX idx_corretor_orders_nsu ON public.corretor_orders USING btree (nsu_order);
CREATE INDEX idx_corretor_orders_status ON public.corretor_orders USING btree (status);
CREATE INDEX idx_crm_activities_contact_id ON public.crm_activities USING btree (contact_id);
CREATE UNIQUE INDEX crm_contacts_user_canon_wa_id_key ON public.crm_contacts USING btree (user_id, crm_canon_wa_id(wa_id));
CREATE UNIQUE INDEX crm_contacts_wa_id_user_id_idx ON public.crm_contacts USING btree (wa_id, user_id);
CREATE INDEX idx_crm_contacts_ai_analysis_history ON public.crm_contacts USING gin (ai_analysis_history);
CREATE INDEX idx_crm_contacts_google_sync_pending_claim ON public.crm_contacts USING btree (user_id, google_sync_claimed_at) WHERE ((google_sync_account_id IS NULL) OR ((metadata ->> 'google_dirty'::text) = 'true'::text));
CREATE INDEX idx_crm_contacts_google_synced_at ON public.crm_contacts USING btree (user_id, google_synced_at) WHERE (google_sync_account_id IS NOT NULL);
CREATE INDEX idx_crm_contacts_last_message_received_at ON public.crm_contacts USING btree (last_message_received_at);
CREATE INDEX idx_crm_contacts_updated_at ON public.crm_contacts USING btree (updated_at);
CREATE INDEX idx_crm_flow_executions_contact_id ON public.crm_flow_executions USING btree (contact_id);
CREATE UNIQUE INDEX crm_google_tokens_single_row ON public.crm_google_tokens USING btree ((true));
CREATE INDEX crm_messages_deleted_idx ON public.crm_messages USING btree (contact_id, is_deleted) WHERE (is_deleted = true);
CREATE UNIQUE INDEX crm_messages_user_meta_unique ON public.crm_messages USING btree (user_id, meta_message_id) WHERE (meta_message_id IS NOT NULL);
CREATE INDEX idx_crm_messages_contact_id ON public.crm_messages USING btree (contact_id);
CREATE INDEX idx_crm_messages_created_at ON public.crm_messages USING btree (created_at);
CREATE INDEX idx_crm_messages_direction_created_at ON public.crm_messages USING btree (direction, created_at);
CREATE INDEX idx_crm_sales_orders_created_at ON public.crm_sales_orders USING btree (created_at DESC);
CREATE INDEX idx_crm_sales_orders_email ON public.crm_sales_orders USING btree (email);
CREATE INDEX idx_crm_sales_orders_status ON public.crm_sales_orders USING btree (status);
CREATE INDEX idx_crm_scheduled_messages_contact_id ON public.crm_scheduled_messages USING btree (contact_id);
CREATE INDEX idx_crm_webhook_logs_created_at ON public.crm_webhook_delivery_logs USING btree (created_at DESC);
CREATE INDEX idx_crm_webhook_logs_webhook_id ON public.crm_webhook_delivery_logs USING btree (webhook_id);
CREATE INDEX idx_free_trial_expires_at ON public.free_trial_registrations USING btree (expires_at);
CREATE INDEX idx_webhook_logs_created_at ON public.infinitepay_webhook_logs USING btree (created_at DESC);
CREATE INDEX idx_webhook_logs_order_nsu ON public.infinitepay_webhook_logs USING btree (order_nsu);
CREATE INDEX idx_known_followers_account ON public.mro_direct_known_followers USING btree (instagram_account_id);
CREATE INDEX idx_mro_orders_email ON public.mro_orders USING btree (email);
CREATE INDEX idx_mro_orders_nsu ON public.mro_orders USING btree (nsu_order);
CREATE INDEX idx_mro_orders_status ON public.mro_orders USING btree (status);
CREATE INDEX idx_payment_orders_email ON public.payment_orders USING btree (email);
CREATE INDEX idx_payment_orders_nsu ON public.payment_orders USING btree (nsu_order);
CREATE INDEX idx_payment_orders_status ON public.payment_orders USING btree (status);
CREATE INDEX idx_rendaext_leads_created ON public.rendaext_leads USING btree (created_at DESC);
CREATE INDEX idx_rendaext_orders_email ON public.rendaext_orders USING btree (email);
CREATE INDEX idx_rendaext_orders_nsu ON public.rendaext_orders USING btree (nsu_order);
CREATE INDEX idx_rendaext_orders_status ON public.rendaext_orders USING btree (status);
CREATE INDEX idx_sales_tutorials_module_id ON public.sales_tutorials USING btree (module_id);
CREATE INDEX idx_squarecloud_user_profiles_username ON public.squarecloud_user_profiles USING btree (squarecloud_username);
CREATE INDEX idx_tickets_created_at ON public.support_tickets USING btree (created_at DESC);
CREATE INDEX idx_tickets_platform ON public.support_tickets USING btree (platform);
CREATE INDEX idx_tickets_status ON public.support_tickets USING btree (status);
CREATE INDEX idx_user_sessions_last_access ON public.user_sessions USING btree (last_access DESC);
CREATE INDEX wpp_bot_messages_status_idx ON public.wpp_bot_messages USING btree (status, scheduled_for);
CREATE INDEX idx_wpp_bot_messages_v2_status_scheduled ON public.wpp_bot_messages_v2 USING btree (status, scheduled_for);


SET session_replication_role = DEFAULT;
COMMIT;