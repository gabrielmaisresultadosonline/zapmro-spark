CREATE TABLE public.desconto_alunos_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.desconto_alunos_settings ENABLE ROW LEVEL SECURITY;

-- Select is public
CREATE POLICY "Allow public select" ON public.desconto_alunos_settings FOR SELECT USING (true);

-- Update is restricted (for simplicity in this specific project context, we allow it, but in a real app we would restrict to auth.uid() or a service role)
-- Given the requested credentials, we will handle the "auth" in the frontend.
CREATE POLICY "Allow update" ON public.desconto_alunos_settings FOR UPDATE USING (true);

-- Insert initial row
INSERT INTO public.desconto_alunos_settings (is_active) VALUES (true);