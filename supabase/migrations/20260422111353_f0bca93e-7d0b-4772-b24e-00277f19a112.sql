ALTER TABLE public.whatsapp_page_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on whatsapp_page_options" ON public.whatsapp_page_options;
DROP POLICY IF EXISTS "Allow public update on whatsapp_page_options" ON public.whatsapp_page_options;
DROP POLICY IF EXISTS "Allow public insert on whatsapp_page_options" ON public.whatsapp_page_options;
DROP POLICY IF EXISTS "Allow public delete on whatsapp_page_options" ON public.whatsapp_page_options;
DROP POLICY IF EXISTS "Service role only on whatsapp_page_options" ON public.whatsapp_page_options;

CREATE POLICY "Service role only on whatsapp_page_options"
ON public.whatsapp_page_options
FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

ALTER TABLE public.whatsapp_page_settings
ADD COLUMN IF NOT EXISTS session_secret text;

UPDATE public.whatsapp_page_settings
SET session_secret = 'i4bTWWHuUx8ZnuP8Ow-z9ygyVDECEbIxWG6AY0lrNWc'
WHERE session_secret IS NULL OR btrim(session_secret) = '';

CREATE OR REPLACE FUNCTION public.get_whatsapp_public_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  settings_row public.whatsapp_page_settings%ROWTYPE;
BEGIN
  SELECT *
  INTO settings_row
  FROM public.whatsapp_page_settings
  ORDER BY created_at ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'whatsapp_number', COALESCE(settings_row.whatsapp_number, ''),
    'page_title', COALESCE(settings_row.page_title, 'Gabriel está disponível agora para te ajudar'),
    'page_subtitle', COALESCE(settings_row.page_subtitle, 'Sobre o que gostaria de falar clique no botão abaixo.'),
    'button_text', COALESCE(settings_row.button_text, 'FALAR NO WHATSAPP'),
    'whatsapp_message', COALESCE(settings_row.whatsapp_message, 'Olá, vim pelo site, gostaria de saber sobre o sistema inovador!'),
    'options', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'label', o.label,
          'message', o.message,
          'icon_type', o.icon_type,
          'color', o.color,
          'order_index', o.order_index
        )
        ORDER BY o.order_index ASC, o.created_at ASC
      )
      FROM public.whatsapp_page_options o
      WHERE o.is_active = true
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_admin_login(login_email text, login_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  settings_row public.whatsapp_page_settings%ROWTYPE;
  normalized_email text;
  normalized_password text;
  payload text;
  signature text;
  session_token text;
BEGIN
  normalized_email := lower(trim(COALESCE(login_email, '')));
  normalized_password := trim(COALESCE(login_password, ''));

  IF normalized_email = '' OR normalized_password = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email e senha são obrigatórios');
  END IF;

  IF length(normalized_email) > 255 OR length(normalized_password) > 255 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Credenciais inválidas');
  END IF;

  SELECT *
  INTO settings_row
  FROM public.whatsapp_page_settings
  ORDER BY created_at ASC
  LIMIT 1;

  IF settings_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Configuração não encontrada');
  END IF;

  IF normalized_email <> lower(trim(COALESCE(settings_row.admin_email, '')))
     OR normalized_password <> trim(COALESCE(settings_row.admin_password, '')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email ou senha incorretos');
  END IF;

  payload := jsonb_build_object(
    'scope', 'whatsapp-admin',
    'email', normalized_email,
    'exp', floor(extract(epoch from now() + interval '12 hours') * 1000)
  )::text;

  signature := encode(hmac(payload, COALESCE(settings_row.session_secret, ''), 'sha256'), 'hex');
  session_token := encode(convert_to(payload, 'utf8'), 'base64') || '.' || signature;

  RETURN jsonb_build_object('success', true, 'token', session_token);
END;
$$;

REVOKE ALL ON FUNCTION public.get_whatsapp_public_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_public_config() TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.whatsapp_admin_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_admin_login(text, text) TO anon, authenticated, service_role;