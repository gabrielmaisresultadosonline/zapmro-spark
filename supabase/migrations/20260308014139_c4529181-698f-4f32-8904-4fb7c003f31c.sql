
CREATE TABLE public.whatsapp_page_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  message TEXT NOT NULL,
  icon_type TEXT NOT NULL DEFAULT 'sparkles',
  color TEXT NOT NULL DEFAULT '#25D366',
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_page_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on whatsapp_page_options" ON public.whatsapp_page_options FOR SELECT USING (true);
CREATE POLICY "Allow public update on whatsapp_page_options" ON public.whatsapp_page_options FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public insert on whatsapp_page_options" ON public.whatsapp_page_options FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete on whatsapp_page_options" ON public.whatsapp_page_options FOR DELETE USING (true);

INSERT INTO public.whatsapp_page_options (label, message, icon_type, color, order_index) VALUES
('Quero saber sobre o Sistema Inovador para Instagram', 'Ola, vim pelo site e gostaria de saber mais sobre o sistema inovador para Instagram!', 'sparkles', '#FFD700', 0),
('Preciso de Suporte', 'Ola, estou no site e gostaria de suporte, podem me ajudar?', 'headset', '#25D366', 1),
('Tenho outras duvidas', 'Ola, vim pelo site e gostaria de tirar algumas duvidas!', 'help', '#3B82F6', 2);
