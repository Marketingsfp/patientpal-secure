-- Erro Crítico 01 (24/09/2026): quando o processo da Nina morria no meio do turno, a varredura
-- desistia em silêncio (failed/SUPERSEDED) e o paciente ficava sem resposta.
-- Regra da clínica (25/09/2026): quando a Nina falha, ela diz a MESMA frase de encaminhamento.
-- Agora a desistência devolve o lote ao servidor marcado com `HANDOFF_REQUIRED`: o servidor não gera
-- de novo, só faz o encaminhamento padrão (frase + fila humana). Vale para geração interrompida,
-- entrega incerta e tentativas esgotadas. O encaminhamento é tentado até `max_attempts` vezes;
-- depois disso fica o desfecho antigo, para nunca repetir sem fim.
CREATE OR REPLACE FUNCTION public.nina_watchdog_reivindicar(_limite integer DEFAULT 10)
RETURNS SETOF public.nina_message_batches LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _c public.nina_watchdog_config%ROWTYPE; _id uuid; _b public.nina_message_batches%ROWTYPE;
  _l public.nina_conversa_locks%ROWTYPE; _chave text; _token uuid; _e text; _n integer:=0;
BEGIN
  SELECT * INTO _c FROM public.nina_watchdog_config WHERE id;
  -- As flags controlam novas admissões. Lotes já admitidos são drenados até o terminal.
  FOR _id IN SELECT b.id FROM public.nina_message_batches b
    WHERE b.watchdog_state IN ('queued','processing','retry_pending')
      AND COALESCE(b.next_retry_at,b.last_message_at+make_interval(secs=>_c.queued_timeout_seconds))<=now()
    ORDER BY b.created_at,b.id LIMIT GREATEST(1,LEAST(_limite,100))*5
  LOOP
    SELECT * INTO _b FROM public.nina_message_batches WHERE id=_id;
    _chave:=_b.clinica_id::text||':'||_b.telefone;
    IF NOT pg_try_advisory_xact_lock(hashtextextended(_chave,0)) THEN CONTINUE; END IF;
    SELECT * INTO _b FROM public.nina_message_batches WHERE id=_id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND OR _b.watchdog_state NOT IN ('queued','processing','retry_pending') THEN CONTINUE; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.whatsapp_mensagens m WHERE m.nina_batch_id=_id AND m.nina_status IS NOT NULL) THEN CONTINUE; END IF;
    SELECT * INTO _l FROM public.nina_conversa_locks WHERE chave=_chave FOR UPDATE;
    -- Nem idade nem deadline isolados autorizam tomar a execução de worker vivo.
    IF FOUND AND _l.liberado_em IS NULL AND
      (_l.expira_em>now() OR _l.updated_at>=now()-make_interval(secs=>_c.heartbeat_stale_seconds)) THEN CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM public.nina_message_batches p WHERE p.clinica_id=_b.clinica_id
      AND p.telefone=_b.telefone AND p.watchdog_state IN ('queued','processing','retry_pending')
      AND (p.created_at,p.id)<(_b.created_at,_b.id)) THEN CONTINUE; END IF;
    -- Token proprietário diferente implica que este lote não é dono do lock encontrado.
    -- A trava de outro lote só será substituída pela aquisição canônica, nunca liberada aqui.
    IF _l.batch_id=_id AND _l.token=_b.watchdog_token AND _l.liberado_em IS NULL THEN
      UPDATE public.nina_conversa_locks SET liberado_em=now(),expira_em=now()
        WHERE chave=_chave AND token=_b.watchdog_token AND batch_id=_id AND liberado_em IS NULL;
      PERFORM public.nina_watchdog_evento(_id,'WATCHDOG_RELEASED_LOCK');
    END IF;
    PERFORM public.nina_watchdog_evento(_id,'WATCHDOG_DETECTED_STALE_JOB');
    -- O comprovante já existe: recuperar a conclusão sem repetir geração/envio.
    IF EXISTS(SELECT 1 FROM public.nina_batch_entregas e WHERE e.batch_id=_id AND e.estado='confirmed'
      AND (e.parte='texto' OR e.payload->>'integral'='true'))
      AND NOT EXISTS(SELECT 1 FROM public.nina_batch_entregas e WHERE e.batch_id=_id AND e.estado<>'confirmed') THEN
      UPDATE public.nina_message_batches SET watchdog_state='completed',status='PROCESSED',processed_at=now(),
        recovered_count=recovered_count+1,erro_tecnico=NULL WHERE id=_id;
      PERFORM public.nina_watchdog_evento(_id,'PROCESSING_COMPLETED',jsonb_build_object('recovered_from_delivery',true));
      CONTINUE;
    END IF;
    IF _b.processing_deadline<=now() THEN PERFORM public.nina_watchdog_evento(_id,'PROCESSING_TIMEOUT'); END IF;
    _e:=NULL;
    -- Encaminhamento anterior interrompido: continua sendo encaminhamento, nunca nova geração.
    IF _b.erro_tecnico LIKE 'HANDOFF_REQUIRED: %' THEN _e:=substr(_b.erro_tecnico,19);
    ELSIF _b.attempt_count>=_c.max_attempts THEN _e:='MAX_ATTEMPTS';
    ELSIF EXISTS(SELECT 1 FROM public.nina_batch_entregas e WHERE e.batch_id=_id AND e.estado IN ('sending','uncertain')) THEN _e:='DELIVERY_OUTCOME_UNKNOWN';
    ELSIF _b.watchdog_stage='generating' AND _b.response_snapshot IS NULL THEN _e:='GENERATION_OUTCOME_UNKNOWN';
    END IF;
    IF _e IS NOT NULL THEN
      IF (SELECT count(*) FROM public.nina_trace_eventos t WHERE t.trace_id=_id::text
          AND t.node_id='WATCHDOG_HANDOFF_REQUIRED')>=_c.max_attempts THEN
        -- Último recurso após esgotar os encaminhamentos: desfecho terminal, sem repetir sem fim.
        UPDATE public.nina_message_batches SET watchdog_state=CASE WHEN EXISTS(SELECT 1 FROM public.atend_conversas c
            WHERE c.id=_b.conversa_id AND c.clinica_id=_b.clinica_id
              AND (c.owner_type IN ('HUMAN','NONE') OR c.atribuida_user_id IS NOT NULL)) THEN 'handoff' ELSE 'failed' END,
          status='SUPERSEDED',processed_at=now(),erro_tecnico='HANDOFF_NOT_COMPLETED: '||_e WHERE id=_id;
        PERFORM public.nina_watchdog_evento(_id,'WATCHDOG_GAVE_UP',jsonb_build_object('reason','HANDOFF_NOT_COMPLETED: '||_e));
        CONTINUE;
      END IF;
      -- Sem geração nova: o servidor só faz o encaminhamento padrão (mesma frase + fila humana).
      _token:=public.nina_lock_adquirir(_chave,_b.clinica_id,_b.conversa_id,_id,_c.lease_seconds);
      IF _token IS NULL THEN CONTINUE; END IF;
      UPDATE public.nina_message_batches SET watchdog_state='processing',watchdog_token=_token,
        status='PROCESSING',claimed_at=now(),recovered_count=recovered_count+1,processing_id=gen_random_uuid(),
        processing_deadline=now()+make_interval(secs=>_c.processing_timeout_seconds),next_retry_at=NULL,
        erro_tecnico='HANDOFF_REQUIRED: '||_e WHERE id=_id RETURNING * INTO _b;
      PERFORM public.nina_watchdog_evento(_id,'WATCHDOG_HANDOFF_REQUIRED',jsonb_build_object('reason',_e));
      RETURN NEXT _b;
      _n:=_n+1; IF _n>=GREATEST(1,LEAST(_limite,100)) THEN EXIT; END IF;
      CONTINUE;
    END IF;
    _token:=public.nina_lock_adquirir(_chave,_b.clinica_id,_b.conversa_id,_id,_c.lease_seconds);
    IF _token IS NULL THEN CONTINUE; END IF;
    UPDATE public.nina_message_batches SET status='PROCESSING',claimed_at=now(),
      recovered_count=recovered_count+1,erro_tecnico=NULL WHERE id=_id;
    PERFORM public.nina_watchdog_iniciar(_id,_token);
    PERFORM public.nina_watchdog_evento(_id,CASE WHEN _b.response_snapshot IS NULL THEN 'WATCHDOG_REQUEUED_JOB' ELSE 'WATCHDOG_DELIVERY_RETRY' END);
    SELECT * INTO _b FROM public.nina_message_batches WHERE id=_id;
    RETURN NEXT _b;
    _n:=_n+1; IF _n>=GREATEST(1,LEAST(_limite,100)) THEN EXIT; END IF;
  END LOOP;
  -- Encaminhamento já existente: não inventar falha de IA para uma entrada de humano.
  UPDATE public.whatsapp_mensagens m SET nina_status='handoff',nina_finished_at=now(),nina_error='HUMAN_OWNER_CONFIRMED'
    WHERE m.nina_status='received' AND EXISTS(SELECT 1 FROM public.atend_conversas c
      WHERE c.id=m.conversa_id AND c.clinica_id=m.clinica_id
        AND (c.owner_type IN ('HUMAN','NONE') OR c.atribuida_user_id IS NOT NULL));
  -- Entradas aceitas que morreram antes da classificação/lote permanecem visíveis.
  UPDATE public.whatsapp_mensagens m SET nina_status='failed',nina_finished_at=now(),nina_error='ENTRY_NOT_QUEUED'
    WHERE m.nina_status='received' AND m.created_at<now()-make_interval(secs=>_c.processing_timeout_seconds);
  -- Lock sem lote: só o domínio Nina (chave clínica:telefone), owner observado,
  -- sem heartbeat e sem execução/lote ativo associado; não toca leases de carga.
  WITH orfaos AS (UPDATE public.nina_conversa_locks l SET liberado_em=now(),expira_em=now()
    WHERE l.chave LIKE l.clinica_id::text||':%' AND l.batch_id IS NOT NULL
      AND l.liberado_em IS NULL AND l.expira_em<now()
      AND l.updated_at<now()-make_interval(secs=>_c.heartbeat_stale_seconds)
      AND EXISTS(SELECT 1 FROM public.atend_conversas c WHERE c.id=l.conversa_id AND c.clinica_id=l.clinica_id
        AND CASE WHEN c.is_teste THEN _c.homologacao_ativa ELSE _c.producao_ativa END)
      AND (NOT EXISTS(SELECT 1 FROM public.nina_message_batches b WHERE b.id=l.batch_id)
        OR EXISTS(SELECT 1 FROM public.nina_message_batches b WHERE b.id=l.batch_id
          AND b.watchdog_token=l.token AND b.watchdog_state IN ('completed','failed','handoff')))
      RETURNING l.*)
  INSERT INTO public.nina_trace_eventos(clinica_id,trace_id,execution_id,conversation_id,node_id,event_type,
    started_at,finished_at,status,metadata)
  SELECT o.clinica_id,o.batch_id::text,o.token::text,o.conversa_id::text,ev.nome,'completed',now(),now(),'ok',
    jsonb_build_object('batch_id',o.batch_id,'worker',o.token,'orphan',true)
  FROM orfaos o CROSS JOIN (VALUES('WATCHDOG_DETECTED_ORPHAN_LOCK'),('WATCHDOG_RELEASED_LOCK')) ev(nome);
END;
$$;
