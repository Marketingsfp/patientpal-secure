-- Online: ativas sem limite. Pausa: fila individual até 10. Offline: sem novas.
-- Apenas esquema e funções; nenhuma conversa/presença histórica é redistribuída aqui.
ALTER TABLE public.atend_conversas ADD COLUMN fila_pendente boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.atend_conversas.fila_pendente IS
  'Reservada ao responsável em Não atribuídas; passa a ativa após resposta humana enviada.';
CREATE INDEX atend_fila_individual_idx ON public.atend_conversas (clinica_id, atribuida_user_id)
  WHERE fila_pendente AND is_teste IS NOT TRUE AND status IN ('waiting', 'active', 'in_progress');

-- O responsável continua sendo a única identidade de posse/acesso. A marca
-- distingue reserva de atendimento iniciado sem inventar outro responsável.
CREATE FUNCTION public.atend_normalizar_fila_individual() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
  IF NEW.atribuida_user_id IS NULL OR NEW.owner_type = 'AI'
     OR NEW.status NOT IN ('waiting', 'active', 'in_progress') OR NEW.is_teste IS TRUE THEN
    NEW.fila_pendente := false;
  ELSIF TG_OP = 'UPDATE' AND NEW.atribuida_user_id IS DISTINCT FROM OLD.atribuida_user_id
    AND OLD.atribuida_user_id IS NOT NULL THEN
    -- Transferência explícita encerra a reserva anterior.
    NEW.fila_pendente := false;
  END IF;
  IF NEW.fila_pendente AND (TG_OP = 'INSERT' OR NOT OLD.fila_pendente
       OR NEW.atribuida_user_id IS DISTINCT FROM OLD.atribuida_user_id) THEN
    IF NOT pg_try_advisory_xact_lock(hashtext('atend_assign:' || NEW.clinica_id::text)) THEN
      RAISE EXCEPTION 'Distribuição em andamento; tente novamente' USING ERRCODE = '40001';
    END IF;
    IF (SELECT count(*) FROM public.atend_conversas c
         WHERE c.clinica_id = NEW.clinica_id AND c.atribuida_user_id = NEW.atribuida_user_id
           AND c.id <> NEW.id AND c.fila_pendente AND c.is_teste IS NOT TRUE
           AND c.status IN ('waiting', 'active', 'in_progress')) >= 10 THEN
      RAISE EXCEPTION 'Fila individual cheia' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_atend_normalizar_fila_individual
BEFORE INSERT OR UPDATE ON public.atend_conversas
FOR EACH ROW EXECUTE FUNCTION public.atend_normalizar_fila_individual();

-- Uma fila individual não fica disponível para outro atendente por acesso
-- direto ao banco. Gestores mantêm a supervisão prevista pelas políticas atuais.
CREATE POLICY atend_fila_individual_privada ON public.atend_conversas
AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT fila_pendente OR atribuida_user_id = auth.uid() OR public.can_manage_clinica(auth.uid(), clinica_id))
WITH CHECK (NOT fila_pendente OR atribuida_user_id = auth.uid() OR public.can_manage_clinica(auth.uid(), clinica_id));


