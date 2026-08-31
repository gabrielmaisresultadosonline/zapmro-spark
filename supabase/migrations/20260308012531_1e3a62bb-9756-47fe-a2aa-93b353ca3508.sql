
CREATE POLICY "Allow public update on whatsapp_page_settings" ON public.whatsapp_page_settings FOR UPDATE USING (true) WITH CHECK (true);
