DROP POLICY IF EXISTS coach_audios_insert ON storage.objects;
CREATE POLICY coach_audios_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'coach-audios'
    AND (storage.foldername(name))[1]::uuid = ANY (public.clinicas_do_usuario())
    AND public.has_module_access(auth.uid(), (storage.foldername(name))[1]::uuid, 'coach', 'write')
  );

DROP POLICY IF EXISTS coach_audios_select ON storage.objects;
CREATE POLICY coach_audios_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'coach-audios'
    AND (storage.foldername(name))[1]::uuid = ANY (public.clinicas_do_usuario())
  );

DROP POLICY IF EXISTS coach_audios_delete ON storage.objects;
CREATE POLICY coach_audios_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'coach-audios'
    AND (storage.foldername(name))[1]::uuid = ANY (public.clinicas_do_usuario())
    AND public.has_module_access(auth.uid(), (storage.foldername(name))[1]::uuid, 'coach', 'write')
  );