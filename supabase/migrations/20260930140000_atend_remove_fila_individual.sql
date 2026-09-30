-- Etapa 2 (30/09/2026): fim da fila individual (reserva de até 10 conversas) e dos limites por atendente.
--
-- Regra decidida pelo time: só quem está Online recebe conversa; sem ninguém Online a conversa fica sem
-- responsável (fila global, visível só para a gestão) até alguém ficar Online. Não há mais reserva.
--
-- Cuidados:
--  * As reservas que existirem hoje (fila_pendente = true) continuam com a mesma pessoa e passam a ser
--    conversas normais em Ativas. Nada é redistribuído nem apagado.
--  * A coluna atend_conversas.fila_pendente e a tabela atend_capacidade_atendentes ficam no banco (sem uso),
--    para não perder histórico; ficam sem gatilho, política ou função que as leia.

-- 1) Converte as reservas atuais, sem disparar redistribuição.
DO $converter$
DECLARE
  _suprimir text := current_setting('app.atend_suprimir_distribuicao', true);
BEGIN
  PERFORM set_config('app.atend_suprimir_distribuicao', '1', true);
  UPDATE public.atend_conversas
     SET fila_pendente = false, status = 'active', updated_at = now()
   WHERE fila_pendente = true;
  PERFORM set_config('app.atend_suprimir_distribuicao', COALESCE(_suprimir, ''), true);
END;
$converter$;

-- 2) Remove gatilhos, política e funções da reserva.
DROP TRIGGER IF EXISTS trg_atend_resposta_inicia_fila_individual ON public.whatsapp_mensagens;
DROP TRIGGER IF EXISTS trg_atend_normalizar_fila_individual ON public.atend_conversas;
DROP POLICY IF EXISTS atend_fila_individual_privada ON public.atend_conversas;
DROP FUNCTION IF EXISTS public.atend_resposta_inicia_fila_individual();
DROP FUNCTION IF EXISTS public.atend_normalizar_fila_individual();
DROP INDEX IF EXISTS public.atend_fila_individual_idx;
COMMENT ON COLUMN public.atend_conversas.fila_pendente IS
  'Em desuso desde 30/09/2026 (fim da fila individual). Sempre false; mantida só por histórico.';

-- 3) Limites por atendente deixam de existir.
DROP FUNCTION IF EXISTS public.atend_configurar_capacidade(uuid, uuid, integer);

-- 4) Liberação de capacidade: sem o caso da reserva.
CREATE OR REPLACE FUNCTION public.atend_capacidade_liberada_redistribui()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('app.atend_suprimir_distribuicao', true) = '1'
     OR current_setting('app.atend_distribuicao_em_curso', true) = '1' THEN RETURN NEW; END IF;
  IF OLD.is_teste IS NOT TRUE AND OLD.atribuida_user_id IS NOT NULL
     AND OLD.status IN ('waiting', 'active', 'in_progress')
     AND (NEW.atribuida_user_id IS DISTINCT FROM OLD.atribuida_user_id
       OR NEW.status NOT IN ('waiting', 'active', 'in_progress') OR NEW.is_teste IS TRUE) THEN
    PERFORM public.atend_distribuir_fila_seguro(OLD.clinica_id, 200, 'trigger_capacidade_liberada', auth.uid());
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_atend_capacidade_liberada_redistribui ON public.atend_conversas;
CREATE TRIGGER trg_atend_capacidade_liberada_redistribui
AFTER UPDATE OF atribuida_user_id, status, is_teste ON public.atend_conversas
FOR EACH ROW EXECUTE FUNCTION public.atend_capacidade_liberada_redistribui();

-- 5) Resumo da distribuição: sem contagem de reservas.
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
    'elegivel', p.elegivel, 'motivo', p.motivo_exclusao)
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
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(_pool) p WHERE p->>'motivo_exclusao' = 'fila_bloqueada') THEN
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

-- 6) Atribuição automática: a conversa vai sempre direto para Ativas (sem marca de reserva).
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
    -- transação Offline/Pausa começou primeiro, esta linha será ignorada/revalidada.
    SELECT p.user_id INTO _presenca FROM public.atend_agente_presenca p
     WHERE p.clinica_id = _clinica_id AND p.user_id = _cand.user_id
       AND p.estado_manual = 'ONLINE'
     FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT * INTO _atual FROM public.atend_pool_canonico(_clinica_id, _departamento_id) p
     WHERE p.user_id = _cand.user_id AND p.elegivel;
    IF NOT FOUND THEN CONTINUE; END IF;
    _avaliacao := public.atend_pool_telefonia_avaliacao(_clinica_id, _departamento_id);
    UPDATE public.atend_conversas c SET
      atribuida_user_id = _cand.user_id, owner_type = 'HUMAN', ai_enabled = false,
      status = 'active', aguardando_desde = NULL,
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
      'Atribuição automática (menor carga)', jsonb_build_object(
        'conversation_id', _conversa_id, 'handoff_event_id', _handoff_evento_id,
        'selected_user_id', _cand.user_id, 'atendente_user_id', _cand.user_id,
        'perfil_telefonia', true, 'permission_telefonia', true,
        'presence_status', _atual.presence_status, 'estado_manual', _atual.estado_manual,
        'destino', 'ativas',
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
