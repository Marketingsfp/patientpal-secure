-- Regra autorizada: resumos derivados duram sete dias. Mensagens, agenda e
-- eventos de auditoria permanecem intactos. Funciona também sem navegador aberto.
BEGIN;

ALTER TABLE public.atend_handoff_resumos
  ADD COLUMN IF NOT EXISTS atendimento_inicio timestamptz;

CREATE OR REPLACE FUNCTION public.atend_resumo_inicio_atendimento(
  _clinica_id uuid, _conversa_id uuid, _ate timestamptz
) RETURNS timestamptz LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT greatest(c.created_at,
    (SELECT max(e.created_at) FROM public.atend_conversa_eventos e
     WHERE e.clinica_id = _clinica_id AND e.conversa_id = c.id
       AND e.evento IN ('REABERTA', 'IA_MEMORIA_RESETADA') AND e.created_at <= _ate),
    CASE WHEN (c.nina_fluxo_estado->>'session_started_at')::timestamptz <= _ate
      THEN (c.nina_fluxo_estado->>'session_started_at')::timestamptz END)
  FROM public.atend_conversas c WHERE c.id = _conversa_id AND c.clinica_id = _clinica_id
$$;
REVOKE ALL ON FUNCTION public.atend_resumo_inicio_atendimento(uuid,uuid,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atend_resumo_inicio_atendimento(uuid,uuid,timestamptz) TO service_role;

UPDATE public.atend_handoff_resumos r SET atendimento_inicio =
  public.atend_resumo_inicio_atendimento(r.clinica_id, r.conversa_id, r.handoff_em)
WHERE atendimento_inicio IS NULL;
ALTER TABLE public.atend_handoff_resumos ALTER COLUMN atendimento_inicio SET NOT NULL;
CREATE INDEX IF NOT EXISTS atend_resumos_retencao_idx ON public.atend_handoff_resumos(handoff_em);

-- Defesa no banco contra retry atrasado, código antigo e geração em andamento.
CREATE OR REPLACE FUNCTION public.atend_proteger_resumo_retencao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE inicio_atual timestamptz; encerrada boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.handoff_em := OLD.handoff_em;
    NEW.atendimento_inicio := OLD.atendimento_inicio;
  ELSE
    NEW.atendimento_inicio := public.atend_resumo_inicio_atendimento(NEW.clinica_id, NEW.conversa_id, NEW.handoff_em);
  END IF;
  IF NEW.handoff_em <= statement_timestamp() - interval '7 days' THEN RETURN NULL; END IF;
  inicio_atual := public.atend_resumo_inicio_atendimento(NEW.clinica_id, NEW.conversa_id, statement_timestamp());
  SELECT c.status IN ('closed','finished') INTO encerrada FROM public.atend_conversas c
    WHERE c.id = NEW.conversa_id AND c.clinica_id = NEW.clinica_id;
  IF NEW.atendimento_inicio < inicio_atual AND NEW.situacao = 'active' THEN
    NEW.situacao := 'archived';
  END IF;
  IF NEW.desfecho = 'conversa_resolvida' OR (encerrada AND NEW.atendimento_inicio = inicio_atual) THEN
    NEW.desfecho := 'conversa_resolvida';
    IF NEW.payload IS NOT NULL THEN
      NEW.payload := NEW.payload || jsonb_build_object('pendencias','[]'::jsonb,
        'proxima_acao',NULL,'ultima_pergunta',NULL,'etapa_interrompida',NULL,
        'situacao','Atendimento encerrado pela equipe.');
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.atend_proteger_resumo_retencao() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER atend_resumos_retencao_guard
  BEFORE INSERT OR UPDATE ON public.atend_handoff_resumos
  FOR EACH ROW EXECUTE FUNCTION public.atend_proteger_resumo_retencao();

-- Serializa a criação: a limpeza não reinicia versões nem duplica o resumo vigente.
CREATE OR REPLACE FUNCTION public.atend_reservar_resumo(
  _clinica_id uuid, _conversa_id uuid, _handoff_em timestamptz,
  _motivo text DEFAULT NULL, _desfecho text DEFAULT 'handoff_humano', _resolvido_por uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE existente uuid; proxima integer; inicio timestamptz;
BEGIN
  IF _handoff_em <= statement_timestamp() - interval '7 days' OR _handoff_em > statement_timestamp() THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_conversa_id::text, 714));
  inicio := public.atend_resumo_inicio_atendimento(_clinica_id,_conversa_id,_handoff_em);
  IF inicio IS NULL OR inicio < public.atend_resumo_inicio_atendimento(_clinica_id,_conversa_id,statement_timestamp()) THEN RETURN NULL; END IF;
  SELECT id INTO existente FROM public.atend_handoff_resumos
    WHERE clinica_id=_clinica_id AND conversa_id=_conversa_id AND handoff_em=_handoff_em;
  IF existente IS NOT NULL THEN RETURN existente; END IF;
  -- Um handoff antigo não pode superar um desfecho posterior já registrado.
  IF EXISTS(SELECT 1 FROM public.atend_handoff_resumos WHERE conversa_id=_conversa_id AND handoff_em>_handoff_em) THEN RETURN NULL; END IF;
  SELECT greatest(
    coalesce((SELECT max(versao) FROM public.atend_handoff_resumos WHERE conversa_id=_conversa_id),0),
    coalesce((SELECT max((detalhes->>'versao')::integer) FROM public.atend_conversa_eventos
      WHERE conversa_id=_conversa_id AND clinica_id=_clinica_id AND evento='RESUMO_IA_GERADO'
        AND detalhes->>'versao' ~ '^[0-9]{1,9}$'),0)) + 1 INTO proxima;
  UPDATE public.atend_handoff_resumos SET situacao='superseded'
    WHERE conversa_id=_conversa_id AND clinica_id=_clinica_id AND situacao='active';
  INSERT INTO public.atend_handoff_resumos(clinica_id,conversa_id,handoff_em,atendimento_inicio,motivo,versao,status,situacao,desfecho,resolvido_por)
    VALUES(_clinica_id,_conversa_id,_handoff_em,inicio,_motivo,proxima,'gerando','active',_desfecho,_resolvido_por)
    RETURNING id INTO existente;
  RETURN existente;
