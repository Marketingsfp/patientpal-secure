-- lovable-cron-fallback-reviewed: 1440 runs/day; recuperação de conversas travadas da Nina exige detecção em até 1 minuto; o agendamento NÃO é criado por esta migração (apenas a função que o instala), e permanece desligado.
-- lovable-cron-fallback-reviewed: 1440 runs/day; recuperação de conversas travadas da Nina exige detecção em até 1 minuto; o agendamento NÃO é criado por esta migração (apenas a função que o instala), e permanece desligado.
-- Evolução aditiva da fila Nina. Aplicar NÃO ativa recuperação em produção.
-- Estados de processamento são separados do status de transporte e do modelo.
CREATE TABLE IF NOT EXISTS public.nina_watchdog_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  homologacao_ativa boolean NOT NULL DEFAULT false,
  producao_ativa boolean NOT NULL DEFAULT false,
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  lease_seconds integer NOT NULL DEFAULT 90 CHECK (lease_seconds BETWEEN 30 AND 600),
  heartbeat_stale_seconds integer NOT NULL DEFAULT 60 CHECK (heartbeat_stale_seconds BETWEEN 30 AND 300),
  processing_timeout_seconds integer NOT NULL DEFAULT 300 CHECK (processing_timeout_seconds BETWEEN 120 AND 1800),
  queued_timeout_seconds integer NOT NULL DEFAULT 30 CHECK (queued_timeout_seconds BETWEEN 5 AND 300),
  job_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.nina_watchdog_config(id) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.nina_watchdog_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nina_watchdog_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.nina_watchdog_config TO service_role;

ALTER TABLE public.whatsapp_mensagens
  ADD COLUMN IF NOT EXISTS nina_status text CHECK (nina_status IN
    ('received','queued','processing','retry_pending','completed','failed','handoff')),
  ADD COLUMN IF NOT EXISTS nina_batch_id uuid,
  ADD COLUMN IF NOT EXISTS nina_finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS nina_error text;
CREATE INDEX IF NOT EXISTS whatsapp_nina_pendentes ON public.whatsapp_mensagens(created_at)
  WHERE nina_status IN ('received','queued','processing','retry_pending');
CREATE INDEX IF NOT EXISTS whatsapp_nina_batch ON public.whatsapp_mensagens(nina_batch_id)
  WHERE nina_batch_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.nina_watchdog_proteger_estado()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF current_user NOT IN ('postgres','service_role','supabase_admin') THEN
    IF (TG_OP='INSERT' AND (NEW.nina_status IS NOT NULL OR NEW.nina_batch_id IS NOT NULL
        OR NEW.nina_finished_at IS NOT NULL OR NEW.nina_error IS NOT NULL))
      OR (TG_OP='UPDATE' AND (NEW.nina_status IS DISTINCT FROM OLD.nina_status
        OR NEW.nina_batch_id IS DISTINCT FROM OLD.nina_batch_id
        OR NEW.nina_finished_at IS DISTINCT FROM OLD.nina_finished_at
        OR NEW.nina_error IS DISTINCT FROM OLD.nina_error)) THEN
      RAISE EXCEPTION 'Estado de processamento somente pelo servidor' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER nina_00_proteger_estado BEFORE INSERT OR UPDATE ON public.whatsapp_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.nina_watchdog_proteger_estado();

ALTER TABLE public.nina_message_batches
  ADD COLUMN IF NOT EXISTS watchdog_state text CHECK (watchdog_state IN
    ('queued','processing','retry_pending','completed','failed','handoff')),
  ADD COLUMN IF NOT EXISTS watchdog_stage text NOT NULL DEFAULT 'preparing',
  ADD COLUMN IF NOT EXISTS watchdog_token uuid,
  ADD COLUMN IF NOT EXISTS processing_id uuid,
  ADD COLUMN IF NOT EXISTS watchdog_revision bigint,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS response_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS recovered_count integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS nina_watchdog_pendentes ON public.nina_message_batches(next_retry_at, created_at)
  WHERE watchdog_state IN ('queued','processing','retry_pending');

-- Checkpoints de saída associados ao lote; não é uma segunda fila de inferência.
CREATE TABLE IF NOT EXISTS public.nina_batch_entregas (
  batch_id uuid NOT NULL REFERENCES public.nina_message_batches(id),
  parte text NOT NULL CHECK (parte IN ('texto','audio')),
  clinica_id uuid NOT NULL,
  mensagem_id uuid NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  estado text NOT NULL DEFAULT 'prepared' CHECK (estado IN
    ('prepared','sending','confirmed','retry_pending','failed','uncertain')),
  attempt_count integer NOT NULL DEFAULT 0,
  transporte_id text,
  last_error text,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, parte)
);
ALTER TABLE public.nina_batch_entregas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nina_batch_entregas FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.nina_batch_entregas TO service_role;
GRANT SELECT ON public.nina_batch_entregas TO authenticated;
CREATE POLICY nina_entregas_membro ON public.nina_batch_entregas FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

