ALTER TABLE public.crm_settings 
ADD COLUMN IF NOT EXISTS initial_response_text TEXT DEFAULT 'Olá! Como posso te ajudar hoje?',
ADD COLUMN IF NOT EXISTS initial_response_buttons JSONB DEFAULT '[{"id": "opt_1", "text": "Quero saber mais"}, {"id": "opt_2", "text": "Falar com atendente"}]'::jsonb;
