
-- Sessão única do bot WhatsApp (status de conexão + QR code)
CREATE TABLE IF NOT EXISTS public.wpp_bot_session (
  id TEXT PRIMARY KEY DEFAULT 'renda_extra',
  status TEXT NOT NULL DEFAULT 'disconnected', -- disconnected | qr | connecting | connected
  qr_code TEXT,
  phone_number TEXT,
  last_heartbeat TIMESTAMPTZ,
  request_qr BOOLEAN NOT NULL DEFAULT false,
  request_logout BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wpp_bot_session ENABLE ROW LEVEL SECURITY;

-- Configurações de remarketing
CREATE TABLE IF NOT EXISTS public.wpp_bot_settings (
  id TEXT PRIMARY KEY DEFAULT 'renda_extra',
  message_template TEXT NOT NULL DEFAULT '*Mais De 5k mensal?*

sim essa é nossa proposta, vejo que fez um cadastro em nosso site chegou a acessar nossa live gravada que disponibilziamos no site?',
  delay_minutes INTEGER NOT NULL DEFAULT 30,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wpp_bot_settings ENABLE ROW LEVEL SECURITY;

-- Fila e histórico de mensagens
CREATE TABLE IF NOT EXISTS public.wpp_bot_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID,
  lead_name TEXT,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending', -- pending | sent | no_whatsapp | failed
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wpp_bot_messages_status_idx
  ON public.wpp_bot_messages (status, scheduled_for);

ALTER TABLE public.wpp_bot_messages ENABLE ROW LEVEL SECURITY;

-- Sem políticas públicas: todo acesso é via service role (edge function + bot da VPS)

-- Linhas iniciais
INSERT INTO public.wpp_bot_session (id) VALUES ('renda_extra')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO public.wpp_bot_settings (id) VALUES ('renda_extra')
  ON CONFLICT (id) DO NOTHING;
