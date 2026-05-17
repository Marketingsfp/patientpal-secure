
-- Helper: Title Case in pt-BR (simples: primeira letra de cada palavra maiúscula)
DO $$
DECLARE
  r record;
  canonical_id uuid;
  canonical_name text;
BEGIN
  -- Para cada nome normalizado (lower), escolher 1 id canônico (o mais antigo via menor id texto) e migrar refs
  FOR r IN
    SELECT lower(nome) AS key, array_agg(id ORDER BY id) AS ids, array_agg(nome ORDER BY id) AS nomes
    FROM public.especialidades
    GROUP BY lower(nome)
    HAVING count(*) > 1
  LOOP
    canonical_id := r.ids[1];
    -- Atualiza referências dos demais para o canônico
    UPDATE public.medicos SET especialidade_id = canonical_id
      WHERE especialidade_id = ANY(r.ids[2:]);
    UPDATE public.regras_rateio SET especialidade_id = canonical_id
      WHERE especialidade_id = ANY(r.ids[2:]);
    -- medico_especialidades pode causar conflito de unique; insere as que faltam e apaga as duplicadas
    INSERT INTO public.medico_especialidades (medico_id, especialidade_id)
    SELECT DISTINCT me.medico_id, canonical_id
    FROM public.medico_especialidades me
    WHERE me.especialidade_id = ANY(r.ids[2:])
    ON CONFLICT DO NOTHING;
    DELETE FROM public.medico_especialidades WHERE especialidade_id = ANY(r.ids[2:]);
    -- Apaga as duplicatas
    DELETE FROM public.especialidades WHERE id = ANY(r.ids[2:]);
  END LOOP;
END $$;

-- Normaliza nomes para Title Case (primeira letra de cada palavra em maiúscula)
UPDATE public.especialidades
SET nome = initcap(lower(nome));

-- Ajustes finos para casos comuns em português (de/da/do/dr.)
UPDATE public.especialidades SET nome = regexp_replace(nome, '\mDe\M', 'de', 'g');
UPDATE public.especialidades SET nome = regexp_replace(nome, '\mDa\M', 'da', 'g');
UPDATE public.especialidades SET nome = regexp_replace(nome, '\mDo\M', 'do', 'g');
UPDATE public.especialidades SET nome = regexp_replace(nome, '\mDr\.', 'Dr.', 'g');
