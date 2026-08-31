-- Create bucket for metodo seguidor content (covers, thumbnails)
INSERT INTO storage.buckets (id, name, public)
VALUES ('metodo-seguidor-content', 'metodo-seguidor-content', true)
ON CONFLICT (id) DO NOTHING;

-- Create bucket for backups (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('metodo-seguidor-backup', 'metodo-seguidor-backup', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for content bucket (public read, service role write)
CREATE POLICY "Public can view metodo content"
ON storage.objects FOR SELECT
USING (bucket_id = 'metodo-seguidor-content');

CREATE POLICY "Service role can upload metodo content"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'metodo-seguidor-content');

CREATE POLICY "Service role can update metodo content"
ON storage.objects FOR UPDATE
USING (bucket_id = 'metodo-seguidor-content');

CREATE POLICY "Service role can delete metodo content"
ON storage.objects FOR DELETE
USING (bucket_id = 'metodo-seguidor-content');

-- RLS policies for backup bucket (service role only)
CREATE POLICY "Service role can manage backups"
ON storage.objects FOR ALL
USING (bucket_id = 'metodo-seguidor-backup');