CREATE OR REPLACE FUNCTION public.atend_pool_canonico(_clinica_id uuid, _departamento_id uuid DEFAULT NULL)
RETURNS TABLE (
  user_id uuid, perfil text, estado_manual text, presence_status text,
  perfil_telefonia boolean, admin boolean, em_pausa boolean, fila_travada boolean,
  load_at_selection integer, capacidade integer, capacidade_origem text,
  ultima_atribuicao timestamptz, do_setor boolean, elegivel boolean, motivo_exclusao text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH usuarios AS (
    SELECT m.user_id FROM public.clinica_memberships m WHERE m.clinica_id = _clinica_id
    UNION
    SELECT p.user_id FROM public.atend_agente_presenca p WHERE p.clinica_id = _clinica_id
  ), base AS (
    SELECT u.user_id,
      (SELECT m.role::text FROM public.clinica_memberships m
        WHERE m.clinica_id = _clinica_id AND m.user_id = u.user_id AND m.ativo = true
        ORDER BY m.role::text LIMIT 1) AS perfil,
      p.estado_manual, p.status::text AS presence_status,
      public.atend_tem_perfil_telefonia(u.user_id, _clinica_id) AS perfil_telefonia,
      public.atend_usuario_e_admin(u.user_id, _clinica_id) AS admin,
      COALESCE(p.estado_manual = 'PAUSA', false) AS em_pausa,
      EXISTS (SELECT 1 FROM public.atend_departamento_membros dm
        WHERE dm.clinica_id = _clinica_id AND dm.user_id = u.user_id AND dm.queue_locked)
      AND NOT EXISTS (SELECT 1 FROM public.atend_departamento_membros dm
        WHERE dm.clinica_id = _clinica_id AND dm.user_id = u.user_id
          AND dm.queue_locked IS FALSE) AS fila_travada,
      (SELECT count(*)::integer FROM public.atend_conversas c
        WHERE c.clinica_id = _clinica_id AND c.atribuida_user_id = u.user_id
          AND c.is_teste IS NOT TRUE AND c.status IN ('waiting', 'active', 'in_progress')) AS carga,
      CASE WHEN p.estado_manual = 'PAUSA' THEN 10 ELSE NULL END AS capacidade,
      CASE WHEN p.estado_manual = 'PAUSA' THEN 'fila_individual' ELSE 'sem_limite' END AS capacidade_origem,
      (SELECT count(*) FROM public.atend_conversas c
       WHERE c.clinica_id = _clinica_id AND c.atribuida_user_id = u.user_id
         AND c.is_teste IS NOT TRUE AND c.fila_pendente
         AND c.status IN ('waiting', 'active', 'in_progress')) AS pendentes,
      (SELECT max(c.assigned_at) FROM public.atend_conversas c
        WHERE c.clinica_id = _clinica_id AND c.atribuida_user_id = u.user_id
          AND c.is_teste IS NOT TRUE) AS ultima_atribuicao,
      (_departamento_id IS NULL OR EXISTS (
        SELECT 1 FROM public.atend_departamento_membros dm
         WHERE dm.clinica_id = _clinica_id AND dm.user_id = u.user_id
           AND dm.departamento_id = _departamento_id)) AS do_setor
    FROM usuarios u
    LEFT JOIN public.atend_agente_presenca p ON p.clinica_id = _clinica_id AND p.user_id = u.user_id
  ), avaliado AS (
    SELECT b.*, CASE
      WHEN NOT b.perfil_telefonia THEN 'sem_perfil_telefonia'
      WHEN b.admin THEN 'admin_excluido'
      WHEN b.estado_manual IS NULL THEN 'sem_escolha_manual'
      WHEN b.estado_manual NOT IN ('ONLINE', 'PAUSA') THEN 'escolha_manual_' || lower(b.estado_manual)
      WHEN b.fila_travada THEN 'fila_bloqueada'
      WHEN b.estado_manual = 'PAUSA' AND b.pendentes >= 10 THEN 'capacidade_lotada'
      ELSE NULL END AS motivo
    FROM base b
  ), final AS (
    SELECT a.*, CASE
      WHEN a.motivo IS NOT NULL THEN a.motivo
      WHEN NOT a.do_setor AND EXISTS (SELECT 1 FROM avaliado s WHERE s.do_setor AND s.motivo IS NULL)
        THEN 'setor_incompativel'
      ELSE NULL END AS motivo_final
    FROM avaliado a
  )
  SELECT f.user_id, f.perfil, f.estado_manual, f.presence_status,
    f.perfil_telefonia, f.admin, f.em_pausa, f.fila_travada,
    f.carga, f.capacidade, f.capacidade_origem, f.ultima_atribuicao,
    f.do_setor, f.motivo_final IS NULL, f.motivo_final
  FROM final f
  ORDER BY (f.motivo_final IS NULL) DESC, f.carga ASC,
    f.ultima_atribuicao ASC NULLS FIRST, f.user_id ASC;
$function$;

CREATE OR REPLACE FUNCTION public.atend_auto_assign_conversa_interno(
  _conversa_id uuid, _clinica_id uuid, _departamento_id uuid DEFAULT NULL,
  _origem text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _conv record;
  _cand record;
  _atual record;
  _presenca uuid;
  _avaliacao jsonb;
  _handoff_evento_id uuid;
BEGIN
  SELECT c.* INTO _conv FROM public.atend_conversas c
   WHERE c.id = _conversa_id AND c.clinica_id = _clinica_id
     AND public.atend_conversa_na_fila(c.atribuida_user_id, c.is_teste, c.status, c.owner_type, c.ai_enabled)
   FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  _departamento_id := COALESCE(_departamento_id, _conv.departamento_id);
  FOR _cand IN SELECT * FROM public.atend_pool_canonico(_clinica_id, _departamento_id) p
    WHERE p.elegivel ORDER BY p.load_at_selection, p.ultima_atribuicao NULLS FIRST, p.user_id
  LOOP
    -- A escolha manual não pode mudar entre esta trava e a atribuição. Se a
    -- transação Offline começou primeiro, esta linha será ignorada/revalidada.
    SELECT p.user_id INTO _presenca FROM public.atend_agente_presenca p
     WHERE p.clinica_id = _clinica_id AND p.user_id = _cand.user_id
       AND p.estado_manual IN ('ONLINE', 'PAUSA')
     FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT * INTO _atual FROM public.atend_pool_canonico(_clinica_id, _departamento_id) p
     WHERE p.user_id = _cand.user_id AND p.elegivel;
    IF NOT FOUND THEN CONTINUE; END IF;
    _avaliacao := public.atend_pool_telefonia_avaliacao(_clinica_id, _departamento_id);
    UPDATE public.atend_conversas c SET
      atribuida_user_id = _cand.user_id, owner_type = 'HUMAN', ai_enabled = false,
      fila_pendente = (_atual.estado_manual = 'PAUSA'),
      status = CASE WHEN _atual.estado_manual = 'PAUSA' THEN 'waiting' ELSE 'active' END,
      aguardando_desde = CASE WHEN _atual.estado_manual = 'PAUSA' THEN COALESCE(c.aguardando_desde, now()) ELSE NULL END,
      assigned_at = now(),
      atribuicao_origem = COALESCE(_origem, 'auto_assignment'), updated_at = now()
     WHERE c.id = _conversa_id AND c.clinica_id = _clinica_id
       AND public.atend_conversa_na_fila(c.atribuida_user_id, c.is_teste, c.status, c.owner_type, c.ai_enabled);
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT e.id INTO _handoff_evento_id FROM public.atend_conversa_eventos e
     WHERE e.conversa_id = _conversa_id AND e.evento IN ('HANDOFF', 'TRANSFERIDA_IA', 'AGUARDANDO_HUMANO')
     ORDER BY e.created_at DESC LIMIT 1;
    INSERT INTO public.atend_conversa_eventos
      (clinica_id, conversa_id, evento, user_id, departamento_id, motivo, detalhes)
    VALUES (_clinica_id, _conversa_id, 'ASSUMIDA', _cand.user_id, _departamento_id,
      CASE WHEN _atual.estado_manual = 'PAUSA' THEN 'Conversa reservada na fila individual' ELSE 'Atribuição automática (menor carga)' END, jsonb_build_object(
        'conversation_id', _conversa_id, 'handoff_event_id', _handoff_evento_id,
        'selected_user_id', _cand.user_id, 'atendente_user_id', _cand.user_id,
        'perfil_telefonia', true, 'permission_telefonia', true,
        'presence_status', _atual.presence_status, 'estado_manual', _atual.estado_manual,
        'destino', CASE WHEN _atual.estado_manual = 'PAUSA' THEN 'fila_individual' ELSE 'ativas' END,
        'load_at_selection', _atual.load_at_selection, 'carga_no_momento', _atual.load_at_selection,
        'limite_simultaneas', _atual.capacidade, 'capacidade_origem', _atual.capacidade_origem,
        'unit_queue', _departamento_id, 'departamento_id', _departamento_id,
        'assignment_method', 'distribuicao_automatica', 'metodo', 'distribuicao_automatica',
        'assigned_at', now(), 'distribuido_em', now(), 'origem', COALESCE(_origem, 'auto_assignment'),
        'origem_handoff', 'fila_humana', 'perfil', _atual.perfil,
        'permissao_elegivel', 'perfil:telefonia', 'candidates_evaluated', _avaliacao));
    RETURN _cand.user_id;
  END LOOP;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.atend_definir_presenca_manual(
  _clinica_id uuid, _estado text, _versao integer DEFAULT NULL, _reason_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _user uuid := auth.uid();
  _atual record;
  _versao_atual integer := 0;
  _nova_versao integer;
  _agora timestamptz := clock_timestamp();
  _suprimir text := current_setting('app.atend_suprimir_distribuicao', true);
  _distribuicao jsonb;
  _pausa_id uuid;
  _erro_codigo text;
  _erro_detalhe text;
  _pendentes integer := 0;
BEGIN
  IF _user IS NULL OR NOT COALESCE(public.is_member(_user, _clinica_id), false) THEN
    RAISE EXCEPTION 'Sem acesso a esta clínica' USING ERRCODE = '42501';
  END IF;
  IF _estado IS NULL OR _estado NOT IN ('ONLINE', 'OFFLINE', 'PAUSA') OR _versao < 0 THEN
    RAISE EXCEPTION 'Estado ou versão de presença inválidos' USING ERRCODE = '22023';
  END IF;
  IF _reason_id IS NOT NULL AND (_estado <> 'PAUSA' OR NOT EXISTS (
    SELECT 1 FROM public.atend_pause_reasons r WHERE r.id = _reason_id AND r.clinica_id = _clinica_id
  )) THEN
    RAISE EXCEPTION 'Motivo de pausa não encontrado nesta clínica' USING ERRCODE = '22023';
  END IF;
  -- Sempre clínica -> linha. Não há janela entre ler versão e gravar presença.
  PERFORM pg_advisory_xact_lock(hashtext('atend_assign:' || _clinica_id::text));
  SELECT p.* INTO _atual FROM public.atend_agente_presenca p
   WHERE p.clinica_id = _clinica_id AND p.user_id = _user FOR UPDATE;
  _versao_atual := COALESCE(_atual.estado_manual_versao, 0);
  IF _versao IS NOT NULL AND _versao <> _versao_atual THEN
    RETURN jsonb_build_object('ok', false, 'conflito', true, 'estado', _atual.estado_manual,
      'versao', _versao_atual, 'em', _atual.estado_manual_em, 'distribuidas', 0,
      'distribuicao', public.atend_distribuicao_snapshot(_clinica_id, _user));
  END IF;
  _nova_versao := _versao_atual + 1;
  PERFORM set_config('app.atend_suprimir_distribuicao', '1', true);
  IF _estado IN ('ONLINE', 'OFFLINE') OR (_estado = 'PAUSA' AND _reason_id IS NOT NULL) THEN
    UPDATE public.atend_pausas_log SET finalizada_em = _agora
     WHERE clinica_id = _clinica_id AND user_id = _user AND finalizada_em IS NULL;
  END IF;
  IF _estado = 'PAUSA' AND _reason_id IS NOT NULL THEN
    INSERT INTO public.atend_pausas_log (clinica_id, user_id, reason_id)
    VALUES (_clinica_id, _user, _reason_id) RETURNING id INTO _pausa_id;
  ELSIF _estado = 'PAUSA' THEN
    SELECT pl.id INTO _pausa_id FROM public.atend_pausas_log pl
     WHERE pl.clinica_id = _clinica_id AND pl.user_id = _user AND pl.finalizada_em IS NULL
     ORDER BY pl.iniciada_em DESC LIMIT 1;
  END IF;
  INSERT INTO public.atend_agente_presenca
    (clinica_id, user_id, status, aceita_novas, visto_em, estado_manual,
     estado_manual_em, estado_manual_por, estado_manual_versao)
  VALUES (_clinica_id, _user, CASE _estado WHEN 'ONLINE' THEN 'ONLINE' WHEN 'PAUSA' THEN 'BUSY' ELSE 'OFFLINE' END,
    _estado = 'ONLINE', _agora, _estado, _agora, _user, _nova_versao)
  ON CONFLICT (clinica_id, user_id) DO UPDATE SET
    status = EXCLUDED.status, aceita_novas = EXCLUDED.aceita_novas, visto_em = EXCLUDED.visto_em,
    estado_manual = EXCLUDED.estado_manual, estado_manual_em = EXCLUDED.estado_manual_em,
    estado_manual_por = EXCLUDED.estado_manual_por, estado_manual_versao = EXCLUDED.estado_manual_versao;
  INSERT INTO public.atend_presenca_manual_log (clinica_id, user_id, estado, versao, definido_por)
  VALUES (_clinica_id, _user, _estado, _nova_versao, _user);
  PERFORM set_config('app.atend_suprimir_distribuicao', COALESCE(_suprimir, ''), true);
  IF _estado IN ('ONLINE', 'PAUSA') THEN
    _distribuicao := public.atend_distribuir_fila_seguro(_clinica_id, 200, 'presenca_manual', _user);
  ELSE
    BEGIN
      _distribuicao := public.atend_distribuicao_snapshot(_clinica_id, _user);
    EXCEPTION WHEN OTHERS THEN
      -- Offline também devem permanecer gravados se apenas a leitura
      -- de diagnóstico falhar; não há tentativa de atribuição nestes estados.
      GET STACKED DIAGNOSTICS _erro_codigo = RETURNED_SQLSTATE, _erro_detalhe = MESSAGE_TEXT;
      BEGIN
        SELECT count(*)::integer INTO _pendentes FROM public.atend_conversas c
         WHERE c.clinica_id = _clinica_id AND c.atribuida_user_id IS NULL AND c.is_teste IS NOT TRUE
           AND c.status IN ('waiting', 'active', 'in_progress')
           AND c.owner_type IN ('NONE', 'HUMAN') AND c.ai_enabled IS FALSE;
      EXCEPTION WHEN OTHERS THEN
        _pendentes := 0;
      END;
      BEGIN
        INSERT INTO public.atend_distribuicao_execucoes
          (clinica_id, solicitado_por, origem, status, pendentes, motivo, erro_codigo, erro_detalhe)
        VALUES (_clinica_id, _user, 'presenca_manual_diagnostico', 'erro', _pendentes,
          'falha_distribuicao', _erro_codigo, _erro_detalhe);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Zap OS: falha ao registrar diagnóstico de presença [%]', SQLSTATE;
      END;
      _distribuicao := jsonb_build_object('status', 'erro', 'distribuidas', 0,
        'pendentes', _pendentes, 'motivo', 'falha_distribuicao', 'meu', NULL);
    END;
  END IF;
  RETURN jsonb_build_object('ok', true, 'conflito', false, 'estado', _estado,
    'versao', _nova_versao, 'em', _agora, 'distribuidas', (_distribuicao->>'distribuidas')::integer,
    'distribuicao', _distribuicao, 'pausaId', _pausa_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.atend_presenca_redistribui()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('app.atend_suprimir_distribuicao', true) = '1'
     OR current_setting('app.atend_distribuicao_em_curso', true) = '1'
     OR COALESCE(NEW.estado_manual, '') NOT IN ('ONLINE', 'PAUSA') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado_manual IS NOT DISTINCT FROM NEW.estado_manual THEN RETURN NEW; END IF;
  PERFORM public.atend_distribuir_fila_seguro(NEW.clinica_id, 200, 'trigger_presenca', NEW.user_id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.atend_capacidade_liberada_redistribui()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('app.atend_suprimir_distribuicao', true) = '1'
     OR current_setting('app.atend_distribuicao_em_curso', true) = '1' THEN RETURN NEW; END IF;
  IF OLD.is_teste IS NOT TRUE AND OLD.atribuida_user_id IS NOT NULL
     AND OLD.status IN ('waiting', 'active', 'in_progress')
     AND (NEW.atribuida_user_id IS DISTINCT FROM OLD.atribuida_user_id
       OR NEW.status NOT IN ('waiting', 'active', 'in_progress') OR NEW.is_teste IS TRUE
       OR (OLD.fila_pendente AND NOT NEW.fila_pendente)) THEN
    PERFORM public.atend_distribuir_fila_seguro(OLD.clinica_id, 200, 'trigger_capacidade_liberada', auth.uid());
  END IF;
  RETURN NEW;
END;
$function$;


DROP TRIGGER IF EXISTS trg_atend_capacidade_liberada_redistribui ON public.atend_conversas;
CREATE TRIGGER trg_atend_capacidade_liberada_redistribui
AFTER UPDATE OF atribuida_user_id, status, is_teste, fila_pendente ON public.atend_conversas
FOR EACH ROW EXECUTE FUNCTION public.atend_capacidade_liberada_redistribui();

-- Cobre texto, mídia e atualização de entrega. Mensagem da Nina, recebida do
-- paciente, apenas digitada, pendente ou com falha não inicia atendimento.
CREATE FUNCTION public.atend_resposta_inicia_fila_individual() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
  IF NEW.conversa_id IS NOT NULL AND NEW.direction = 'out' AND NEW.enviada_por = 'humano'
    AND NEW.status IN ('sent', 'delivered', 'read') THEN
    UPDATE public.atend_conversas c SET fila_pendente = false, status = 'active', updated_at = now()
     WHERE c.id = NEW.conversa_id AND c.clinica_id = NEW.clinica_id AND c.fila_pendente
       AND c.is_teste IS NOT TRUE AND c.atribuida_user_id IS NOT NULL AND c.owner_type = 'HUMAN'
       AND c.status IN ('waiting', 'active', 'in_progress')
       AND COALESCE(NEW.recebida_em, now()) >= c.assigned_at
       AND (auth.uid() IS NULL OR auth.uid() = c.atribuida_user_id);
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_atend_resposta_inicia_fila_individual
AFTER INSERT OR UPDATE OF status ON public.whatsapp_mensagens
FOR EACH ROW EXECUTE FUNCTION public.atend_resposta_inicia_fila_individual();
REVOKE ALL ON FUNCTION public.atend_normalizar_fila_individual() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.atend_resposta_inicia_fila_individual() FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.atend_distribuicao_snapshot(
  _clinica_id uuid, _user_id uuid, _distribuidas integer DEFAULT 0,
  _status text DEFAULT NULL, _motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _pendentes integer;
  _pool jsonb;
  _meu jsonb;
  _tem_elegivel boolean;
  _estado text := _status;
  _razao text := _motivo;
BEGIN
  SELECT count(*)::integer INTO _pendentes FROM public.atend_conversas c
   WHERE c.clinica_id = _clinica_id AND public.atend_conversa_na_fila(
     c.atribuida_user_id, c.is_teste, c.status, c.owner_type, c.ai_enabled);
  _pool := public.atend_pool_telefonia_avaliacao(_clinica_id, NULL);
  SELECT jsonb_build_object('carga_atual', p.load_at_selection, 'capacidade', p.capacidade,
    'elegivel', p.elegivel, 'motivo', p.motivo_exclusao,
    'reservadas', (SELECT count(*) FROM public.atend_conversas c WHERE c.clinica_id = _clinica_id
      AND c.atribuida_user_id = p.user_id AND c.fila_pendente AND c.is_teste IS NOT TRUE
      AND c.status IN ('waiting', 'active', 'in_progress')))
    INTO _meu FROM public.atend_pool_canonico(_clinica_id, NULL) p WHERE p.user_id = _user_id;
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(_pool) p WHERE (p->>'elegivel')::boolean)
    INTO _tem_elegivel;
  IF _estado IS NULL THEN
    IF _pendentes = 0 THEN
      _estado := 'concluida'; _razao := NULL;
    ELSIF _tem_elegivel THEN
      _estado := 'pendente'; _razao := 'distribuicao_pendente';
    ELSE
      _estado := 'bloqueada';
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(_pool) p WHERE p->>'motivo_exclusao' = 'capacidade_lotada') THEN
        _razao := 'capacidade_lotada';
      ELSIF EXISTS (SELECT 1 FROM jsonb_array_elements(_pool) p WHERE p->>'motivo_exclusao' = 'fila_bloqueada') THEN
        _razao := 'fila_bloqueada';
      ELSE
        _razao := 'sem_atendentes_elegiveis';
      END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('status', _estado, 'distribuidas', _distribuidas,
    'pendentes', _pendentes, 'motivo', _razao, 'meu', _meu,
    'candidatos', _pool, 'avaliadoEm', clock_timestamp());
END;
$function$;


-- Contrato antigo mantido para clientes antigos, com recusa explícita em vez
-- de confirmar um limite que não interfere mais na distribuição.
CREATE OR REPLACE FUNCTION public.atend_configurar_capacidade(_clinica_id uuid, _user_id uuid, _max_simultaneas integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(public.can_manage_clinica(auth.uid(), _clinica_id), false) THEN
    RAISE EXCEPTION 'Somente a gestão pode configurar a capacidade' USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION 'A distribuição usa limites fixos: Online sem limite e Pausa com até 10 reservas.' USING ERRCODE = '22023';
END;
$function$;