CREATE OR REPLACE FUNCTION public.nina_watchdog_evento(_batch uuid, _evento text, _dados jsonb DEFAULT '{}')
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.nina_trace_eventos
    (clinica_id,trace_id,execution_id,conversation_id,message_id,node_id,event_type,started_at,finished_at,status,metadata)
  SELECT b.clinica_id,b.id::text,COALESCE(b.processing_id,b.id)::text,b.conversa_id::text,
    (SELECT i.mensagem_id::text FROM public.nina_message_batch_itens i WHERE i.batch_id=b.id ORDER BY i.ordem LIMIT 1),
    _evento,CASE WHEN _evento IN ('MODEL_FAILED','TOOL_FAILED','DELIVERY_FAILED','DELIVERY_UNCERTAIN','WATCHDOG_GAVE_UP','PROCESSING_TIMEOUT')
      THEN 'failed' WHEN _evento LIKE '%RETRY%' OR _evento='WATCHDOG_REQUEUED_JOB' THEN 'retry'
      WHEN _evento LIKE '%_STARTED' THEN 'started' ELSE 'completed' END,
    now(),now(),CASE WHEN _evento IN ('MODEL_FAILED','TOOL_FAILED','DELIVERY_FAILED','DELIVERY_UNCERTAIN','WATCHDOG_GAVE_UP','PROCESSING_TIMEOUT')
      THEN 'error' WHEN _evento LIKE '%_STARTED' THEN 'running' ELSE 'ok' END,
    jsonb_build_object('batch_id',b.id,'processing_id',b.processing_id,'attempt',b.attempt_count,
      'worker',b.watchdog_token) || _dados
  FROM public.nina_message_batches b WHERE b.id=_batch AND b.watchdog_state IS NOT NULL;
$$;

-- Aceitação e status terminal ficam no mesmo commit da entrada/encaminhamento.
-- Não ativa histórico: só entradas inseridas após habilitar o respectivo ambiente.
CREATE OR REPLACE FUNCTION public.nina_watchdog_entrada_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ativo boolean;
BEGIN
  IF TG_OP='INSERT' AND NEW.direction='in' THEN
    SELECT CASE WHEN COALESCE(NEW.is_teste,false) OR NEW.canal='test-console'
      THEN c.homologacao_ativa ELSE c.producao_ativa END INTO _ativo
      FROM public.nina_watchdog_config c WHERE c.id;
    IF _ativo THEN NEW.nina_status := 'received'; END IF;
  END IF;
  IF NEW.nina_status IN ('received','queued') AND NEW.tratada_internamente THEN
    NEW.nina_status := 'handoff'; NEW.nina_error := 'ROTEADO_PARA_FLUXO_INTERNO';
    NEW.nina_finished_at := now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER nina_watchdog_entrada BEFORE INSERT OR UPDATE OF tratada_internamente
  ON public.whatsapp_mensagens FOR EACH ROW EXECUTE FUNCTION public.nina_watchdog_entrada_trigger();

CREATE OR REPLACE FUNCTION public.nina_watchdog_item_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.whatsapp_mensagens m WHERE m.id=NEW.mensagem_id
    AND m.nina_status IS NOT NULL) THEN
    UPDATE public.nina_message_batches SET watchdog_state=COALESCE(watchdog_state,'queued')
      WHERE id=NEW.batch_id;
    UPDATE public.whatsapp_mensagens m SET nina_batch_id=NEW.batch_id,nina_status='queued'
      WHERE m.id=NEW.mensagem_id AND m.nina_status IN ('received','queued','retry_pending');
    PERFORM public.nina_watchdog_evento(NEW.batch_id,'MESSAGE_QUEUED');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER nina_watchdog_item AFTER INSERT ON public.nina_message_batch_itens
  FOR EACH ROW EXECUTE FUNCTION public.nina_watchdog_item_trigger();

CREATE OR REPLACE FUNCTION public.nina_watchdog_estado_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.watchdog_state IS NOT NULL AND NEW.watchdog_state IS DISTINCT FROM OLD.watchdog_state THEN
    UPDATE public.whatsapp_mensagens m SET nina_status=NEW.watchdog_state,
      nina_finished_at=CASE WHEN NEW.watchdog_state IN ('completed','failed','handoff') THEN now() ELSE NULL END,
      nina_error=NEW.erro_tecnico
      WHERE m.nina_batch_id=NEW.id AND m.direction='in';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER nina_watchdog_estado AFTER UPDATE ON public.nina_message_batches
  FOR EACH ROW EXECUTE FUNCTION public.nina_watchdog_estado_trigger();

