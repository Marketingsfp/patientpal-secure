CREATE OR REPLACE VIEW public.v_pacientes_duplicados_suspeitos AS
WITH base AS (
  SELECT p.id, p.clinica_id, p.nome, p.data_nascimento, p.created_at,
         regexp_replace(coalesce(p.cpf, ''), '\D', '', 'g')      AS cpf_num,
         regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g') AS tel_num
    FROM public.pacientes p
   WHERE p.ativo
), por_cpf AS (
  SELECT b.clinica_id, 'cpf'::text AS tipo, b.cpf_num AS chave,
         array_agg(b.id ORDER BY b.created_at) AS ids, count(*) AS qtd
    FROM base b
   WHERE length(b.cpf_num) = 11
     AND b.cpf_num !~ '^(\d)\1{10}$'
   GROUP BY b.clinica_id, b.cpf_num
  HAVING count(*) > 1
), por_tel AS (
  SELECT b.clinica_id, 'telefone'::text AS tipo, b.tel_num AS chave,
         array_agg(b.id ORDER BY b.created_at) AS ids, count(*) AS qtd
    FROM base b
   WHERE length(b.tel_num) BETWEEN 10 AND 11
     AND b.tel_num !~ '^(\d)\1+$'
     AND b.tel_num !~ '^0'
   GROUP BY b.clinica_id, b.tel_num
  HAVING count(*) > 1
), por_nome_dn AS (
  SELECT b.clinica_id, 'nome_dn'::text AS tipo,
         upper(strip_accents(b.nome)) || '|' || b.data_nascimento::text AS chave,
         array_agg(b.id ORDER BY b.created_at) AS ids, count(*) AS qtd
    FROM base b
   WHERE b.data_nascimento IS NOT NULL
   GROUP BY b.clinica_id, upper(strip_accents(b.nome)), b.data_nascimento
  HAVING count(*) > 1
)
SELECT * FROM por_cpf
UNION ALL SELECT * FROM por_tel
UNION ALL SELECT * FROM por_nome_dn;