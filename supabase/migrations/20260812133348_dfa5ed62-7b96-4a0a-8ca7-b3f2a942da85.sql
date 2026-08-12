CREATE OR REPLACE VIEW public.v_pacientes_duplicados_suspeitos AS
WITH base AS (
  SELECT p.id, p.clinica_id, p.nome, p.data_nascimento, p.created_at,
         regexp_replace(COALESCE(p.cpf, ''), '\D', '', 'g') AS cpf_num,
         regexp_replace(COALESCE(p.telefone, ''), '\D', '', 'g') AS tel_num
    FROM pacientes p
   WHERE p.ativo
), base_tel AS (
  SELECT b.*, upper(strip_accents(b.nome)) AS nome_key
    FROM base b
   WHERE length(b.tel_num) BETWEEN 10 AND 11
     AND b.tel_num !~ '^(\d)\1+$'
     AND b.tel_num !~ '^0'
     -- descarta números "de mentirinha": após o DDD, todos os dígitos iguais
     AND substr(b.tel_num, 3) !~ '^(\d)\1+$'
     AND b.tel_num NOT IN ('00000000000','000000000','11111111111','99999999999','12345678901','21000000000')
), por_cpf AS (
  SELECT b.clinica_id, 'cpf'::text AS tipo, b.cpf_num AS chave,
         array_agg(b.id ORDER BY b.created_at) AS ids, count(*) AS qtd
    FROM base b
   WHERE length(b.cpf_num) = 11 AND b.cpf_num !~ '^(\d)\1{10}$'
   GROUP BY b.clinica_id, b.cpf_num
  HAVING count(*) > 1
), por_nome_dn AS (
  SELECT b.clinica_id, 'nome_dn'::text AS tipo,
         upper(strip_accents(b.nome)) || '|' || b.data_nascimento::text AS chave,
         array_agg(b.id ORDER BY b.created_at) AS ids, count(*) AS qtd
    FROM base b
   WHERE b.data_nascimento IS NOT NULL
   GROUP BY b.clinica_id, upper(strip_accents(b.nome)), b.data_nascimento
  HAVING count(*) > 1
), tel_nome AS (
  SELECT b.clinica_id, b.tel_num AS chave,
         array_agg(b.id ORDER BY b.created_at) AS ids, count(*) AS qtd
    FROM base_tel b
   GROUP BY b.clinica_id, b.tel_num, b.nome_key
  HAVING count(*) > 1
), tel_dn AS (
  SELECT b.clinica_id, b.tel_num AS chave,
         array_agg(b.id ORDER BY b.created_at) AS ids, count(*) AS qtd
    FROM base_tel b
   WHERE b.data_nascimento IS NOT NULL
   GROUP BY b.clinica_id, b.tel_num, b.data_nascimento
  HAVING count(*) > 1
), por_tel AS (
  SELECT DISTINCT clinica_id, 'telefone'::text AS tipo, chave, ids, qtd
    FROM (SELECT * FROM tel_nome UNION ALL SELECT * FROM tel_dn) u
)
SELECT clinica_id, tipo, chave, ids, qtd FROM por_cpf
UNION ALL
SELECT clinica_id, tipo, chave, ids, qtd FROM por_tel
UNION ALL
SELECT clinica_id, tipo, chave, ids, qtd FROM por_nome_dn;