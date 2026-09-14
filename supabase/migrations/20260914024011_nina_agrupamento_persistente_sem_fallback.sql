-- Nina / WhatsApp / OS ZAP: consumo persistido; nenhuma alteração em outros módulos.
-- Marcador anterior ao modelo impede repetir efeitos quando o resultado é incerto.
ALTER TABLE public.nina_message_batches
  ADD COLUMN IF NOT EXISTS processamento_iniciado_em timestamptz,
  ADD COLUMN IF NOT EXISTS erro_tecnico text;

-- Workers antigos não tinham marcador. Não presumir que um PROCESSING
-- anterior a esta migração ainda não chamou o modelo.
UPDATE public.nina_message_batches b SET processamento_iniciado_em = COALESCE(b.claimed_at, now()),
  erro_tecnico = COALESCE(b.erro_tecnico, 'Execução anterior ao controle de início; não repetir automaticamente.')
WHERE b.status = 'PROCESSING' AND b.processamento_iniciado_em IS NULL;

-- Cada entrada física avança a revisão uma única vez, inclusive se o servidor
-- perder a resposta da RPC e receber o mesmo evento novamente.
ALTER TABLE public.whatsapp_mensagens ADD COLUMN IF NOT EXISTS nina_revisao_conversa bigint;
CREATE OR REPLACE FUNCTION public.nina_proteger_revisao_entrada()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    IF (TG_OP = 'INSERT' AND NEW.nina_revisao_conversa IS NOT NULL)
      OR (TG_OP = 'UPDATE' AND NEW.nina_revisao_conversa IS DISTINCT FROM OLD.nina_revisao_conversa) THEN
      RAISE EXCEPTION 'A revisão da entrada Nina só pode ser registrada pelo servidor' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS nina_proteger_revisao_entrada ON public.whatsapp_mensagens;
CREATE TRIGGER nina_proteger_revisao_entrada
  BEFORE INSERT OR UPDATE OF nina_revisao_conversa ON public.whatsapp_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.nina_proteger_revisao_entrada();
REVOKE ALL ON FUNCTION public.nina_proteger_revisao_entrada() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nina_proteger_revisao_entrada() TO service_role;

