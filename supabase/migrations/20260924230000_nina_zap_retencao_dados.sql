-- Retenção de dados da Nina e do OS Zap (decisão do responsável em 24/09/2026).
--   * Diagnóstico técnico da Nina, resultados da homologação e reportes de erro: 7 dias.
--   * Histórico do atendimento: mensagens com mais de 3 meses; a conversa (com notas,
--     eventos, avaliações e transferências) só sai quando não tem mais nenhuma mensagem
--     e está há 3 meses sem atividade. Conversas ativas nunca são apagadas.
--   * Motor de confiança (desativado em 16/09): histórico apagado e sem novas gravações.
-- Não toca: versões (instruções, calendário, aprendizado), configuração da homologação
-- (pacientes de teste e cenários), audit_log, logs do webhook, execuções do pg_cron,
-- distribuição da fila e presença dos atendentes.
BEGIN;

-- Motor de confiança: a trava de imutabilidade protegia um histórico que deixa de existir.
DROP TRIGGER IF EXISTS nina_confianca_vinculos_imutavel_trg ON public.nina_confianca_vinculos;
DROP TRIGGER IF EXISTS nina_confianca_decisoes_no_update ON public.nina_confianca_decisoes;
DELETE FROM public.nina_confianca_vinculos;
DELETE FROM public.nina_confianca_decisoes;

