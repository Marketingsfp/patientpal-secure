ALTER TABLE public.medico_especialidades
  ADD COLUMN IF NOT EXISTS tem_rqe boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rqe_numero text;

ALTER TABLE public.medico_especialidades
  DROP CONSTRAINT IF EXISTS medico_especialidades_rqe_numero_len;
ALTER TABLE public.medico_especialidades
  ADD CONSTRAINT medico_especialidades_rqe_numero_len
  CHECK (rqe_numero IS NULL OR length(rqe_numero) <= 50);

GRANT SELECT (tem_rqe, rqe_numero), INSERT (tem_rqe, rqe_numero), UPDATE (tem_rqe, rqe_numero)
  ON public.medico_especialidades TO authenticated;

-- Backfill a partir de medicos.rqes (JSON array of { especialidade_id, numero })
UPDATE public.medico_especialidades me
   SET tem_rqe = true,
       rqe_numero = LEFT(r->>'numero', 50)
  FROM public.medicos m,
       LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(m.rqes) = 'array' THEN m.rqes ELSE '[]'::jsonb END
       ) AS r
 WHERE me.medico_id = m.id
   AND (r->>'especialidade_id')::uuid = me.especialidade_id
   AND COALESCE(r->>'numero', '') <> '';