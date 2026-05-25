ALTER TABLE public.medicos
  ADD COLUMN IF NOT EXISTS rqes jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Migra valor antigo (texto livre) para a nova lista, sem especialidade vinculada
UPDATE public.medicos
SET rqes = jsonb_build_array(jsonb_build_object('especialidade_id', NULL, 'especialidade_nome', rqe_especialidade, 'numero', NULL))
WHERE tem_rqe = true
  AND rqe_especialidade IS NOT NULL
  AND (rqes IS NULL OR jsonb_array_length(rqes) = 0);

GRANT SELECT (rqes), INSERT (rqes), UPDATE (rqes) ON public.medicos TO authenticated;