-- Buscas por idade sem depender da clínica (os índices existentes começam por clinica_id).
CREATE INDEX IF NOT EXISTS idx_nina_execucoes_created_at ON public.nina_execucoes (created_at);
CREATE INDEX IF NOT EXISTS idx_nina_trace_eventos_created_at ON public.nina_trace_eventos (created_at);
CREATE INDEX IF NOT EXISTS idx_nina_kb_consultas_created_at ON public.nina_kb_consultas (created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_created_at ON public.whatsapp_mensagens (created_at);

CREATE OR REPLACE FUNCTION public.nina_zap_retencao_executar()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  agora constant timestamptz := statement_timestamp();
  diagnostico constant timestamptz := agora - interval '7 days';
  historico constant timestamptz := agora - interval '3 months';
  resultado jsonb := '{}'::jsonb;
  n integer;
BEGIN
  -- Cada etapa é independente: uma falha fica no resultado e não impede as demais.
  -- Lotes limitados por execução; o job de hora em hora drena o restante.

  -- Execuções da IA: evidências e cópias das instruções saem junto (FK em cascata).
  BEGIN
    DELETE FROM public.nina_execucoes WHERE id IN (
      SELECT id FROM public.nina_execucoes WHERE created_at < diagnostico
      ORDER BY created_at LIMIT 2000);
    GET DIAGNOSTICS n = ROW_COUNT;
    resultado := resultado || jsonb_build_object('nina_execucoes', n);
  EXCEPTION WHEN OTHERS THEN
    resultado := resultado || jsonb_build_object('nina_execucoes_erro', SQLERRM);
  END;

  -- Sobras sem execução vinculada.
  BEGIN
    DELETE FROM public.nina_execucao_evidencias WHERE execucao_id IN (
      SELECT execucao_id FROM public.nina_execucao_evidencias WHERE created_at < diagnostico
      LIMIT 2000);
    GET DIAGNOSTICS n = ROW_COUNT;
    resultado := resultado || jsonb_build_object('nina_execucao_evidencias', n);
    DELETE FROM public.nina_prompt_snapshots WHERE id IN (
      SELECT id FROM public.nina_prompt_snapshots WHERE created_at < diagnostico LIMIT 2000);
    GET DIAGNOSTICS n = ROW_COUNT;
    resultado := resultado || jsonb_build_object('nina_prompt_snapshots', n);
  EXCEPTION WHEN OTHERS THEN
    resultado := resultado || jsonb_build_object('nina_diagnostico_sobras_erro', SQLERRM);
  END;

  BEGIN
    DELETE FROM public.nina_trace_eventos WHERE id IN (
      SELECT id FROM public.nina_trace_eventos WHERE created_at < diagnostico
      ORDER BY created_at LIMIT 20000);
    GET DIAGNOSTICS n = ROW_COUNT;
    resultado := resultado || jsonb_build_object('nina_trace_eventos', n);
  EXCEPTION WHEN OTHERS THEN
    resultado := resultado || jsonb_build_object('nina_trace_eventos_erro', SQLERRM);
  END;

  BEGIN
    DELETE FROM public.nina_kb_consultas WHERE id IN (
      SELECT id FROM public.nina_kb_consultas WHERE created_at < diagnostico
      ORDER BY created_at LIMIT 5000);
    GET DIAGNOSTICS n = ROW_COUNT;
    resultado := resultado || jsonb_build_object('nina_kb_consultas', n);
  EXCEPTION WHEN OTHERS THEN
    resultado := resultado || jsonb_build_object('nina_kb_consultas_erro', SQLERRM);
  END;

  -- Lotes encerrados: entregas antes (FK sem cascata); itens saem em cascata.
  BEGIN
    WITH alvo AS (
      SELECT id FROM public.nina_message_batches
      WHERE coalesce(processed_at, created_at) < diagnostico
        AND status IN ('PROCESSED', 'SUPERSEDED')
        AND (watchdog_state IS NULL OR watchdog_state IN ('completed', 'failed', 'handoff'))
      ORDER BY created_at LIMIT 2000
    ), entregas AS (
      DELETE FROM public.nina_batch_entregas WHERE batch_id IN (SELECT id FROM alvo)
    )
    DELETE FROM public.nina_message_batches WHERE id IN (SELECT id FROM alvo);
    GET DIAGNOSTICS n = ROW_COUNT;
    resultado := resultado || jsonb_build_object('nina_message_batches', n);
  EXCEPTION WHEN OTHERS THEN
    resultado := resultado || jsonb_build_object('nina_message_batches_erro', SQLERRM);
  END;

  -- Contadores e travas por telefone sem uso há 7 dias (o próximo turno recria do zero).
  BEGIN
    DELETE FROM public.nina_conversa_revisoes WHERE updated_at < diagnostico;
    GET DIAGNOSTICS n = ROW_COUNT;
    resultado := resultado || jsonb_build_object('nina_conversa_revisoes', n);
    DELETE FROM public.nina_conversa_locks
    WHERE updated_at < diagnostico AND (liberado_em IS NOT NULL OR expira_em < agora);
    GET DIAGNOSTICS n = ROW_COUNT;
    resultado := resultado || jsonb_build_object('nina_conversa_locks', n);
  EXCEPTION WHEN OTHERS THEN
    resultado := resultado || jsonb_build_object('nina_conversa_estado_erro', SQLERRM);
  END;

  -- Homologação: só resultados encerrados. Pacientes de teste, cenários e o ciclo
  -- atual de cada paciente de teste são configuração e ficam.
  BEGIN
    DELETE FROM public.nina_carga_servidor_tarefas WHERE carga_id IN (
      SELECT id FROM public.nina_teste_carga
      WHERE status IN ('concluido', 'erro', 'parado')
        AND coalesce(finalizado_em, updated_at, created_at) < diagnostico);
    DELETE FROM public.nina_teste_carga
    WHERE status IN ('concluido', 'erro', 'parado')
      AND coalesce(finalizado_em, updated_at, created_at) < diagnostico;
    GET DIAGNOSTICS n = ROW_COUNT;
    resultado := resultado || jsonb_build_object('nina_teste_carga', n);
    DELETE FROM public.nina_teste_execucoes
    WHERE status = 'concluida' AND coalesce(finalizado_em, updated_at, created_at) < diagnostico;
    GET DIAGNOSTICS n = ROW_COUNT;
    resultado := resultado || jsonb_build_object('nina_teste_execucoes', n);
    DELETE FROM public.nina_teste_avaliacoes WHERE coalesce(updated_at, created_at) < diagnostico;
    GET DIAGNOSTICS n = ROW_COUNT;
    resultado := resultado || jsonb_build_object('nina_teste_avaliacoes', n);
    DELETE FROM public.nina_teste_simulacoes
    WHERE status IN ('concluida', 'parada')
      AND coalesce(finalizado_em, updated_at, created_at) < diagnostico;
    GET DIAGNOSTICS n = ROW_COUNT;
    resultado := resultado || jsonb_build_object('nina_teste_simulacoes', n);
    DELETE FROM public.nina_teste_ciclos c
    WHERE c.status <> 'ativo'
      AND coalesce(c.ended_at, c.resolved_at, c.updated_at, c.created_at) < diagnostico
      AND NOT EXISTS (SELECT 1 FROM public.nina_teste_leads l WHERE l.ciclo_id = c.id);
    GET DIAGNOSTICS n = ROW_COUNT;
    resultado := resultado || jsonb_build_object('nina_teste_ciclos', n);
  EXCEPTION WHEN OTHERS THEN
    resultado := resultado || jsonb_build_object('nina_teste_erro', SQLERRM);
  END;

  -- Reportes de erro de qualquer status; análises, decisões, ações, versões da
  -- correção e execuções de correção saem em cascata.
  BEGIN
    DELETE FROM public.nina_feedback_erros WHERE created_at < diagnostico;
    GET DIAGNOSTICS n = ROW_COUNT;
    resultado := resultado || jsonb_build_object('nina_feedback_erros', n);
    DELETE FROM public.nina_feedback WHERE created_at < diagnostico;
    GET DIAGNOSTICS n = ROW_COUNT;
    resultado := resultado || jsonb_build_object('nina_feedback', n);
  EXCEPTION WHEN OTHERS THEN
    resultado := resultado || jsonb_build_object('nina_feedback_erro', SQLERRM);
  END;

  -- Histórico do atendimento: mensagens antigas primeiro; a conversa só depois de
  -- ficar sem nenhuma mensagem e sem atividade há 3 meses.
  BEGIN
    DELETE FROM public.whatsapp_mensagens WHERE id IN (
      SELECT id FROM public.whatsapp_mensagens WHERE created_at < historico
      ORDER BY created_at LIMIT 5000);
    GET DIAGNOSTICS n = ROW_COUNT;
    resultado := resultado || jsonb_build_object('whatsapp_mensagens', n);
    DELETE FROM public.atend_aviso_encaminhamento WHERE created_at < historico;
    GET DIAGNOSTICS n = ROW_COUNT;
    resultado := resultado || jsonb_build_object('atend_aviso_encaminhamento', n);
    DELETE FROM public.agendamento_confirmacoes WHERE coalesce(updated_at, created_at) < historico;
    GET DIAGNOSTICS n = ROW_COUNT;
    resultado := resultado || jsonb_build_object('agendamento_confirmacoes', n);
    DELETE FROM public.atend_conversas WHERE id IN (
      SELECT c.id FROM public.atend_conversas c
      WHERE coalesce(c.ultima_msg_em, c.updated_at, c.created_at) < historico
        AND c.created_at < historico
        AND NOT EXISTS (SELECT 1 FROM public.whatsapp_mensagens m WHERE m.conversa_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM public.nina_teste_leads l WHERE l.conversa_id = c.id)
      LIMIT 1000);
    GET DIAGNOSTICS n = ROW_COUNT;
    resultado := resultado || jsonb_build_object('atend_conversas', n);
  EXCEPTION WHEN OTHERS THEN
    resultado := resultado || jsonb_build_object('historico_atendimento_erro', SQLERRM);
  END;

  RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.nina_zap_retencao_executar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nina_zap_retencao_executar() TO service_role;

DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nina-zap-retencao-dados';
    PERFORM cron.schedule('nina-zap-retencao-dados', '23 * * * *',
      'SELECT public.nina_zap_retencao_executar()');
  ELSE
    RAISE NOTICE 'pg_cron ausente: agendar nina-zap-retencao-dados manualmente';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
