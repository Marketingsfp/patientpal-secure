-- Foto do paciente: coluna + bucket privado com RLS por clínica

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS foto_url text,
  ADD COLUMN IF NOT EXISTS foto_atualizado_em timestamptz;

-- Bucket privado (somente acessível via signed URL / RLS)
INSERT INTO storage.buckets (id, name, public)
VALUES ('pacientes-fotos', 'pacientes-fotos', false)
ON CONFLICT (id) DO NOTHING;

-- Limpa policies antigas se existirem
DROP POLICY IF EXISTS "pacientes_fotos_select" ON storage.objects;
DROP POLICY IF EXISTS "pacientes_fotos_insert" ON storage.objects;
DROP POLICY IF EXISTS "pacientes_fotos_update" ON storage.objects;
DROP POLICY IF EXISTS "pacientes_fotos_delete" ON storage.objects;

-- Caminho esperado: {clinica_id}/{paciente_id}.{ext}
-- Só membros da clínica podem ver/escrever
CREATE POLICY "pacientes_fotos_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'pacientes-fotos'
  AND public.is_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "pacientes_fotos_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'pacientes-fotos'
  AND public.is_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "pacientes_fotos_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'pacientes-fotos'
  AND public.is_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'pacientes-fotos'
  AND public.is_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "pacientes_fotos_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'pacientes-fotos'
  AND public.is_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);