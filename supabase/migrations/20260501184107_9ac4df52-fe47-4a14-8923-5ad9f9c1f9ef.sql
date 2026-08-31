-- Update crm_broadcasts table
ALTER TABLE public.crm_broadcasts 
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'message',
ADD COLUMN IF NOT EXISTS template_id TEXT, -- Note: matching crm_templates.id type
ADD COLUMN IF NOT EXISTS flow_id UUID REFERENCES public.crm_flows(id),
ADD COLUMN IF NOT EXISTS random_delay_min INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS random_delay_max INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS target_type TEXT DEFAULT 'contacts',
ADD COLUMN IF NOT EXISTS uploaded_numbers TEXT[];

-- Ensure RLS is enabled
ALTER TABLE public.crm_broadcasts ENABLE ROW LEVEL SECURITY;

-- Simple policies for admin access
DROP POLICY IF EXISTS "Admin can do everything on crm_broadcasts" ON public.crm_broadcasts;
CREATE POLICY "Admin can do everything on crm_broadcasts" 
ON public.crm_broadcasts 
FOR ALL 
USING (true) 
WITH CHECK (true);
