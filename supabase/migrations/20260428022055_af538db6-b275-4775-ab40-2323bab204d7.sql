INSERT INTO storage.buckets (id, name, public) VALUES ('crm-media', 'crm-media', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public CRM Media Access" ON storage.objects FOR SELECT USING (bucket_id = 'crm-media');
CREATE POLICY "Public CRM Media Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'crm-media');
