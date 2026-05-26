-- Remove the broad public SELECT policy on storage.objects for cb-informativos bucket.
-- The bucket remains public so direct file URLs continue to work, but users can no
-- longer list the bucket contents via the storage API.
DROP POLICY IF EXISTS "cb-informativos public read" ON storage.objects;