CREATE OR REPLACE FUNCTION public.nina_batch_registrar(
  _clinica_id uuid, _telefone text, _conversa_id uuid, _mensagem_id uuid
) RETURNS TABLE (batch_id uuid, revision integer, first_message_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _b public.nina_message_batches%ROWTYPE;
  _aberto public.nina_message_batches%ROWTYPE;
  _ordem integer;
BEGIN
  -- Serializa registro/reagrupamento entre instâncias sem depender do cliente.
  PERFORM pg_advisory_xact_lock(hashtextextended(_clinica_id::text || ':' || _telefone, 0));
  IF NOT EXISTS (
    SELECT 1 FROM public.whatsapp_mensagens m
    WHERE m.id = _mensagem_id AND m.clinica_id = _clinica_id AND m.direction = 'in'
      AND regexp_replace(m.from_number, '[^0-9]', '', 'g') = _telefone
      AND (_conversa_id IS NULL OR m.conversa_id = _conversa_id)
  ) THEN RAISE EXCEPTION 'Entrada não pertence à conversa/clínica do lote'; END IF;

  -- A mesma mensagem física retorna o lote existente, inclusive depois de consumido.
  SELECT b.* INTO _b
  FROM public.nina_message_batches b
  JOIN public.nina_message_batch_itens i ON i.batch_id = b.id
  WHERE b.clinica_id = _clinica_id AND b.telefone = _telefone AND i.mensagem_id = _mensagem_id
  ORDER BY CASE WHEN b.status IN ('COLLECTING','PROCESSING') THEN 0 ELSE 1 END, b.created_at DESC
  LIMIT 1 FOR UPDATE OF b;
  IF FOUND THEN
    -- Uma falha ANTES do modelo pode ser retomada. Depois do início nunca é
    -- reprocessada automaticamente, mesmo que a gravação da resposta tenha falhado.
    IF _b.watchdog_state IS NULL AND _b.status = 'PROCESSING' AND _b.processamento_iniciado_em IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.nina_conversa_locks l
         WHERE l.clinica_id = _clinica_id AND l.chave = _clinica_id::text || ':' || _telefone
           AND l.liberado_em IS NULL AND l.expira_em > now()) THEN
      SELECT b.* INTO _aberto FROM public.nina_message_batches b
      WHERE b.clinica_id = _clinica_id AND b.telefone = _telefone AND b.status = 'COLLECTING'
      LIMIT 1 FOR UPDATE;
      IF FOUND THEN
        SELECT COALESCE(MAX(i.ordem), 0) INTO _ordem FROM public.nina_message_batch_itens i WHERE i.batch_id = _aberto.id;
        INSERT INTO public.nina_message_batch_itens (batch_id, mensagem_id, ordem)
          SELECT _aberto.id, i.mensagem_id, _ordem + row_number() OVER (ORDER BY i.ordem)::integer
          FROM public.nina_message_batch_itens i WHERE i.batch_id = _b.id
          ON CONFLICT ON CONSTRAINT nina_message_batch_itens_uniq DO NOTHING;
        UPDATE public.nina_message_batches b SET status = 'SUPERSEDED', processed_at = now(),
          erro_tecnico = 'Reagrupado antes do início do modelo; sem efeitos repetidos.' WHERE b.id = _b.id;
        UPDATE public.nina_message_batches b SET revision = b.revision + 1, last_message_at = now()
          WHERE b.id = _aberto.id RETURNING b.* INTO _b;
      ELSE
        UPDATE public.nina_message_batches b SET status = 'COLLECTING', claimed_at = NULL,
          revision = b.revision + 1, erro_tecnico = 'Retomada de preparação interrompida antes do modelo.'
          WHERE b.id = _b.id RETURNING b.* INTO _b;
      END IF;
    END IF;
    batch_id := _b.id; revision := _b.revision; first_message_at := _b.first_message_at;
    RETURN NEXT; RETURN;
  END IF;

  SELECT b.* INTO _b FROM public.nina_message_batches b
    WHERE b.clinica_id = _clinica_id AND b.telefone = _telefone AND b.status = 'COLLECTING'
    FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.nina_message_batches (clinica_id, telefone, conversa_id)
      VALUES (_clinica_id, _telefone, _conversa_id) RETURNING * INTO _b;
  END IF;
  UPDATE public.nina_message_batches b SET revision = b.revision + 1,
      last_message_at = now(), conversa_id = COALESCE(_conversa_id, b.conversa_id)
    WHERE b.id = _b.id RETURNING b.* INTO _b;
  SELECT COALESCE(MAX(i.ordem), 0) + 1 INTO _ordem FROM public.nina_message_batch_itens i WHERE i.batch_id = _b.id;
  INSERT INTO public.nina_message_batch_itens (batch_id, mensagem_id, ordem)
    VALUES (_b.id, _mensagem_id, _ordem)
    ON CONFLICT ON CONSTRAINT nina_message_batch_itens_uniq DO NOTHING;
  batch_id := _b.id; revision := _b.revision; first_message_at := _b.first_message_at;
  RETURN NEXT;
END;
$$;


-- A chave/token são fencing tokens. Heartbeat recente protege lease nominal vencido.
-- Bloqueia lote novo enquanto o predecessor rastreado ainda precisa de conclusão.
CREATE OR REPLACE FUNCTION public.nina_lock_adquirir(
  _chave text,_clinica_id uuid,_conversa_id uuid DEFAULT NULL,_batch_id uuid DEFAULT NULL,_lease_segundos integer DEFAULT 90
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _token uuid:=gen_random_uuid(); _ok uuid; _c public.nina_watchdog_config%ROWTYPE;
BEGIN
  SELECT * INTO _c FROM public.nina_watchdog_config WHERE id;
  IF EXISTS(SELECT 1 FROM public.nina_message_batches WHERE id=_batch_id AND watchdog_state IS NOT NULL) THEN
    _lease_segundos := _c.lease_seconds;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_chave,0));
  IF _batch_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.nina_message_batches antigo JOIN public.nina_message_batches alvo ON alvo.id=_batch_id
    WHERE antigo.clinica_id=_clinica_id AND antigo.telefone=alvo.telefone AND antigo.id<>alvo.id
      AND antigo.watchdog_state IN ('queued','processing','retry_pending')
      AND (antigo.created_at,antigo.id)<(alvo.created_at,alvo.id)
  ) THEN RETURN NULL; END IF;
  INSERT INTO public.nina_conversa_locks(chave,clinica_id,conversa_id,token,batch_id,adquirido_em,expira_em,liberado_em,updated_at)
    VALUES(_chave,_clinica_id,_conversa_id,_token,_batch_id,now(),
      now()+make_interval(secs=>GREATEST(_lease_segundos,5)),NULL,now())
  ON CONFLICT(chave) DO UPDATE SET token=EXCLUDED.token,clinica_id=EXCLUDED.clinica_id,
    conversa_id=COALESCE(EXCLUDED.conversa_id,nina_conversa_locks.conversa_id),batch_id=EXCLUDED.batch_id,
    adquirido_em=now(),expira_em=EXCLUDED.expira_em,liberado_em=NULL,updated_at=now()
  WHERE nina_conversa_locks.liberado_em IS NOT NULL OR
    (nina_conversa_locks.expira_em<=now() AND (
      NOT EXISTS(SELECT 1 FROM public.nina_message_batches b WHERE b.id=nina_conversa_locks.batch_id AND b.watchdog_state IS NOT NULL)
      OR nina_conversa_locks.updated_at<now()-make_interval(secs=>_c.heartbeat_stale_seconds)))
  RETURNING token INTO _ok;
  RETURN _ok;
