
-- Mapa final só para pacientes não restaurados ainda
DROP TABLE IF EXISTS public._pasta_final2;
CREATE TABLE public._pasta_final2 (
  paciente_id uuid PRIMARY KEY,
  clinica_id  uuid NOT NULL,
  pasta       text NOT NULL
);
GRANT ALL ON public._pasta_final2 TO service_role;
ALTER TABLE public._pasta_final2 ENABLE ROW LEVEL SECURITY;

WITH cand AS (
  SELECT p.id AS paciente_id,
         p.clinica_id,
         regexp_replace(
           upper(public.unaccent(coalesce(p.nome,''))),
           '[^A-Z ]',' ','g'
         ) AS nm
    FROM public.pacientes p
   WHERE p.codigo_prontuario = p.codigo_prontuario_anterior
     AND NOT (p.codigo_prontuario LIKE 'OLD-%')
),
cand_norm AS (
  SELECT paciente_id, clinica_id,
         regexp_replace(nm, '\s+', ' ', 'g') AS nm
    FROM cand
),
joined AS (
  SELECT c.paciente_id, c.clinica_id, s.pasta, c.nm
    FROM cand_norm c
    JOIN public._pasta_import_nome2 s ON s.nome_norm = trim(c.nm)
),
-- nome deve ser único no banco (entre não restaurados)
unique_in_db AS (
  SELECT nm, clinica_id FROM cand_norm GROUP BY nm, clinica_id HAVING count(*) = 1
),
filt AS (
  SELECT j.* FROM joined j
   JOIN unique_in_db u ON u.nm = j.nm AND u.clinica_id = j.clinica_id
),
-- 1 pasta por clínica (caso por azar duas linhas diferentes apontem para mesma pasta)
dedup AS (
  SELECT *, row_number() OVER (PARTITION BY clinica_id, pasta ORDER BY paciente_id) AS rn
    FROM filt
)
INSERT INTO public._pasta_final2 (paciente_id, clinica_id, pasta)
SELECT paciente_id, clinica_id, pasta FROM dedup WHERE rn = 1;

-- Deslocar conflitantes
UPDATE public.pacientes p
   SET codigo_prontuario = 'OLD-' || p.id::text
  FROM public._pasta_final2 f
 WHERE p.clinica_id = f.clinica_id
   AND p.codigo_prontuario = f.pasta
   AND p.id <> f.paciente_id;

-- Aplicar
UPDATE public.pacientes p
   SET codigo_prontuario = f.pasta,
       numero_pasta      = f.pasta
  FROM public._pasta_final2 f
 WHERE p.id = f.paciente_id;

DROP TABLE IF EXISTS public._pasta_final2;
DROP TABLE IF EXISTS public._pasta_import_nome2;
