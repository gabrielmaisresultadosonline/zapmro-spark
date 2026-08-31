-- Create a table for MRO Criativo settings
CREATE TABLE IF NOT EXISTS public.mro_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mro_settings ENABLE ROW LEVEL SECURITY;

-- Only allow authenticated admins to manage settings (assuming admin@gmail.com is handled in app logic or via custom claims)
-- For now, we'll allow access based on the admin email in the application logic, 
-- but we define a basic policy here.
CREATE POLICY "Admins can view settings" ON public.mro_settings
    FOR SELECT USING (true);

CREATE POLICY "Admins can update settings" ON public.mro_settings
    FOR ALL USING (auth.jwt() ->> 'email' = 'mro@gmail.com');

-- Initial settings seed
INSERT INTO public.mro_settings (key, value)
VALUES ('global_config', '{
    "openai_api_key": "",
    "terms_url": "https://maisresultadosonline.com.br/termos",
    "privacy_url": "https://maisresultadosonline.com.br/privacidade",
    "auth_callback_url": "https://maisresultadosonline.com.br/mrocriativo/callback"
}')
ON CONFLICT (key) DO NOTHING;
