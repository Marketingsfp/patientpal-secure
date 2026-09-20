\set ON_ERROR_STOP on
DO $$
DECLARE clinica uuid := '00000000-0000-0000-0000-000000000010';
  antiga uuid := '00000000-0000-0000-0000-000000000001';
  recente uuid := '00000000-0000-0000-0000-000000000002';
  novo uuid; repetido uuid; instante timestamptz := statement_timestamp(); prazo timestamptz;
BEGIN
  ASSERT current_database() LIKE 'codex_resumos_retencao_test%', 'banco exclusivo de teste';
  ASSERT NOT EXISTS(SELECT 1 FROM atend_handoff_resumos WHERE conversa_id=antiga), 'resumo vencido deve ser excluído';
  ASSERT (SELECT handoff_resumo IS NULL FROM atend_conversas WHERE id=antiga), 'cópia legada vencida deve ser apagada';
  ASSERT (SELECT count(*)=1 FROM whatsapp_mensagens), 'mensagens originais preservadas';
  ASSERT (SELECT count(*)=1 FROM agendamentos), 'agenda preservada';
  ASSERT (SELECT count(*)=1 FROM atend_conversa_eventos), 'auditoria preservada';
  ASSERT public.atend_reservar_resumo(clinica,antiga,instante-interval '8 days') IS NULL, 'retry não recria vencido';
  INSERT INTO atend_handoff_resumos(clinica_id,conversa_id,handoff_em) VALUES(clinica,antiga,instante-interval '8 days');
  ASSERT NOT EXISTS(SELECT 1 FROM atend_handoff_resumos WHERE conversa_id=antiga), 'inserção legada não recria vencido';
  novo := public.atend_reservar_resumo(clinica,antiga,instante);
  repetido := public.atend_reservar_resumo(clinica,antiga,instante);
  ASSERT novo=repetido, 'reserva idempotente';
  ASSERT (SELECT versao=13 FROM atend_handoff_resumos WHERE id=novo), 'limpeza não reinicia versões';
  ASSERT (SELECT count(*)=1 FROM atend_handoff_resumos WHERE conversa_id=antiga), 'uma reserva';
  SELECT handoff_em INTO prazo FROM atend_handoff_resumos WHERE id=novo;
  UPDATE atend_handoff_resumos SET handoff_em=instante+interval '1 day' WHERE id=novo;
  ASSERT (SELECT handoff_em=prazo FROM atend_handoff_resumos WHERE id=novo), 'regenerar não estende retenção';
  UPDATE atend_conversas SET status='closed',resolved_at=instante WHERE id=recente;
  ASSERT (SELECT payload->'pendencias'='[]'::jsonb AND payload->'proxima_acao'='null'::jsonb FROM atend_handoff_resumos WHERE conversa_id=recente), 'resolução remove toda pendência sem IA';
  UPDATE atend_handoff_resumos SET payload='{"pendencias":["IA atrasada"],"proxima_acao":"IA atrasada"}' WHERE conversa_id=recente;
  ASSERT (SELECT payload->'pendencias'='[]'::jsonb FROM atend_handoff_resumos WHERE conversa_id=recente), 'geração atrasada não ressuscita pendência';
  UPDATE atend_conversas SET status='waiting',nina_fluxo_estado=jsonb_build_object('session_started_at',instante) WHERE id=recente;
  INSERT INTO atend_conversa_eventos(clinica_id,conversa_id,evento,created_at) VALUES(clinica,recente,'REABERTA',instante);
  UPDATE atend_handoff_resumos SET status='ok' WHERE conversa_id=recente;
  ASSERT (SELECT situacao='archived' FROM atend_handoff_resumos WHERE conversa_id=recente), 'geração do ciclo antigo arquivada';
  ASSERT public.atend_reservar_resumo(clinica,recente,instante-interval '1 day') IS NULL, 'handoff antigo não reativado';
  ASSERT public.atend_reservar_resumo(clinica,recente,instante) IS NOT NULL, 'novo atendimento pode ter resumo';
  ASSERT NOT has_function_privilege('authenticated','public.atend_expurgar_resumos_vencidos()','EXECUTE'), 'sem expurgo pelo cliente';
  ASSERT NOT has_function_privilege('anon','public.atend_reservar_resumo(uuid,uuid,timestamptz,text,text,uuid)','EXECUTE'), 'sem geração anônima';
  ASSERT (SELECT schedule='* * * * *' FROM cron.job WHERE jobname='nina-resumos-retencao-7-dias'), 'limpeza autônoma agendada';
  RAISE NOTICE '20 verificações SQL concluídas';
END $$;
