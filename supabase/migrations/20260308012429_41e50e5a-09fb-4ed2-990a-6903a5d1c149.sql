
CREATE TABLE public.whatsapp_page_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number TEXT NOT NULL DEFAULT '5511999999999',
  whatsapp_message TEXT NOT NULL DEFAULT 'Gostaria de saber sobre o sistema inovador!',
  page_title TEXT NOT NULL DEFAULT 'Gabriel está disponível agora',
  page_subtitle TEXT NOT NULL DEFAULT 'Gostaria de saber sobre o sistema inovador?',
  button_text TEXT NOT NULL DEFAULT 'FALAR COM GABRIEL AGORA',
  admin_email TEXT NOT NULL DEFAULT 'mro@gmail.com',
  admin_password TEXT NOT NULL DEFAULT 'Ga145523@',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_page_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.whatsapp_page_settings (id) VALUES (gen_random_uuid());