END;
$$;

CREATE OR REPLACE FUNCTION public.nina_watchdog_iniciar(_batch uuid,_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _b public.nina_message_batches%ROWTYPE; _c public.nina_watchdog_config%ROWTYPE;
BEGIN
  SELECT * INTO _c FROM public.nina_watchdog_config WHERE id;
  SELECT * INTO _b FROM public.nina_message_batches WHERE id=_batch FOR UPDATE;
  IF _b.watchdog_state IS NULL THEN RETURN NULL; END IF;
  IF _b.watchdog_state IN ('completed','failed','handoff') THEN RAISE EXCEPTION 'NINA_TERMINAL'; END IF;
  PERFORM 1 FROM public.nina_conversa_locks l WHERE l.batch_id=_batch AND l.token=_token
    AND l.liberado_em IS NULL AND l.expira_em>now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NINA_RESERVA_TURNO_PERDIDA'; END IF;
  IF _b.watchdog_token IS DISTINCT FROM _token THEN
    IF _b.attempt_count>=_c.max_attempts THEN RAISE EXCEPTION 'NINA_MAX_ATTEMPTS'; END IF;
    UPDATE public.nina_message_batches SET watchdog_state='processing',watchdog_token=_token,
      processing_id=gen_random_uuid(),attempt_count=attempt_count+1,
      processamento_iniciado_em=COALESCE(processamento_iniciado_em,now()),
      watchdog_revision=CASE WHEN response_snapshot IS NULL THEN public.nina_revisao_atual(clinica_id,telefone) ELSE watchdog_revision END,
      processing_deadline=now()+make_interval(secs=>_c.processing_timeout_seconds),next_retry_at=NULL
      WHERE id=_batch RETURNING * INTO _b;
    PERFORM public.nina_watchdog_evento(_batch,'PROCESSING_STARTED');
    PERFORM public.nina_watchdog_evento(_batch,'LOCK_ACQUIRED');
  END IF;
  RETURN jsonb_build_object('batchId',_b.id,'processingId',_b.processing_id,'attempt',_b.attempt_count,
    'snapshot',_b.response_snapshot,'stage',_b.watchdog_stage,'deadline',_b.processing_deadline,'maxAttempts',_c.max_attempts);
END;
$$;

CREATE OR REPLACE FUNCTION public.nina_batch_iniciar_processamento(_batch_id uuid,_chave text,_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _b public.nina_message_batches%ROWTYPE; _n integer;
BEGIN
  SELECT * INTO _b FROM public.nina_message_batches WHERE id=_batch_id FOR UPDATE;
  PERFORM 1 FROM public.nina_conversa_locks l WHERE l.chave=_chave AND l.token=_token
    AND l.batch_id=_batch_id AND l.liberado_em IS NULL AND l.expira_em>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.nina_message_batches SET processamento_iniciado_em=now()
    WHERE id=_batch_id AND status='PROCESSING' AND processamento_iniciado_em IS NULL;
  GET DIAGNOSTICS _n=ROW_COUNT;
  IF _n=1 AND _b.watchdog_state IS NOT NULL THEN PERFORM public.nina_watchdog_iniciar(_batch_id,_token); END IF;
  RETURN _n=1;
END;
$$;

CREATE OR REPLACE FUNCTION public.nina_watchdog_checkpoint(_batch uuid,_token uuid,_etapa text,_snapshot jsonb DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _b public.nina_message_batches%ROWTYPE;
BEGIN
  SELECT * INTO _b FROM public.nina_message_batches WHERE id=_batch FOR UPDATE;
  IF _b.watchdog_state IS NULL THEN RETURN true; END IF;
  IF _b.watchdog_token IS DISTINCT FROM _token OR _b.watchdog_state<>'processing'
    OR _b.processing_deadline<=now() THEN RETURN false; END IF;
  PERFORM 1 FROM public.nina_conversa_locks l WHERE l.batch_id=_batch AND l.token=_token
    AND l.liberado_em IS NULL AND l.expira_em>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF _etapa NOT IN ('preparing','generating','generated','delivery','sending','sent') THEN
    RAISE EXCEPTION 'Etapa inválida'; END IF;
  UPDATE public.nina_message_batches SET watchdog_stage=_etapa,
    response_snapshot=COALESCE(_snapshot,response_snapshot) WHERE id=_batch;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.nina_lock_renovar(_chave text,_token uuid,_lease_segundos integer DEFAULT 90)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _n integer; _batch uuid;
BEGIN
  UPDATE public.nina_conversa_locks l SET expira_em=now()+make_interval(secs=>CASE
    WHEN EXISTS(SELECT 1 FROM public.nina_message_batches b WHERE b.id=l.batch_id AND b.watchdog_state IS NOT NULL)
    THEN (SELECT lease_seconds FROM public.nina_watchdog_config WHERE id) ELSE GREATEST(_lease_segundos,5) END),updated_at=now()
  WHERE l.chave=_chave AND l.token=_token AND l.liberado_em IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.nina_message_batches b WHERE b.id=l.batch_id
      AND b.watchdog_state IS NOT NULL AND (b.watchdog_state IN ('completed','failed','handoff')
        OR b.processing_deadline<=now() OR (b.watchdog_token IS NOT NULL AND b.watchdog_token<>_token)))
  RETURNING l.batch_id INTO _batch;
  GET DIAGNOSTICS _n=ROW_COUNT;
  IF _n>0 THEN PERFORM public.nina_watchdog_evento(_batch,'HEARTBEAT'); END IF;
  RETURN _n>0;
END;
$$;

CREATE OR REPLACE FUNCTION public.nina_watchdog_finalizar(_batch uuid,_token uuid,_estado text,_erro text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _b public.nina_message_batches%ROWTYPE;
BEGIN
  SELECT * INTO _b FROM public.nina_message_batches WHERE id=_batch FOR UPDATE;
  IF _b.watchdog_state IS NULL THEN RETURN false; END IF;
  IF _b.watchdog_token IS DISTINCT FROM _token OR _b.watchdog_state<>'processing' THEN RETURN false; END IF;
  PERFORM 1 FROM public.nina_conversa_locks l WHERE l.batch_id=_batch AND l.token=_token AND l.liberado_em IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF _estado NOT IN ('completed','failed','handoff','retry_pending') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
  IF _estado='handoff' AND NOT EXISTS(SELECT 1 FROM public.atend_conversas c WHERE c.id=_b.conversa_id
    AND c.clinica_id=_b.clinica_id AND (c.owner_type IN ('HUMAN','NONE') OR c.atribuida_user_id IS NOT NULL)) THEN
    _estado:='failed'; _erro:='HANDOFF_NOT_CONFIRMED'; END IF;
  IF _estado='completed' AND (NOT EXISTS(SELECT 1 FROM public.nina_batch_entregas e WHERE e.batch_id=_batch
        AND (e.parte='texto' OR e.payload->>'integral'='true'))
      OR EXISTS(SELECT 1 FROM public.nina_batch_entregas e WHERE e.batch_id=_batch AND e.estado<>'confirmed')) THEN
    RAISE EXCEPTION 'NINA_ENTREGA_NAO_COMPROVADA'; END IF;
  IF _estado='failed' AND _b.processing_deadline<=now() THEN
    _erro:='PROCESSING_TIMEOUT'; PERFORM public.nina_watchdog_evento(_batch,'PROCESSING_TIMEOUT');
  END IF;
  UPDATE public.nina_message_batches SET watchdog_state=_estado,erro_tecnico=left(_erro,500),
    processed_at=CASE WHEN _estado='retry_pending' THEN NULL ELSE now() END,
    status=CASE WHEN _estado='retry_pending' THEN 'PROCESSING' WHEN _estado='completed' THEN 'PROCESSED' ELSE 'SUPERSEDED' END,
    next_retry_at=CASE WHEN _estado='retry_pending' THEN GREATEST(now()+interval '5 seconds',
      (SELECT max(e.next_retry_at) FROM public.nina_batch_entregas e WHERE e.batch_id=_batch)) ELSE NULL END
    WHERE id=_batch;
  PERFORM public.nina_watchdog_evento(_batch,CASE WHEN _estado='completed' THEN 'PROCESSING_COMPLETED'
    WHEN _estado='failed' THEN 'WATCHDOG_GAVE_UP' ELSE upper(_estado) END,
    jsonb_build_object('reason',left(_erro,100)));
  RETURN true;
END;
$$;

-- Mantém compatibilidade do chamador antigo, mas não inventa PROCESSED após erro.
CREATE OR REPLACE FUNCTION public.nina_batch_concluir_seguro(
  _batch_id uuid,_chave text,_token uuid,_execucao_id uuid DEFAULT NULL,_status text DEFAULT 'PROCESSED',_erro text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _b public.nina_message_batches%ROWTYPE; _n integer;
BEGIN
  SELECT * INTO _b FROM public.nina_message_batches WHERE id=_batch_id FOR UPDATE;
  IF _b.watchdog_state IS NOT NULL THEN
    IF _b.watchdog_state IN ('completed','failed','handoff','retry_pending') THEN RETURN true; END IF;
    -- Ausência de conclusão explícita é falha observável, nunca entrega presumida.
    RETURN public.nina_watchdog_finalizar(_batch_id,_token,'failed',COALESCE(_erro,'CONCLUSAO_SEM_COMPROVANTE'));
  END IF;
  PERFORM 1 FROM public.nina_conversa_locks l WHERE l.chave=_chave AND l.token=_token
    AND l.batch_id=_batch_id AND l.liberado_em IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.nina_message_batches SET status=CASE WHEN _status='SUPERSEDED' THEN 'SUPERSEDED' ELSE 'PROCESSED' END,
    processed_at=now(),execucao_id=COALESCE(_execucao_id,execucao_id),erro_tecnico=left(_erro,500)
    WHERE id=_batch_id AND status='PROCESSING';
  GET DIAGNOSTICS _n=ROW_COUNT; RETURN _n=1;
END;
$$;

-- Lotes novos pertencem ao watchdog; a recuperação oportunista só trata legados.
CREATE OR REPLACE FUNCTION public.nina_batch_recuperar_travados(_clinica_id uuid,_telefone text,_idade_segundos integer DEFAULT 120)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _n integer;
BEGIN
  UPDATE public.nina_message_batches b SET status='SUPERSEDED',processed_at=now(),
    erro_tecnico='Execução legada sem conclusão confirmada; revisão manual necessária.'
    WHERE b.clinica_id=_clinica_id AND b.telefone=_telefone AND b.status='PROCESSING'
      AND b.watchdog_state IS NULL AND b.processamento_iniciado_em IS NOT NULL
      AND b.claimed_at<now()-make_interval(secs=>GREATEST(_idade_segundos,30))
      AND NOT EXISTS(SELECT 1 FROM public.nina_conversa_locks l WHERE l.chave=_clinica_id::text||':'||_telefone
        AND l.liberado_em IS NULL AND l.expira_em>now());
  GET DIAGNOSTICS _n=ROW_COUNT; RETURN _n;
END;
$$;

-- Claim/recovery inteiro na transação. Lock por conversa vem ANTES do row lock,
-- igual ao registro. Duas varreduras não conseguem recuperar o mesmo lote.
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
    IF _b.attempt_count>=_c.max_attempts THEN _e:='MAX_ATTEMPTS';
    ELSIF EXISTS(SELECT 1 FROM public.nina_batch_entregas e WHERE e.batch_id=_id AND e.estado IN ('sending','uncertain')) THEN _e:='DELIVERY_OUTCOME_UNKNOWN';
    ELSIF _b.watchdog_stage='generating' AND _b.response_snapshot IS NULL THEN _e:='GENERATION_OUTCOME_UNKNOWN';
    END IF;
    IF _e IS NOT NULL THEN
      UPDATE public.nina_message_batches SET watchdog_state='failed',status='SUPERSEDED',
        processed_at=now(),erro_tecnico=_e WHERE id=_id;
      PERFORM public.nina_watchdog_evento(_id,'WATCHDOG_GAVE_UP',jsonb_build_object('reason',_e));
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

-- Persistência da resposta + chave de envio na MESMA transação.
CREATE OR REPLACE FUNCTION public.nina_watchdog_entrega_preparar(_batch uuid,_token uuid,_parte text,_payload jsonb)
RETURNS public.nina_batch_entregas LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _b public.nina_message_batches%ROWTYPE; _e public.nina_batch_entregas%ROWTYPE; _msg uuid:=gen_random_uuid();
BEGIN
  IF NOT public.nina_watchdog_checkpoint(_batch,_token,'delivery') THEN RAISE EXCEPTION 'NINA_RESERVA_TURNO_PERDIDA'; END IF;
  SELECT * INTO _b FROM public.nina_message_batches WHERE id=_batch FOR UPDATE;
  SELECT * INTO _e FROM public.nina_batch_entregas WHERE batch_id=_batch AND parte=_parte FOR UPDATE;
  IF FOUND THEN
    -- Mídia pode ser reuploadada; texto e tipo da resposta ficam imutáveis.
    IF _e.payload->>'texto' IS DISTINCT FROM _payload->>'texto' OR _e.payload->>'tipo' IS DISTINCT FROM _payload->>'tipo'
      OR _e.payload->>'canal' IS DISTINCT FROM _payload->>'canal' THEN RAISE EXCEPTION 'DELIVERY_PAYLOAD_CHANGED'; END IF;
    RETURN _e;
  END IF;
  IF _payload->>'canal' NOT IN ('whatsapp','test-console') OR COALESCE(_payload->>'texto','')='' THEN
    RAISE EXCEPTION 'INVALID_DELIVERY_PAYLOAD'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.whatsapp_mensagens m WHERE m.nina_batch_id=_batch
    AND (COALESCE(m.is_teste,false) OR m.canal='test-console')=(_payload->>'canal'='test-console')) THEN
    RAISE EXCEPTION 'DELIVERY_CHANNEL_MISMATCH'; END IF;
  INSERT INTO public.whatsapp_mensagens(id,clinica_id,conversa_id,canal,wa_message_id,direction,
    from_number,to_number,body,tipo,transcricao,media_mime,status,enviada_por,execucao_id,is_teste)
  VALUES(_msg,_b.clinica_id,_b.conversa_id,_payload->>'canal','nina:'||_batch::text||':'||_parte,'out',
    _payload->>'from',_b.telefone,_payload->>'texto',_payload->>'tipo',_payload->>'transcricao',
    _payload->>'mime','pending','nina',NULLIF(_payload->>'execucaoId','')::uuid,_payload->>'canal'='test-console');
  INSERT INTO public.nina_batch_entregas(batch_id,parte,clinica_id,mensagem_id,payload)
    VALUES(_batch,_parte,_b.clinica_id,_msg,_payload) RETURNING * INTO _e;
  PERFORM public.nina_watchdog_evento(_batch,'RESPONSE_CREATED');
  RETURN _e;
END;
$$;

CREATE OR REPLACE FUNCTION public.nina_watchdog_entrega_claim(_batch uuid,_token uuid,_parte text)
RETURNS public.nina_batch_entregas LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _e public.nina_batch_entregas%ROWTYPE; _max integer;
BEGIN
  IF NOT public.nina_watchdog_checkpoint(_batch,_token,'sending') THEN RAISE EXCEPTION 'NINA_RESERVA_TURNO_PERDIDA'; END IF;
  SELECT max_attempts INTO _max FROM public.nina_watchdog_config WHERE id;
  UPDATE public.nina_batch_entregas SET estado='sending',attempt_count=attempt_count+1,updated_at=now()
    WHERE batch_id=_batch AND parte=_parte AND estado IN ('prepared','retry_pending')
      AND attempt_count<_max AND (next_retry_at IS NULL OR next_retry_at<=now()) RETURNING * INTO _e;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM public.nina_watchdog_evento(_batch,'DELIVERY_STARTED',jsonb_build_object('part',_parte,'delivery_attempt',_e.attempt_count));
  RETURN _e;
END;
$$;

CREATE OR REPLACE FUNCTION public.nina_watchdog_entrega_resultado(
  _batch uuid,_token uuid,_parte text,_estado text,_transporte_id text DEFAULT NULL,_erro text DEFAULT NULL,_retry_ms integer DEFAULT 0
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _e public.nina_batch_entregas%ROWTYPE; _max integer;
BEGIN
  -- ACK tardio do MESMO token pode ser registrado mesmo após deadline; nunca autoriza um POST novo.
  PERFORM 1 FROM public.nina_message_batches b WHERE b.id=_batch AND b.watchdog_token=_token FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO _e FROM public.nina_batch_entregas WHERE batch_id=_batch AND parte=_parte FOR UPDATE;
  IF NOT FOUND OR _e.estado NOT IN ('sending','uncertain') THEN RETURN false; END IF;
  IF _estado NOT IN ('confirmed','retry_pending','failed','uncertain') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
  IF _estado='confirmed' AND _e.payload->>'canal'='whatsapp' AND COALESCE(_transporte_id,'')='' THEN
    RAISE EXCEPTION 'DELIVERY_MISSING_RECEIPT'; END IF;
  SELECT max_attempts INTO _max FROM public.nina_watchdog_config WHERE id;
  IF _estado='retry_pending' AND _e.attempt_count>=_max THEN _estado:='failed'; _erro:='DELIVERY_MAX_ATTEMPTS'; END IF;
  UPDATE public.nina_batch_entregas SET estado=_estado,transporte_id=COALESCE(_transporte_id,transporte_id),
    last_error=_erro,updated_at=now(),next_retry_at=CASE WHEN _estado='retry_pending'
      THEN now()+make_interval(secs=>GREATEST(1,LEAST(_retry_ms,60000))/1000.0) ELSE NULL END
    WHERE batch_id=_batch AND parte=_parte;
  UPDATE public.whatsapp_mensagens SET status=CASE WHEN _estado='confirmed' THEN 'sent' ELSE 'failed' END,
    wa_message_id=COALESCE(_transporte_id,wa_message_id) WHERE id=_e.mensagem_id;
  PERFORM public.nina_watchdog_evento(_batch,CASE WHEN _estado='confirmed' THEN 'DELIVERY_CONFIRMED'
    ELSE 'DELIVERY_'||upper(_estado) END,jsonb_build_object('part',_parte,'channel',_e.payload->>'canal','reason',_erro));
  RETURN true;
END;
$$;

-- Prova de saída dos caminhos já existentes (mídia/protocolo), sem novo envio.
-- Com lote, exige o ID do aviso que o núcleo salvou no snapshot do próprio turno.
CREATE OR REPLACE FUNCTION public.nina_watchdog_vincular_saida(
  _entrada uuid,_saida uuid,_batch uuid DEFAULT NULL,_token uuid DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _m public.whatsapp_mensagens%ROWTYPE; _s public.whatsapp_mensagens%ROWTYPE;
  _b public.nina_message_batches%ROWTYPE; _teste boolean;
BEGIN
  IF _batch IS NOT NULL THEN
    IF NOT public.nina_watchdog_checkpoint(_batch,_token,'sent') THEN RETURN false; END IF;
    SELECT * INTO _b FROM public.nina_message_batches WHERE id=_batch;
    IF _b.response_snapshot#>>'{auditoria,resultado,avisoExistente,mensagemId}' IS DISTINCT FROM _saida::text THEN RETURN false; END IF;
  END IF;
  SELECT * INTO _m FROM public.whatsapp_mensagens WHERE id=_entrada FOR UPDATE;
  IF NOT FOUND OR _m.direction<>'in' OR _m.nina_status IS NULL THEN RETURN false; END IF;
  IF _batch IS DISTINCT FROM _m.nina_batch_id THEN RETURN false; END IF;
  SELECT * INTO _s FROM public.whatsapp_mensagens WHERE id=_saida;
  IF NOT FOUND OR _s.direction<>'out' OR _s.clinica_id<>_m.clinica_id
    OR _s.conversa_id IS DISTINCT FROM _m.conversa_id OR _s.enviada_por<>'nina'
    OR _s.created_at<_m.created_at OR _s.status NOT IN ('sent','delivered','read') THEN RETURN false; END IF;
  _teste := COALESCE(_m.is_teste,false) OR COALESCE(_m.canal='test-console',false);
  IF _teste IS DISTINCT FROM (COALESCE(_s.is_teste,false) OR COALESCE(_s.canal='test-console',false)) THEN RETURN false; END IF;
  IF NOT _teste AND (COALESCE(_s.wa_message_id,'')='' OR _s.wa_message_id LIKE 'nina:%'
    OR _s.wa_message_id LIKE 'test-%') THEN RETURN false; END IF;
  IF _batch IS NOT NULL THEN
    INSERT INTO public.nina_batch_entregas(batch_id,parte,clinica_id,mensagem_id,payload,estado,transporte_id)
      VALUES(_batch,'texto',_m.clinica_id,_s.id,jsonb_build_object('texto',_s.body,'tipo',_s.tipo,
        'canal',CASE WHEN _teste THEN 'test-console' ELSE 'whatsapp' END,'existing_notice',true),
        'confirmed',CASE WHEN _teste THEN NULL ELSE _s.wa_message_id END)
      ON CONFLICT(batch_id,parte) DO NOTHING;
    PERFORM public.nina_watchdog_evento(_batch,'DELIVERY_CONFIRMED',jsonb_build_object('existing_notice',true));
  ELSE
    IF _m.nina_status IN ('completed','handoff') THEN RETURN true; END IF;
    UPDATE public.whatsapp_mensagens SET nina_status='completed',nina_finished_at=now(),nina_error=NULL WHERE id=_entrada;
    INSERT INTO public.nina_trace_eventos(clinica_id,trace_id,execution_id,conversation_id,message_id,node_id,event_type,
      started_at,finished_at,status,metadata)
      VALUES(_m.clinica_id,_m.id::text,COALESCE(_m.execucao_id,_m.id)::text,_m.conversa_id::text,_m.id::text,'DELIVERY_CONFIRMED','completed',now(),now(),'ok',
        jsonb_build_object('outgoing_message_id',_s.id,'without_batch',true));
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.nina_watchdog_entrada_evento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.nina_status IS NOT NULL AND (TG_OP='INSERT' OR NEW.nina_status IS DISTINCT FROM OLD.nina_status) THEN
    IF TG_OP='INSERT' OR NEW.nina_batch_id IS NULL THEN
      INSERT INTO public.nina_trace_eventos(clinica_id,trace_id,execution_id,conversation_id,message_id,node_id,event_type,
        started_at,finished_at,status,metadata)
        VALUES(NEW.clinica_id,NEW.id::text,COALESCE(NEW.execucao_id,NEW.id)::text,NEW.conversa_id::text,NEW.id::text,
          CASE WHEN TG_OP='INSERT' THEN 'MESSAGE_RECEIVED' ELSE 'PROCESSING_'||upper(NEW.nina_status) END,
          CASE WHEN NEW.nina_status='failed' THEN 'failed' ELSE 'completed' END,now(),now(),
          CASE WHEN NEW.nina_status='failed' THEN 'error' ELSE 'ok' END,
          jsonb_build_object('state',NEW.nina_status,'reason',NEW.nina_error));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER nina_watchdog_entrada_evento AFTER INSERT OR UPDATE OF nina_status ON public.whatsapp_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.nina_watchdog_entrada_evento();

-- A execução de carga guarda se nasceu com rastreio, inclusive quando nenhuma entrada persistiu.
ALTER TABLE public.nina_teste_carga ADD COLUMN IF NOT EXISTS watchdog_ativo boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.nina_watchdog_carga_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.watchdog_ativo IS DISTINCT FROM OLD.watchdog_ativo
    AND current_user NOT IN ('postgres','service_role','supabase_admin') THEN
    RAISE EXCEPTION 'Estado de processamento somente pelo servidor' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' THEN
    IF current_user NOT IN ('postgres','service_role','supabase_admin') THEN NEW.watchdog_ativo:=false;
    ELSE SELECT homologacao_ativa INTO NEW.watchdog_ativo FROM public.nina_watchdog_config WHERE id; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER nina_watchdog_carga BEFORE INSERT OR UPDATE OF watchdog_ativo ON public.nina_teste_carga
  FOR EACH ROW EXECUTE FUNCTION public.nina_watchdog_carga_trigger();

-- Funções novas são exclusivamente server-side.
DO $$ DECLARE _f record; BEGIN
  FOR _f IN SELECT p.oid::regprocedure AS assinatura FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'nina_watchdog_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',_f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',_f.assinatura);
  END LOOP;
END $$;

INSERT INTO public.sistema_job_tokens(nome,token)
  VALUES('nina-watchdog',replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''))
  ON CONFLICT DO NOTHING;
-- Instalação explícita do job: nem migration nem deploy ativam produção.
CREATE OR REPLACE FUNCTION public.nina_watchdog_configurar_job(_url text,_ativo boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF _ativo AND (_url IS NULL OR _url !~ '^https://[^/]+/api/public/nina/watchdog$') THEN
    RAISE EXCEPTION 'URL HTTPS do watchdog inválida'; END IF;
  UPDATE public.nina_watchdog_config SET job_url=_url,updated_at=now() WHERE id;
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='nina-watchdog-processamento';
    IF _ativo THEN
      PERFORM cron.schedule('nina-watchdog-processamento','* * * * *',$cmd$
        SELECT net.http_post(url:=(SELECT job_url FROM public.nina_watchdog_config WHERE id),
          headers:=jsonb_build_object('Content-Type','application/json','x-job-token',
            (SELECT token FROM public.sistema_job_tokens WHERE nome='nina-watchdog')),
          body:='{}'::jsonb,timeout_milliseconds:=(SELECT (processing_timeout_seconds+lease_seconds)*1000 FROM public.nina_watchdog_config WHERE id))
      $cmd$);
    END IF;
  ELSIF _ativo THEN RAISE EXCEPTION 'pg_cron não disponível'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.nina_watchdog_configurar_job(text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nina_watchdog_configurar_job(text,boolean) TO service_role;