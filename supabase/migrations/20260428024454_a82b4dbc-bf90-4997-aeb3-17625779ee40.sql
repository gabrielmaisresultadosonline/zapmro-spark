-- Drop existing policies if they exist and create new permissive ones
DO $$ 
BEGIN
    -- crm_settings
    DROP POLICY IF EXISTS "Allow authenticated access to CRM settings" ON public.crm_settings;
    CREATE POLICY "Allow public access to CRM settings" ON public.crm_settings FOR ALL USING (true) WITH CHECK (true);

    -- crm_flows
    DROP POLICY IF EXISTS "Allow authenticated access to CRM flows" ON public.crm_flows;
    CREATE POLICY "Allow public access to CRM flows" ON public.crm_flows FOR ALL USING (true) WITH CHECK (true);

    -- crm_flow_steps
    DROP POLICY IF EXISTS "Allow authenticated access to CRM flow steps" ON public.crm_flow_steps;
    CREATE POLICY "Allow public access to CRM flow steps" ON public.crm_flow_steps FOR ALL USING (true) WITH CHECK (true);

    -- crm_contacts
    DROP POLICY IF EXISTS "Allow authenticated access to CRM contacts" ON public.crm_contacts;
    DROP POLICY IF EXISTS "Allow all access to crm_contacts" ON public.crm_contacts;
    CREATE POLICY "Allow public access to CRM contacts" ON public.crm_contacts FOR ALL USING (true) WITH CHECK (true);

    -- crm_messages
    DROP POLICY IF EXISTS "Allow authenticated access to CRM messages" ON public.crm_messages;
    DROP POLICY IF EXISTS "Allow all access to crm_messages" ON public.crm_messages;
    CREATE POLICY "Allow public access to CRM messages" ON public.crm_messages FOR ALL USING (true) WITH CHECK (true);

    -- crm_activities
    DROP POLICY IF EXISTS "Public activities access" ON public.crm_activities;
    CREATE POLICY "Allow public access to CRM activities" ON public.crm_activities FOR ALL USING (true) WITH CHECK (true);

    -- crm_broadcasts
    DROP POLICY IF EXISTS "Allow authenticated access to CRM broadcasts" ON public.crm_broadcasts;
    CREATE POLICY "Allow public access to CRM broadcasts" ON public.crm_broadcasts FOR ALL USING (true) WITH CHECK (true);

    -- crm_metrics
    DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.crm_metrics;
    CREATE POLICY "Allow public access to CRM metrics" ON public.crm_metrics FOR ALL USING (true) WITH CHECK (true);

    -- crm_templates
    DROP POLICY IF EXISTS "Allow all access to crm_templates for authenticated users" ON public.crm_templates;
    CREATE POLICY "Allow public access to CRM templates" ON public.crm_templates FOR ALL USING (true) WITH CHECK (true);
END $$;
