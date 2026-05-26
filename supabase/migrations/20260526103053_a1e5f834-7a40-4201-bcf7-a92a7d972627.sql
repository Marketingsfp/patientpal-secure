
ALTER TABLE public.cb_convenios ADD COLUMN IF NOT EXISTS informativo_html text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('cb-informativos', 'cb-informativos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "cb-informativos public read" ON storage.objects;
CREATE POLICY "cb-informativos public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'cb-informativos');

DROP POLICY IF EXISTS "cb-informativos members insert" ON storage.objects;
CREATE POLICY "cb-informativos members insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'cb-informativos'
  AND public.is_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "cb-informativos members update" ON storage.objects;
CREATE POLICY "cb-informativos members update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'cb-informativos'
  AND public.is_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "cb-informativos members delete" ON storage.objects;
CREATE POLICY "cb-informativos members delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'cb-informativos'
  AND public.is_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
