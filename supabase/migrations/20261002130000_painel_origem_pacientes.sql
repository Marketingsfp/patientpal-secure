-- ===========================================================================
-- Painel Executivo — aba "Origem dos pacientes" (02/10/2026)
--
-- Cria UMA funcao nova, so de leitura. Nao apaga nem altera nenhum dado.
--
-- Responde de onde vem quem foi atendido no periodo: quantos pacientes sao de
-- fora de Sao Joao de Meriti, quantos atendimentos eles somam, ranking de
-- cidades e bairros, e a lista nominal (fora da cidade + sem endereco).
--
-- Regras:
-- - "Atendido" e a mesma definicao do card Compareceram de
--   painel_executivo_periodo: realizado, com horario de execucao, ou pago;
--   exames de laboratorio do mesmo paciente no mesmo dia contam como um.
-- - A cidade vem do cadastro do paciente, com as grafias da mesma cidade
--   juntadas ("SAO JOAO DE", "SJM", "MERETI"...). Sem cidade, usa a faixa do
--   CEP (so Sao Joao de Meriti 25500-25599 e Rio 20000-23799, conferidas
--   contra o cadastro em 02/10/2026: cidade e faixa batem em >99%).
-- - Sem cidade e sem CEP valido: grupo "sem_endereco", mostrado a parte —
--   nao se adivinha a cidade.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.painel_origem_pacientes(
  p_clinica uuid,
  p_ini timestamp with time zone,
  p_fim timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '60s'
AS $fn$
DECLARE
  v_resultado jsonb;
BEGIN
  IF NOT public.is_member(auth.uid(), p_clinica) THEN
    RETURN NULL;
  END IF;

  WITH
  proc AS (
    SELECT DISTINCT ON (chave) chave, cat
    FROM (
      SELECT lower(btrim(unaccent(pr.nome))) AS chave,
             CASE lower(btrim(coalesce(pr.tipo_procedimento, '')))
               WHEN 'laboratorio'  THEN 'laboratorio'
               WHEN 'imagem'       THEN 'imagem'
               WHEN 'exame'        THEN 'imagem'
               WHEN 'equipamento'  THEN 'imagem'
               WHEN 'consulta'     THEN 'consulta'
               WHEN 'procedimento' THEN 'procedimento'
               WHEN 'cirurgia'     THEN 'cirurgia'
               ELSE 'outro'
             END AS cat
      FROM public.procedimentos pr
      WHERE pr.clinica_id = p_clinica
        AND pr.ativo
        AND coalesce(btrim(pr.nome), '') <> ''
    ) t
    ORDER BY chave, (cat = 'outro'), cat
  ),
  lab_med AS (
    SELECT DISTINCT me.medico_id
    FROM public.medico_especialidades me
    JOIN public.especialidades e ON e.id = me.especialidade_id
    WHERE lower(coalesce(e.nome, '')) LIKE '%laborat%'
  ),
  -- Atendido de verdade: mesma definicao de painel_executivo_periodo
  -- (Compareceram) — realizado, com horario de execucao, ou pago.
  ags AS (
    SELECT a.id, a.paciente_id, a.medico_id, a.procedimento,
           (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date AS dia
    FROM public.agendamentos a
    WHERE a.clinica_id = p_clinica
      AND a.inicio >= p_ini
      AND a.inicio <= p_fim
      AND a.paciente_id IS NOT NULL
      AND (a.status::text = 'realizado'
           OR a.executado_em IS NOT NULL
           OR EXISTS (
             SELECT 1 FROM public.fin_lancamentos l
             WHERE l.agendamento_id = a.id
               AND l.tipo = 'receita'
               AND l.status = 'confirmado'
           ))
  ),
  cat_ag AS (
    SELECT s.id, min(s.pri) AS pri
    FROM (
      SELECT a.id,
             CASE coalesce(nullif(p1.cat, 'outro'), nullif(p2.cat, 'outro'), 'outro')
               WHEN 'cirurgia'     THEN 1
               WHEN 'imagem'       THEN 2
               WHEN 'procedimento' THEN 3
               WHEN 'consulta'     THEN 4
               WHEN 'laboratorio'  THEN 5
               ELSE 6
             END AS pri
      FROM ags a
      CROSS JOIN LATERAL regexp_split_to_table(a.procedimento, '\s+\+\s+') AS x(parte)
      LEFT JOIN proc p1
        ON p1.chave = lower(btrim(unaccent(x.parte)))
      LEFT JOIN proc p2
        ON p2.chave = lower(btrim(unaccent(regexp_replace(x.parte, '\s*\([^()]*\)\s*$', ''))))
      WHERE a.procedimento IS NOT NULL
        AND a.procedimento <> ''
        AND btrim(x.parte) <> ''
    ) s
    GROUP BY s.id
  ),
  -- Exames de laboratorio do mesmo paciente no mesmo dia contam como um
  -- atendimento so, igual ao card Compareceram.
  por_paciente AS (
    SELECT a.paciente_id,
           count(DISTINCT CASE
             WHEN (CASE WHEN a.procedimento IS NOT NULL AND a.procedimento <> ''
                          THEN coalesce(c.pri, 6) = 5
                        ELSE a.medico_id IN (SELECT medico_id FROM lab_med) END)
               THEN 'lab|' || a.dia::text
             ELSE a.id::text
           END) AS atendimentos
    FROM ags a
    LEFT JOIN cat_ag c ON c.id = a.id
    GROUP BY a.paciente_id
  ),
  -- Cidade normalizada: sem acento, maiuscula, espacos simples; "NULL"
  -- digitado vira vazio.
  pac AS (
    SELECT pp.paciente_id, pp.atendimentos,
           p.nome, p.cpf, p.cep,
           nullif(regexp_replace(upper(btrim(unaccent(coalesce(p.bairro, '')))), '\s+', ' ', 'g'), '') AS bairro,
           nullif(nullif(regexp_replace(upper(btrim(unaccent(coalesce(p.cidade, '')))), '\s+', ' ', 'g'), ''), 'NULL') AS cid_txt,
           CASE WHEN length(regexp_replace(coalesce(p.cep, ''), '\D', '', 'g')) = 8
                THEN regexp_replace(p.cep, '\D', '', 'g') END AS cep8
    FROM por_paciente pp
    JOIN public.pacientes p ON p.id = pp.paciente_id
  ),
  -- Junta as grafias da mesma cidade. Bairros digitados no campo cidade
  -- viram a cidade a que pertencem. Sem cidade, usa a faixa do CEP
  -- (so as faixas de Sao Joao de Meriti e do Rio, conferidas no banco).
  cls AS (
    SELECT pac.*,
           CASE
             WHEN cid_txt IS NULL AND cep8 IS NULL THEN NULL
             WHEN cid_txt IS NULL AND cep8 BETWEEN '25500000' AND '25599999' THEN 'SAO JOAO DE MERITI'
             WHEN cid_txt IS NULL AND cep8 BETWEEN '20000000' AND '23799999' THEN 'RIO DE JANEIRO'
             WHEN cid_txt IS NULL THEN 'OUTRA CIDADE (SO CEP)'
             WHEN cid_txt IN ('SJM', 'SAO JOAO', 'AGOSTINHO PORTO')
               OR cid_txt LIKE 'SAO JOAO DE%'
               OR cid_txt LIKE 'SAO JOAO M%'
               OR cid_txt LIKE '%MERITI%'
               OR cid_txt LIKE '%MERETI%' THEN 'SAO JOAO DE MERITI'
             WHEN cid_txt LIKE 'RIO DE JAN%' OR cid_txt LIKE 'RIO DE JEN%'
               OR cid_txt = 'RI DE JANEIRO'
               OR cid_txt IN ('PAVUNA', 'IRAJA', 'ACARI', 'ANCHIETA', 'COSTA BARROS')
               THEN 'RIO DE JANEIRO'
             WHEN cid_txt LIKE 'DUQUE DE C%' THEN 'DUQUE DE CAXIAS'
             ELSE cid_txt
           END AS cidade
    FROM pac
  ),
  grp AS (
    SELECT cls.*,
           CASE WHEN cidade IS NULL THEN 'sem_endereco'
                WHEN cidade = 'SAO JOAO DE MERITI' THEN 'local'
                ELSE 'fora' END AS grupo
    FROM cls
  ),
  tot AS (
    SELECT count(*) AS pacientes,
           coalesce(sum(atendimentos), 0) AS atendimentos,
           count(*) FILTER (WHERE grupo = 'fora') AS fora_pacientes,
           coalesce(sum(atendimentos) FILTER (WHERE grupo = 'fora'), 0) AS fora_atendimentos,
           count(*) FILTER (WHERE grupo = 'local') AS local_pacientes,
           coalesce(sum(atendimentos) FILTER (WHERE grupo = 'local'), 0) AS local_atendimentos,
           count(*) FILTER (WHERE grupo = 'sem_endereco') AS sem_end_pacientes,
           coalesce(sum(atendimentos) FILTER (WHERE grupo = 'sem_endereco'), 0) AS sem_end_atendimentos
    FROM grp
  ),
  por_cidade AS (
    SELECT cidade, count(*) AS pacientes, sum(atendimentos) AS atendimentos
    FROM grp WHERE grupo = 'fora'
    GROUP BY cidade
  ),
  por_bairro AS (
    SELECT coalesce(bairro, 'BAIRRO NAO INFORMADO') AS bairro, cidade,
           count(*) AS pacientes, sum(atendimentos) AS atendimentos
    FROM grp WHERE grupo = 'fora'
    GROUP BY 1, 2
  )
  SELECT jsonb_build_object(
    'totais', to_jsonb(tot),
    'cidades', coalesce((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.atendimentos DESC, c.cidade)
      FROM por_cidade c), '[]'::jsonb),
    'bairros', coalesce((
      SELECT jsonb_agg(to_jsonb(b) ORDER BY b.atendimentos DESC, b.bairro)
      FROM (SELECT * FROM por_bairro ORDER BY atendimentos DESC, bairro LIMIT 30) b), '[]'::jsonb),
    'pacientes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', g.paciente_id, 'nome', g.nome, 'cpf', g.cpf,
               'bairro', g.bairro, 'cidade', g.cidade, 'cep', g.cep,
               'atendimentos', g.atendimentos, 'grupo', g.grupo)
             ORDER BY g.atendimentos DESC, g.nome)
      FROM grp g WHERE g.grupo <> 'local'), '[]'::jsonb)
  )
  INTO v_resultado
  FROM tot;

  RETURN v_resultado;
END;
$fn$;

REVOKE ALL ON FUNCTION public.painel_origem_pacientes(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.painel_origem_pacientes(uuid, timestamptz, timestamptz) TO authenticated;
