CREATE POLICY "cb-informativos members select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'cb-informativos'
  AND public.is_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "managers select emitentes"
ON public.nfse_emitentes
FOR SELECT
TO authenticated
USING (public.can_manage_clinica(auth.uid(), clinica_id));