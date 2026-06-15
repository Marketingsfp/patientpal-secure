CREATE OR REPLACE FUNCTION public._do_merge_pacientes_dup_mj()
RETURNS TABLE(grupos integer, mesclados integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _clin uuid := '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'::uuid;
  _grupos integer;
  _mesclados integer;
BEGIN
  SET LOCAL statement_timeout = 0;
  SET LOCAL lock_timeout = 0;

  CREATE TEMP TABLE _merge_map ON COMMIT DROP AS
  WITH g AS (
    SELECT id, created_at, codigo_prontuario, codigo_prontuario_anterior,
           upper(public.strip_accents(trim(nome))) AS nome_norm, data_nascimento,
           ROW_NUMBER() OVER (
             PARTITION BY upper(public.strip_accents(trim(nome))), data_nascimento
             ORDER BY (codigo_prontuario_anterior IS NOT NULL) DESC, created_at, id
           ) AS rn,
           FIRST_VALUE(id) OVER (
             PARTITION BY upper(public.strip_accents(trim(nome))), data_nascimento
             ORDER BY (codigo_prontuario_anterior IS NOT NULL) DESC, created_at, id
           ) AS winner_id,
           COUNT(*) OVER (PARTITION BY upper(public.strip_accents(trim(nome))), data_nascimento) AS sz
    FROM public.pacientes
    WHERE clinica_id = _clin AND data_nascimento IS NOT NULL AND ativo = true
  )
  SELECT id AS loser_id, winner_id
  FROM g WHERE sz > 1 AND rn > 1;

  CREATE INDEX ON _merge_map(loser_id);
  CREATE INDEX ON _merge_map(winner_id);

  -- 1) Preencher campos vazios do vencedor com dados dos perdedores
  UPDATE public.pacientes p SET
    cpf = COALESCE(p.cpf, src.cpf),
    telefone = COALESCE(p.telefone, src.telefone),
    telefone2 = COALESCE(p.telefone2, src.telefone2),
    email = COALESCE(p.email, src.email),
    cep = COALESCE(p.cep, src.cep),
    logradouro = COALESCE(p.logradouro, src.logradouro),
    numero = COALESCE(p.numero, src.numero),
    complemento = COALESCE(p.complemento, src.complemento),
    bairro = COALESCE(p.bairro, src.bairro),
    cidade = COALESCE(p.cidade, src.cidade),
    estado = COALESCE(p.estado, src.estado),
    sexo = CASE WHEN p.sexo IS NULL OR p.sexo='nao_informar' THEN COALESCE(NULLIF(src.sexo,'nao_informar'), p.sexo) ELSE p.sexo END,
    codigo_prontuario_anterior = COALESCE(p.codigo_prontuario_anterior, src.codigo_prontuario_anterior),
    responsavel_nome = COALESCE(p.responsavel_nome, src.responsavel_nome),
    responsavel_cpf = COALESCE(p.responsavel_cpf, src.responsavel_cpf),
    responsavel_telefone = COALESCE(p.responsavel_telefone, src.responsavel_telefone),
    responsavel_parentesco = COALESCE(p.responsavel_parentesco, src.responsavel_parentesco),
    foto_url = COALESCE(p.foto_url, src.foto_url),
    updated_at = now()
  FROM (
    SELECT DISTINCT ON (m.winner_id) m.winner_id, lo.*
    FROM _merge_map m
    JOIN public.pacientes lo ON lo.id = m.loser_id
    ORDER BY m.winner_id,
      ((lo.cpf IS NOT NULL)::int + (lo.telefone IS NOT NULL)::int + (lo.email IS NOT NULL)::int + (lo.cep IS NOT NULL)::int) DESC,
      lo.created_at
  ) src
  WHERE p.id = src.winner_id;

  -- 2) Repontar FKs (tabelas com coluna paciente_id)
  UPDATE public.agendamentos        t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.alertas_enfermagem  t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.anamnese_respostas  t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.boletos             t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.contrato_dependentes t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.contratos_assinatura t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.crm_oportunidades   t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.documentos_emitidos t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.exame_resultados    t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.fin_atendimentos    t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.fin_lancamentos     t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.fin_notas_pacientes t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.lgpd_consentimentos t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.lgpd_solicitacoes   t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.mkt_envios          t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.mkt_leads           t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.nfse                t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.odonto_dentes       t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.odonto_prontuarios  t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.orcamentos          t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.pagamentos          t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.prontuarios         t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.senhas              t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.triagens_enfermagem t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;
  UPDATE public.atend_conversas     t SET contato_paciente_id = m.winner_id FROM _merge_map m WHERE t.contato_paciente_id = m.loser_id;

  -- paciente_biometria: mover só se o vencedor ainda não tem registro
  DELETE FROM public.paciente_biometria b USING _merge_map m
    WHERE b.paciente_id = m.loser_id
      AND EXISTS (SELECT 1 FROM public.paciente_biometria b2 WHERE b2.paciente_id = m.winner_id);
  UPDATE public.paciente_biometria t SET paciente_id = m.winner_id FROM _merge_map m WHERE t.paciente_id = m.loser_id;

  -- 3) Apagar perdedores
  WITH d AS (
    DELETE FROM public.pacientes p USING _merge_map m WHERE p.id = m.loser_id RETURNING 1
  ) SELECT count(*) INTO _mesclados FROM d;

  SELECT count(DISTINCT winner_id) INTO _grupos FROM _merge_map;

  RETURN QUERY SELECT _grupos, _mesclados;
END
$fn$;

REVOKE ALL ON FUNCTION public._do_merge_pacientes_dup_mj() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._do_merge_pacientes_dup_mj() TO service_role;