-- Make user-data bucket public for affiliate photos
UPDATE storage.buckets 
SET public = true 
WHERE id = 'user-data';