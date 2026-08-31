-- Drop overly permissive policies
DROP POLICY IF EXISTS "Allow full access to crm_scheduled_messages" ON public.crm_scheduled_messages;
DROP POLICY IF EXISTS "Allow full access to crm_flow_executions" ON public.crm_flow_executions;

-- Create more secure policies (assuming authenticated admin access)
CREATE POLICY "Enable read for authenticated users" ON public.crm_scheduled_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.crm_scheduled_messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.crm_scheduled_messages FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for authenticated users" ON public.crm_scheduled_messages FOR DELETE TO authenticated USING (true);

CREATE POLICY "Enable read for authenticated users" ON public.crm_flow_executions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.crm_flow_executions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.crm_flow_executions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for authenticated users" ON public.crm_flow_executions FOR DELETE TO authenticated USING (true);

-- Fix function search path
ALTER FUNCTION public.update_crm_flow_execution_timestamp() SET search_path = public;