END $$;
REVOKE ALL ON FUNCTION public.atend_reservar_resumo(uuid,uuid,timestamptz,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atend_reservar_resumo(uuid,uuid,timestamptz,text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.atend_limpar_pendencias_resolvidas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status IN ('closed','finished') AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.atend_handoff_resumos SET desfecho='conversa_resolvida',
      resolvido_em=coalesce(NEW.resolved_at,NEW.closed_at,statement_timestamp()), resolvido_por=NEW.resolved_by
    WHERE conversa_id=NEW.id AND clinica_id=NEW.clinica_id
      AND atendimento_inicio=public.atend_resumo_inicio_atendimento(NEW.clinica_id,NEW.id,statement_timestamp());
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.atend_limpar_pendencias_resolvidas() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER atend_resumo_resolvido
  AFTER UPDATE OF status ON public.atend_conversas
  FOR EACH ROW EXECUTE FUNCTION public.atend_limpar_pendencias_resolvidas();

CREATE OR REPLACE FUNCTION public.atend_expurgar_resumos_vencidos()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE quantidade integer;
BEGIN
  DELETE FROM public.atend_handoff_resumos WHERE handoff_em <= statement_timestamp() - interval '7 days';
  GET DIAGNOSTICS quantidade = ROW_COUNT;
  -- Cópia operacional legada; mensagens originais e eventos não são alterados.
  UPDATE public.atend_conversas SET handoff_resumo=NULL
    WHERE handoff_resumo IS NOT NULL AND handoff_em <= statement_timestamp() - interval '7 days';
  RETURN quantidade;
END $$;
REVOKE ALL ON FUNCTION public.atend_expurgar_resumos_vencidos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atend_expurgar_resumos_vencidos() TO service_role;

SELECT public.atend_expurgar_resumos_vencidos();
-- Saneia também resumos recentes que já estavam resolvidos antes da implantação.
UPDATE public.atend_handoff_resumos SET payload=payload WHERE payload IS NOT NULL;
SELECT cron.schedule('nina-resumos-retencao-7-dias','* * * * *','SELECT public.atend_expurgar_resumos_vencidos()');
NOTIFY pgrst, 'reload schema';
COMMIT;
