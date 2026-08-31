-- Tabela para armazenar usuários pagantes do plano mensal
CREATE TABLE public.paid_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  instagram_username TEXT,
  stripe_customer_id TEXT,
  subscription_status TEXT DEFAULT 'pending',
  subscription_id TEXT,
  subscription_end TIMESTAMP WITH TIME ZONE,
  strategies_generated INTEGER DEFAULT 0,
  creatives_used INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.paid_users ENABLE ROW LEVEL SECURITY;

-- Policy: usuários podem ver seus próprios dados
CREATE POLICY "Users can view own data" 
ON public.paid_users 
FOR SELECT 
USING (email = current_setting('request.jwt.claims', true)::json->>'email');

-- Policy: usuários podem atualizar seus próprios dados
CREATE POLICY "Users can update own data" 
ON public.paid_users 
FOR UPDATE 
USING (email = current_setting('request.jwt.claims', true)::json->>'email');

-- Policy: inserção pública para cadastro inicial
CREATE POLICY "Anyone can insert" 
ON public.paid_users 
FOR INSERT 
WITH CHECK (true);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_paid_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_paid_users_updated_at
BEFORE UPDATE ON public.paid_users
FOR EACH ROW
EXECUTE FUNCTION public.update_paid_users_updated_at();