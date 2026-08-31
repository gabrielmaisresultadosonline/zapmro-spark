-- Create table for custom Kanban statuses
CREATE TABLE IF NOT EXISTS public.crm_statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL,
    value TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT 'blue',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.crm_statuses ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable read access for all users" ON public.crm_statuses FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.crm_statuses FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.crm_statuses FOR UPDATE USING (true);
CREATE POLICY "Enable delete for authenticated users" ON public.crm_statuses FOR DELETE USING (true);

-- Insert default Portuguese statuses
INSERT INTO public.crm_statuses (label, value, color, sort_order) VALUES
('Novo Lead', 'new', 'blue', 10),
('Em Atendimento', 'responded', 'yellow', 20),
('Qualificado', 'qualified', 'purple', 30),
('Atendimento Humano', 'human', 'orange', 40),
('Venda Fechada', 'closed', 'green', 50),
('Perdido', 'lost', 'red', 60)
ON CONFLICT (value) DO UPDATE SET 
    label = EXCLUDED.label,
    color = EXCLUDED.color,
    sort_order = EXCLUDED.sort_order;

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_crm_statuses_updated_at
    BEFORE UPDATE ON public.crm_statuses
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();