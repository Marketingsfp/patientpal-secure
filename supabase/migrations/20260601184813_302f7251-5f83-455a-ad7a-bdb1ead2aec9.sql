-- 1) Add especialidade_id (nullable) and surrogate id PK so we can repeat (medico, procedimento) for different specialties
ALTER TABLE public.medico_procedimentos
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.medico_procedimentos
  ADD COLUMN IF NOT EXISTS especialidade_id uuid NULL
  REFERENCES public.especialidades(id) ON DELETE SET NULL;

-- Replace PK with surrogate id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'medico_procedimentos_pkey'
      AND conrelid = 'public.medico_procedimentos'::regclass
  ) THEN
    ALTER TABLE public.medico_procedimentos DROP CONSTRAINT medico_procedimentos_pkey;
  END IF;
END$$;

ALTER TABLE public.medico_procedimentos ADD PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS medico_procedimentos_unique
  ON public.medico_procedimentos (medico_id, procedimento_id, especialidade_id)
  NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_medico_proc_esp
  ON public.medico_procedimentos (medico_id, especialidade_id);

-- 2) Backfill: expand each existing row into one row per matching specialty (medic's specialty that the procedure is linked to via grupo or procedimento_especialidades).
INSERT INTO public.medico_procedimentos (medico_id, procedimento_id, especialidade_id, created_at)
SELECT DISTINCT mp.medico_id, mp.procedimento_id, e.id, now()
FROM public.medico_procedimentos mp
JOIN public.procedimentos p ON p.id = mp.procedimento_id
JOIN public.medico_especialidades me ON me.medico_id = mp.medico_id
JOIN public.especialidades e ON e.id = me.especialidade_id
WHERE mp.especialidade_id IS NULL
  AND (
    upper(translate(coalesce(p.grupo,''),
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
    = upper(translate(coalesce(e.nome,''),
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
    OR EXISTS (
      SELECT 1 FROM public.procedimento_especialidades pe
      WHERE pe.procedimento_id = p.id AND pe.especialidade_id = e.id
    )
  )
ON CONFLICT DO NOTHING;

-- 3) Delete legacy NULL rows where we now have a per-specialty replacement
DELETE FROM public.medico_procedimentos mp
WHERE mp.especialidade_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.medico_procedimentos mp2
    WHERE mp2.medico_id = mp.medico_id
      AND mp2.procedimento_id = mp.procedimento_id
      AND mp2.especialidade_id IS NOT NULL
  );