
-- Backup (idempotente)
UPDATE public.pacientes SET codigo_prontuario_anterior = codigo_prontuario
 WHERE codigo_prontuario_anterior IS NULL;

-- Mapa final paciente → pasta, deduplicado por (clinica, pasta), prioridade CPF
DROP TABLE IF EXISTS public._pasta_final;
CREATE TABLE public._pasta_final (
  paciente_id uuid PRIMARY KEY,
  clinica_id  uuid NOT NULL,
  pasta       text NOT NULL
);
GRANT ALL ON public._pasta_final TO service_role;
ALTER TABLE public._pasta_final ENABLE ROW LEVEL SECURITY;

WITH candidatos AS (
  SELECT p.id AS paciente_id, p.clinica_id, s.pasta, 1 AS prio,
         row_number() OVER (PARTITION BY s.cpf ORDER BY p.created_at ASC, p.id ASC) AS rn_src
    FROM public.pacientes p
    JOIN public._pasta_import_cpf s
      ON regexp_replace(coalesce(p.cpf,''),'\D','','g') = s.cpf
  UNION ALL
  SELECT p.id, p.clinica_id, s.pasta, 2 AS prio,
         row_number() OVER (PARTITION BY upper(p.nome) ORDER BY p.created_at ASC, p.id ASC)
    FROM public.pacientes p
    JOIN public._pasta_import_nome s ON s.nome = upper(p.nome)
   WHERE (p.cpf IS NULL OR p.cpf = '')
),
sel_src AS (
  -- pega o primeiro paciente por cada (origem,registro) da staging
  SELECT * FROM candidatos WHERE rn_src = 1
),
dedup_pasta AS (
  -- garante 1 pasta por clinica: prioridade CPF (prio=1), depois mais antigo
  SELECT *,
         row_number() OVER (PARTITION BY clinica_id, pasta ORDER BY prio ASC, paciente_id ASC) AS rn_p
    FROM sel_src
),
dedup_pac AS (
  -- garante 1 paciente recebe apenas 1 pasta (caso receba via CPF e NOME, fica com CPF)
  SELECT *,
         row_number() OVER (PARTITION BY paciente_id ORDER BY prio ASC, pasta ASC) AS rn_pac
    FROM dedup_pasta
   WHERE rn_p = 1
)
INSERT INTO public._pasta_final (paciente_id, clinica_id, pasta)
SELECT paciente_id, clinica_id, pasta FROM dedup_pac WHERE rn_pac = 1;

-- Deslocar conflitantes: quem ocupa pasta-alvo e não é o destinatário
UPDATE public.pacientes p
   SET codigo_prontuario = 'OLD-' || p.id::text
  FROM public._pasta_final f
 WHERE p.clinica_id = f.clinica_id
   AND p.codigo_prontuario = f.pasta
   AND p.id <> f.paciente_id;

-- Aplicar pastas restauradas
UPDATE public.pacientes p
   SET codigo_prontuario = f.pasta,
       numero_pasta      = f.pasta
  FROM public._pasta_final f
 WHERE p.id = f.paciente_id;

-- Limpeza
DROP TABLE IF EXISTS public._pasta_final;
DROP TABLE IF EXISTS public._pasta_import_cpf;
DROP TABLE IF EXISTS public._pasta_import_nome;
