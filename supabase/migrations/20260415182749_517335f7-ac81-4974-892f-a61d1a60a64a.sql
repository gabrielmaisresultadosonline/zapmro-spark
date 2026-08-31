CREATE POLICY "Anyone can upload affiliate photos"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'assets' AND (storage.foldername(name))[1] = 'affiliates');