CREATE OR REPLACE FUNCTION public.nina_revisao_registrar_entrada(
  _clinica_id uuid, _telefone text, _mensagem_id uuid
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.whatsapp_mensagens%ROWTYPE; _rev bigint;
BEGIN
  SELECT m.* INTO _m FROM public.whatsapp_mensagens m
    WHERE m.id = _mensagem_id AND m.clinica_id = _clinica_id AND m.direction = 'in'
      AND regexp_replace(m.from_number, '[^0-9]', '', 'g') = _telefone
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entrada não pertence à clínica/telefone da revisão'; END IF;
  IF _m.nina_revisao_conversa IS NOT NULL THEN RETURN _m.nina_revisao_conversa; END IF;
  _rev := public.nina_revisao_incrementar(_clinica_id, _telefone, _m.conversa_id);
  UPDATE public.whatsapp_mensagens m SET nina_revisao_conversa = _rev WHERE m.id = _mensagem_id;
  RETURN _rev;
END;
$$;
REVOKE ALL ON FUNCTION public.nina_revisao_registrar_entrada(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nina_revisao_registrar_entrada(uuid,text,uuid) TO service_role;

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
    IF _b.status = 'PROCESSING' AND _b.processamento_iniciado_em IS NULL
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

CREATE OR REPLACE FUNCTION public.nina_batch_reivindicar(
  _batch_id uuid, _revision integer, _forcar boolean DEFAULT false
) RETURNS TABLE (reivindicado boolean, mensagens uuid[], revision integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _b public.nina_message_batches%ROWTYPE;
BEGIN
  SELECT b.* INTO _b FROM public.nina_message_batches b WHERE b.id = _batch_id FOR UPDATE;
  IF NOT FOUND OR _b.status <> 'COLLECTING' OR (NOT _forcar AND _b.revision <> _revision) THEN
    reivindicado := false; mensagens := ARRAY[]::uuid[]; revision := COALESCE(_b.revision, 0);
    RETURN NEXT; RETURN;
  END IF;
  UPDATE public.nina_message_batches b SET status = 'PROCESSING', claimed_at = now(), erro_tecnico = NULL
    WHERE b.id = _batch_id RETURNING b.* INTO _b;
  SELECT COALESCE(ARRAY_AGG(i.mensagem_id ORDER BY m.created_at, i.ordem, i.mensagem_id), ARRAY[]::uuid[])
    INTO mensagens FROM public.nina_message_batch_itens i
    JOIN public.whatsapp_mensagens m ON m.id = i.mensagem_id AND m.clinica_id = _b.clinica_id
    WHERE i.batch_id = _batch_id;
  reivindicado := true; revision := _b.revision; RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.nina_batch_iniciar_processamento(_batch_id uuid, _chave text, _token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  PERFORM 1 FROM public.nina_conversa_locks l WHERE l.chave = _chave AND l.token = _token
    AND l.batch_id = _batch_id AND l.liberado_em IS NULL AND l.expira_em > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.nina_message_batches b SET processamento_iniciado_em = now()
    WHERE b.id = _batch_id AND b.status = 'PROCESSING' AND b.processamento_iniciado_em IS NULL;
  GET DIAGNOSTICS _n = ROW_COUNT; RETURN _n = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.nina_batch_concluir_seguro(
  _batch_id uuid, _chave text, _token uuid, _execucao_id uuid DEFAULT NULL,
  _status text DEFAULT 'PROCESSED', _erro text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  PERFORM 1 FROM public.nina_conversa_locks l WHERE l.chave = _chave AND l.token = _token
    AND l.batch_id = _batch_id AND l.liberado_em IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.nina_message_batches b
    SET status = CASE WHEN _status = 'SUPERSEDED' THEN 'SUPERSEDED' ELSE 'PROCESSED' END,
        processed_at = now(), execucao_id = COALESCE(_execucao_id, b.execucao_id), erro_tecnico = left(_erro, 500)
    WHERE b.id = _batch_id AND b.status = 'PROCESSING';
  GET DIAGNOSTICS _n = ROW_COUNT; RETURN _n = 1;
END;
$$;

-- Não recolocar PROCESSING em COLLECTING depois de uma geração possivelmente
-- ter produzido efeitos. A mensagem e seu motivo permanecem para auditoria.
CREATE OR REPLACE FUNCTION public.nina_batch_recuperar_travados(
  _clinica_id uuid, _telefone text, _idade_segundos integer DEFAULT 120
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  UPDATE public.nina_message_batches b SET status = 'SUPERSEDED', processed_at = now(),
    erro_tecnico = 'Execução iniciada sem conclusão confirmada; revisar antes de repetir. Nenhum reenvio automático.'
  WHERE b.clinica_id = _clinica_id AND b.telefone = _telefone AND b.status = 'PROCESSING'
    AND b.processamento_iniciado_em IS NOT NULL
    AND b.claimed_at < now() - make_interval(secs => GREATEST(_idade_segundos, 30))
    AND NOT EXISTS (SELECT 1 FROM public.nina_conversa_locks l
      WHERE l.chave = _clinica_id::text || ':' || _telefone AND l.clinica_id = _clinica_id
      AND l.liberado_em IS NULL AND l.expira_em > now());
  GET DIAGNOSTICS _n = ROW_COUNT; RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.nina_batch_registrar(uuid,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nina_batch_reivindicar(uuid,integer,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nina_batch_recuperar_travados(uuid,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nina_batch_iniciar_processamento(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nina_batch_concluir_seguro(uuid,text,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nina_batch_registrar(uuid,text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.nina_batch_reivindicar(uuid,integer,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.nina_batch_recuperar_travados(uuid,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.nina_batch_iniciar_processamento(uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.nina_batch_concluir_seguro(uuid,text,uuid,uuid,text,text) TO service_role;
