-- Create policy for uploading to assets bucket (public uploads for covers)
CREATE POLICY "Allow public uploads to assets"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'assets');

-- Create policy for updating assets
CREATE POLICY "Allow public updates to assets"
ON storage.objects
FOR UPDATE
TO public
USING (bucket_id = 'assets')
WITH CHECK (bucket_id = 'assets');

-- Create policy for deleting assets
CREATE POLICY "Allow public deletes from assets"
ON storage.objects
FOR DELETE
TO public
USING (bucket_id = 'assets');