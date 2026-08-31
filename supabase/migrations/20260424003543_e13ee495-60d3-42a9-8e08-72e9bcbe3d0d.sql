ALTER TABLE public.rendaext_leads
  ADD COLUMN trabalha_atualmente boolean,
  ADD COLUMN media_salarial text,
  ADD COLUMN tipo_computador text,
  ADD COLUMN instagram_username text,
  ADD COLUMN email_confirmacao_enviado boolean DEFAULT false,
  ADD COLUMN email_confirmacao_enviado_at timestamptz,
  ADD COLUMN email_lembrete_enviado boolean DEFAULT false;

ALTER TABLE public.rendaext_email_logs
  ADD COLUMN email_to text,
  ADD COLUMN email_type text;

UPDATE public.rendaext_email_logs SET email_to = recipient_email WHERE email_to IS NULL;