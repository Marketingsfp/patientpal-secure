-- 1) Ampliar CHECK para incluir 'imagem'
ALTER TABLE public.procedimentos
  DROP CONSTRAINT IF EXISTS procedimentos_tipo_procedimento_check;

ALTER TABLE public.procedimentos
  ADD CONSTRAINT procedimentos_tipo_procedimento_check
  CHECK (
    tipo_procedimento IS NULL OR tipo_procedimento = ANY (ARRAY[
      'consulta'::text,
      'exame'::text,
      'laboratorio'::text,
      'imagem'::text,
      'procedimento'::text,
      'cirurgia'::text,
      'equipamento'::text,
      'vacina'::text,
      'telemedicina'::text
    ])
  );

-- 2) Backfill best-effort — só onde ainda está NULL

-- 2a) Imagem
UPDATE public.procedimentos
   SET tipo_procedimento = 'imagem'
 WHERE tipo_procedimento IS NULL
   AND (
        lower(nome) ~ '(raio[- ]?x|\mrx\M|tomograf|ultrass|\musg\M|ressonan|mamograf|densitomet)'
   );

-- 2b) Laboratório
UPDATE public.procedimentos
   SET tipo_procedimento = 'laboratorio'
 WHERE tipo_procedimento IS NULL
   AND (
        lower(coalesce(grupo,'')) LIKE '%laborat%'
     OR lower(nome) ~ '(hemograma|glicemia|colesterol|triglicer|urina|fezes|\mcoleta\M|tsh|t3|t4|creatinina|ureia|hormon)'
   );
