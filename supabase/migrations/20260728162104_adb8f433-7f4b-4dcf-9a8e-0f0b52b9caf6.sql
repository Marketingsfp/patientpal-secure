-- Storage: backups-diarios write policies (admin-only, scoped to clinica folder)
CREATE POLICY "backups admin insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'backups-diarios'
  AND EXISTS (
    SELECT 1 FROM public.clinica_memberships m
    WHERE m.user_id = auth.uid()
      AND m.role = 'admin'::app_role
      AND (storage.foldername(name))[1] = (m.clinica_id)::text
  )
);

CREATE POLICY "backups admin update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'backups-diarios'
  AND EXISTS (
    SELECT 1 FROM public.clinica_memberships m
    WHERE m.user_id = auth.uid()
      AND m.role = 'admin'::app_role
      AND (storage.foldername(name))[1] = (m.clinica_id)::text
  )
)
WITH CHECK (
  bucket_id = 'backups-diarios'
  AND EXISTS (
    SELECT 1 FROM public.clinica_memberships m
    WHERE m.user_id = auth.uid()
      AND m.role = 'admin'::app_role
      AND (storage.foldername(name))[1] = (m.clinica_id)::text
  )
);

CREATE POLICY "backups admin delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'backups-diarios'
  AND EXISTS (
    SELECT 1 FROM public.clinica_memberships m
    WHERE m.user_id = auth.uid()
      AND m.role = 'admin'::app_role
      AND (storage.foldername(name))[1] = (m.clinica_id)::text
  )
);

-- planos_assinatura_arquivo: make read-only intent explicit by revoking write grants
REVOKE INSERT, UPDATE, DELETE ON public.planos_assinatura_arquivo FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.planos_assinatura_arquivo FROM anon;