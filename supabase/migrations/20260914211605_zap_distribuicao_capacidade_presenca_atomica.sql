-- Zap OS: capacidade explícita, presença atômica e recuperação da fila humana.
-- Não altera conversas nem executa distribuição ao aplicar esta migration.
-- O job novo só executará nas próximas rodadas do pg_cron.

-- Mantém valores legados existentes, mas novos vínculos de departamento não
-- recriam o antigo teto implícito de cinco.
ALTER TABLE public.atend_departamento_membros
  ALTER COLUMN max_simultaneas DROP NOT NULL,
  ALTER COLUMN max_simultaneas SET DEFAULT NULL;

CREATE TABLE public.atend_capacidade_atendentes (
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  max_simultaneas integer CHECK (max_simultaneas BETWEEN 1 AND 1000),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY (clinica_id, user_id)
);
COMMENT ON COLUMN public.atend_capacidade_atendentes.max_simultaneas IS
  'NULL = sem limite. Sem registro, preserva máximo legado dos departamentos; sem legado, sem limite.';

CREATE TABLE public.atend_capacidade_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  user_id uuid NOT NULL,
  alterado_por uuid NOT NULL,
  antes jsonb NOT NULL,
  depois jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX atend_capacidade_auditoria_clinica_idx
  ON public.atend_capacidade_auditoria (clinica_id, criado_em DESC);

CREATE TABLE public.atend_distribuicao_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  solicitado_por uuid,
  origem text NOT NULL,
  status text NOT NULL CHECK (status IN ('concluida', 'bloqueada', 'erro', 'pendente')),
  distribuidas integer NOT NULL DEFAULT 0,
  pendentes integer NOT NULL DEFAULT 0,
  motivo text,
  erro_codigo text,
  erro_detalhe text,
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX atend_distribuicao_execucoes_clinica_idx
  ON public.atend_distribuicao_execucoes (clinica_id, criado_em DESC);

ALTER TABLE public.atend_capacidade_atendentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atend_capacidade_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atend_distribuicao_execucoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atend_capacidade_atendentes,
  public.atend_capacidade_auditoria, public.atend_distribuicao_execucoes
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.atend_capacidade_atendentes,
  public.atend_capacidade_auditoria, public.atend_distribuicao_execucoes
  TO authenticated, service_role;
CREATE POLICY capacidade_leitura_membro ON public.atend_capacidade_atendentes
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY capacidade_auditoria_leitura_membro ON public.atend_capacidade_auditoria
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY distribuicao_execucoes_leitura_membro ON public.atend_distribuicao_execucoes
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));

-- Dependência já existente em produção, agora com definição versionada.
-- CREATE OR REPLACE preserva os privilégios existentes desse helper de leitura.
CREATE OR REPLACE FUNCTION public.atend_tem_perfil_telefonia(_user_id uuid, _clinica_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.clinica_memberships m
     WHERE m.user_id = _user_id AND m.clinica_id = _clinica_id
       AND m.ativo = true AND m.role::text = 'telefonia'
  );
$function$;

-- Contrato da fila humana: a propriedade atual decide; resumo/motivo são auditoria.
CREATE FUNCTION public.atend_conversa_na_fila(
  _atribuida_user_id uuid, _is_teste boolean, _status text,
  _owner_type text, _ai_enabled boolean
) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT _atribuida_user_id IS NULL AND _is_teste IS NOT TRUE
     AND _status IN ('waiting', 'active', 'in_progress')
     AND _owner_type IN ('NONE', 'HUMAN') AND _ai_enabled IS FALSE;
$function$;

-- Uma única avaliação alimenta seleção, auditoria e diagnóstico. A capacidade
-- vem antes da preferência de setor: setor sem vagas usa o pool geral elegível.
CREATE FUNCTION public.atend_pool_canonico(_clinica_id uuid, _departamento_id uuid DEFAULT NULL)
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
      EXISTS (SELECT 1 FROM public.atend_pausas_log pl
        WHERE pl.clinica_id = _clinica_id AND pl.user_id = u.user_id
          AND pl.finalizada_em IS NULL) AS em_pausa,
      EXISTS (SELECT 1 FROM public.atend_departamento_membros dm
        WHERE dm.clinica_id = _clinica_id AND dm.user_id = u.user_id AND dm.queue_locked)
      AND NOT EXISTS (SELECT 1 FROM public.atend_departamento_membros dm
        WHERE dm.clinica_id = _clinica_id AND dm.user_id = u.user_id
          AND dm.queue_locked IS FALSE) AS fila_travada,
      (SELECT count(*)::integer FROM public.atend_conversas c
        WHERE c.clinica_id = _clinica_id AND c.atribuida_user_id = u.user_id
          AND c.is_teste IS NOT TRUE AND c.status IN ('waiting', 'active', 'in_progress')) AS carga,
      CASE WHEN cap.user_id IS NOT NULL THEN cap.max_simultaneas ELSE legado.maximo END AS capacidade,
      CASE WHEN cap.user_id IS NOT NULL THEN 'configurada'
           WHEN legado.maximo IS NOT NULL THEN 'departamento_legado'
           ELSE 'sem_limite' END AS capacidade_origem,
      (SELECT max(c.assigned_at) FROM public.atend_conversas c
        WHERE c.clinica_id = _clinica_id AND c.atribuida_user_id = u.user_id
          AND c.is_teste IS NOT TRUE) AS ultima_atribuicao,
      (_departamento_id IS NULL OR EXISTS (
        SELECT 1 FROM public.atend_departamento_membros dm
         WHERE dm.clinica_id = _clinica_id AND dm.user_id = u.user_id
           AND dm.departamento_id = _departamento_id)) AS do_setor
    FROM usuarios u
    LEFT JOIN public.atend_agente_presenca p ON p.clinica_id = _clinica_id AND p.user_id = u.user_id
    LEFT JOIN public.atend_capacidade_atendentes cap ON cap.clinica_id = _clinica_id AND cap.user_id = u.user_id
    LEFT JOIN LATERAL (
      SELECT max(dm.max_simultaneas)::integer AS maximo
        FROM public.atend_departamento_membros dm
       WHERE dm.clinica_id = _clinica_id AND dm.user_id = u.user_id
    ) legado ON true
  ), avaliado AS (
    SELECT b.*, CASE
      WHEN NOT b.perfil_telefonia THEN 'sem_perfil_telefonia'
      WHEN b.admin THEN 'admin_excluido'
      WHEN b.estado_manual IS NULL THEN 'sem_escolha_manual'
      WHEN b.estado_manual <> 'ONLINE' THEN 'escolha_manual_' || lower(b.estado_manual)
      WHEN b.em_pausa THEN 'em_pausa'
      WHEN b.fila_travada THEN 'fila_bloqueada'
      WHEN b.capacidade IS NOT NULL AND b.carga >= b.capacidade THEN 'capacidade_lotada'
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

CREATE OR REPLACE FUNCTION public.atend_pool_telefonia_avaliacao(
  _clinica_id uuid, _departamento_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(jsonb_agg(to_jsonb(p) || jsonb_build_object(
    'permission_telefonia', p.perfil_telefonia)
    ORDER BY p.elegivel DESC, p.load_at_selection, p.ultima_atribuicao NULLS FIRST, p.user_id), '[]'::jsonb)
  FROM public.atend_pool_canonico(_clinica_id, _departamento_id) p;
$function$;

CREATE FUNCTION public.atend_distribuicao_snapshot(
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

-- Núcleo privado: o chamador possui a trava da clínica. SKIP LOCKED evita
-- aguardar uma conversa/presença que outro fluxo já esteja alterando.
CREATE FUNCTION public.atend_auto_assign_conversa_interno(
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
       AND p.estado_manual = 'ONLINE'
     FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT * INTO _atual FROM public.atend_pool_canonico(_clinica_id, _departamento_id) p
     WHERE p.user_id = _cand.user_id AND p.elegivel;
    IF NOT FOUND THEN CONTINUE; END IF;
    _avaliacao := public.atend_pool_telefonia_avaliacao(_clinica_id, _departamento_id);
    UPDATE public.atend_conversas c SET
      atribuida_user_id = _cand.user_id, owner_type = 'HUMAN', ai_enabled = false,
      status = 'active', aguardando_desde = NULL, assigned_at = now(),
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
        'presence_status', 'ONLINE', 'estado_manual', 'ONLINE',
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

-- O erro da rodada volta em JSON e auditoria; seu subtransaction desfaz somente
-- as atribuições da rodada, preservando a presença/fechamento já gravados.
CREATE FUNCTION public.atend_distribuir_fila_seguro(
  _clinica_id uuid, _max integer DEFAULT 200, _origem text DEFAULT 'queue_distribution',
  _user_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _r record;
  _n integer := 0;
  _limite integer := LEAST(GREATEST(COALESCE(_max, 200), 1), 1000);
  _resultado jsonb;
  _anterior text := current_setting('app.atend_distribuicao_em_curso', true);
  _erro_codigo text;
  _erro_detalhe text;
  _fallback_pendentes integer := 0;
BEGIN
  IF _anterior = '1' OR NOT pg_try_advisory_xact_lock(hashtext('atend_assign:' || _clinica_id::text)) THEN
    _resultado := public.atend_distribuicao_snapshot(_clinica_id, _user_id, 0,
      'pendente', 'distribuicao_em_andamento');
  ELSE
    BEGIN
      PERFORM set_config('app.atend_distribuicao_em_curso', '1', true);
      FOR _r IN SELECT c.id, c.departamento_id FROM public.atend_conversas c
        WHERE c.clinica_id = _clinica_id AND public.atend_conversa_na_fila(
          c.atribuida_user_id, c.is_teste, c.status, c.owner_type, c.ai_enabled)
          AND EXISTS (SELECT 1 FROM public.atend_pool_canonico(_clinica_id, NULL) p WHERE p.elegivel)
        ORDER BY c.prioridade DESC, c.aguardando_desde NULLS LAST,
          c.handoff_em NULLS LAST, c.created_at, c.id
      LOOP
        IF public.atend_auto_assign_conversa_interno(_r.id, _clinica_id, _r.departamento_id, _origem) IS NOT NULL THEN
          _n := _n + 1;
          EXIT WHEN _n >= _limite OR NOT EXISTS (
            SELECT 1 FROM public.atend_pool_canonico(_clinica_id, NULL) p WHERE p.elegivel);
        END IF;
      END LOOP;
      PERFORM set_config('app.atend_distribuicao_em_curso', COALESCE(_anterior, ''), true);
      _resultado := public.atend_distribuicao_snapshot(_clinica_id, _user_id, _n);
      IF _n >= _limite AND (_resultado->>'pendentes')::integer > 0
         AND _resultado->>'status' = 'pendente' THEN
        _resultado := _resultado || jsonb_build_object('motivo', 'limite_da_rodada');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS _erro_codigo = RETURNED_SQLSTATE, _erro_detalhe = MESSAGE_TEXT;
      _n := 0;
      PERFORM set_config('app.atend_distribuicao_em_curso', COALESCE(_anterior, ''), true);
      _resultado := public.atend_distribuicao_snapshot(_clinica_id, _user_id, 0, 'erro', 'falha_distribuicao');
    END;
  END IF;
  BEGIN
    INSERT INTO public.atend_distribuicao_execucoes
      (clinica_id, solicitado_por, origem, status, distribuidas, pendentes, motivo, erro_codigo, erro_detalhe)
    VALUES (_clinica_id, _user_id, _origem, _resultado->>'status',
      (_resultado->>'distribuidas')::integer, (_resultado->>'pendentes')::integer,
      _resultado->>'motivo', _erro_codigo, _erro_detalhe);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Zap OS: falha ao registrar distribuição [%]', SQLSTATE;
  END;
  RETURN _resultado;
EXCEPTION WHEN OTHERS THEN
  -- Até uma falha do diagnóstico não pode desfazer a escolha manual ou o
  -- fechamento que motivou esta chamada. O guard volta ao valor do chamador.
  GET STACKED DIAGNOSTICS _erro_codigo = RETURNED_SQLSTATE, _erro_detalhe = MESSAGE_TEXT;
  PERFORM set_config('app.atend_distribuicao_em_curso', COALESCE(_anterior, ''), true);
  BEGIN
    SELECT count(*)::integer INTO _fallback_pendentes FROM public.atend_conversas c
     WHERE c.clinica_id = _clinica_id AND c.atribuida_user_id IS NULL AND c.is_teste IS NOT TRUE
       AND c.status IN ('waiting', 'active', 'in_progress')
       AND c.owner_type IN ('NONE', 'HUMAN') AND c.ai_enabled IS FALSE;
  EXCEPTION WHEN OTHERS THEN
    _fallback_pendentes := 0;
  END;
  BEGIN
    INSERT INTO public.atend_distribuicao_execucoes
      (clinica_id, solicitado_por, origem, status, pendentes, motivo, erro_codigo, erro_detalhe)
    VALUES (_clinica_id, _user_id, _origem, 'erro', _fallback_pendentes,
      'falha_distribuicao', _erro_codigo, _erro_detalhe);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Zap OS: falha ao registrar erro de distribuição [%]', SQLSTATE;
  END;
  RETURN jsonb_build_object('status', 'erro', 'distribuidas', 0, 'pendentes', _fallback_pendentes,
    'motivo', 'falha_distribuicao', 'meu', NULL);
END;
$function$;

CREATE FUNCTION public.atend_distribuir_fila_status(_clinica_id uuid, _max integer DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (auth.uid() IS NULL AND COALESCE(auth.jwt()->>'role', '') <> 'service_role'
      AND current_setting('role', true) IS DISTINCT FROM 'service_role')
     OR (auth.uid() IS NOT NULL AND NOT COALESCE(public.is_member(auth.uid(), _clinica_id), false)) THEN
    RAISE EXCEPTION 'Sem acesso a esta clínica' USING ERRCODE = '42501';
  END IF;
  RETURN public.atend_distribuir_fila_seguro(_clinica_id, _max, 'rpc_distribuicao', auth.uid());
END;
$function$;

CREATE FUNCTION public.atend_diagnostico_distribuicao(_clinica_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _ultima jsonb; _resultado jsonb;
BEGIN
  IF (auth.uid() IS NULL AND COALESCE(auth.jwt()->>'role', '') <> 'service_role'
      AND current_setting('role', true) IS DISTINCT FROM 'service_role')
     OR (auth.uid() IS NOT NULL AND NOT COALESCE(public.is_member(auth.uid(), _clinica_id), false)) THEN
    RAISE EXCEPTION 'Sem acesso a esta clínica' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object('status', e.status, 'motivo', e.motivo,
    'erro_codigo', e.erro_codigo, 'criado_em', e.criado_em)
    INTO _ultima FROM public.atend_distribuicao_execucoes e
   WHERE e.clinica_id = _clinica_id ORDER BY e.criado_em DESC, e.id DESC LIMIT 1;
  _resultado := public.atend_distribuicao_snapshot(_clinica_id, auth.uid());
  -- Uma releitura não transforma falha em simples espera. A informação fica
  -- visível até nova tentativa registrada ou até a fila realmente esvaziar.
  IF (_resultado->>'pendentes')::integer > 0 AND _ultima->>'status' = 'erro' THEN
    _resultado := _resultado || jsonb_build_object('status', 'erro', 'motivo', 'falha_distribuicao');
  END IF;
  RETURN _resultado || jsonb_build_object('ultima_execucao', _ultima);
END;
$function$;

-- Assinaturas antigas continuam disponíveis para os chamadores legados.
CREATE OR REPLACE FUNCTION public.atend_distribuir_fila_interno(_clinica_id uuid, _max integer DEFAULT 20)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _resultado jsonb;
BEGIN
  _resultado := public.atend_distribuir_fila_seguro(_clinica_id, _max, 'legado_interno', auth.uid());
  RETURN (_resultado->>'distribuidas')::integer;
END;
$function$;

CREATE OR REPLACE FUNCTION public.atend_distribuir_fila(_clinica_id uuid, _max integer DEFAULT 20)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _resultado jsonb;
BEGIN
  _resultado := public.atend_distribuir_fila_status(_clinica_id, _max);
  RETURN (_resultado->>'distribuidas')::integer;
END;
$function$;

CREATE OR REPLACE FUNCTION public.atend_auto_assign_conversa(
  _conversa_id uuid, _clinica_id uuid, _departamento_id uuid DEFAULT NULL, _origem text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (auth.uid() IS NULL AND COALESCE(auth.jwt()->>'role', '') <> 'service_role'
      AND current_setting('role', true) IS DISTINCT FROM 'service_role')
     OR (auth.uid() IS NOT NULL AND NOT COALESCE(public.is_member(auth.uid(), _clinica_id), false)) THEN
    RAISE EXCEPTION 'Sem acesso a esta clínica' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('atend_assign:' || _clinica_id::text));
  RETURN public.atend_auto_assign_conversa_interno(_conversa_id, _clinica_id, _departamento_id, _origem);
END;
$function$;

CREATE FUNCTION public.atend_configurar_capacidade(_clinica_id uuid, _user_id uuid, _max_simultaneas integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _antes jsonb; _depois jsonb; _distribuicao jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(public.can_manage_clinica(auth.uid(), _clinica_id), false) THEN
    RAISE EXCEPTION 'Somente a gestão pode configurar a capacidade' USING ERRCODE = '42501';
  END IF;
  IF _max_simultaneas IS NOT NULL AND (_max_simultaneas < 1 OR _max_simultaneas > 1000) THEN
    RAISE EXCEPTION 'Capacidade deve ser de 1 a 1000, ou sem limite' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clinica_memberships m
    WHERE m.clinica_id = _clinica_id AND m.user_id = _user_id AND m.ativo = true) THEN
    RAISE EXCEPTION 'Atendente não pertence a esta clínica' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('atend_assign:' || _clinica_id::text));
  SELECT jsonb_build_object('max_simultaneas', p.capacidade, 'origem', p.capacidade_origem)
    INTO _antes FROM public.atend_pool_canonico(_clinica_id, NULL) p WHERE p.user_id = _user_id;
  INSERT INTO public.atend_capacidade_atendentes (clinica_id, user_id, max_simultaneas, atualizado_por)
  VALUES (_clinica_id, _user_id, _max_simultaneas, auth.uid())
  ON CONFLICT (clinica_id, user_id) DO UPDATE SET
    max_simultaneas = EXCLUDED.max_simultaneas, atualizado_em = now(), atualizado_por = auth.uid();
  _depois := jsonb_build_object('max_simultaneas', _max_simultaneas, 'origem', 'configurada');
  INSERT INTO public.atend_capacidade_auditoria (clinica_id, user_id, alterado_por, antes, depois)
  VALUES (_clinica_id, _user_id, auth.uid(), COALESCE(_antes, '{}'::jsonb), _depois);
  _distribuicao := public.atend_distribuir_fila_seguro(_clinica_id, 200, 'configuracao_capacidade', auth.uid());
  RETURN jsonb_build_object('ok', true, 'user_id', _user_id, 'max_simultaneas', _max_simultaneas,
    'distribuicao', _distribuicao);
END;
$function$;

CREATE FUNCTION public.atend_definir_presenca_manual(
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
  IF _estado = 'ONLINE' THEN
    _distribuicao := public.atend_distribuir_fila_seguro(_clinica_id, 200, 'presenca_manual', _user);
  ELSE
    BEGIN
      _distribuicao := public.atend_distribuicao_snapshot(_clinica_id, _user);
    EXCEPTION WHEN OTHERS THEN
      -- Offline/Pausa também devem permanecer gravados se apenas a leitura
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

-- Caminhos legados já chegam com rowlock. Nunca esperam uma trava de clínica
-- em ordem inversa: a presença é protegida pela própria linha na atribuição.
CREATE OR REPLACE FUNCTION public.atend_presenca_serializa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.estado_manual IS DISTINCT FROM OLD.estado_manual THEN
    PERFORM pg_try_advisory_xact_lock(hashtext('atend_assign:' || NEW.clinica_id::text));
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.atend_presenca_redistribui()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('app.atend_suprimir_distribuicao', true) = '1'
     OR current_setting('app.atend_distribuicao_em_curso', true) = '1'
     OR NEW.estado_manual IS DISTINCT FROM 'ONLINE' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado_manual IS NOT DISTINCT FROM NEW.estado_manual THEN RETURN NEW; END IF;
  PERFORM public.atend_distribuir_fila_seguro(NEW.clinica_id, 200, 'trigger_presenca', NEW.user_id);
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_atend_presenca_redistribui ON public.atend_agente_presenca;
CREATE TRIGGER trg_atend_presenca_redistribui
AFTER INSERT OR UPDATE OF estado_manual ON public.atend_agente_presenca
FOR EACH ROW EXECUTE FUNCTION public.atend_presenca_redistribui();

CREATE OR REPLACE FUNCTION public.atend_pausa_fim_redistribui()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('app.atend_suprimir_distribuicao', true) = '1'
     OR current_setting('app.atend_distribuicao_em_curso', true) = '1'
     OR NEW.finalizada_em IS NULL OR OLD.finalizada_em IS NOT NULL THEN RETURN NEW; END IF;
  PERFORM public.atend_distribuir_fila_seguro(NEW.clinica_id, 200, 'trigger_fim_pausa', NEW.user_id);
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.atend_capacidade_liberada_redistribui()
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
CREATE TRIGGER trg_atend_capacidade_liberada_redistribui
AFTER UPDATE OF atribuida_user_id, status, is_teste ON public.atend_conversas
FOR EACH ROW EXECUTE FUNCTION public.atend_capacidade_liberada_redistribui();

CREATE FUNCTION public.atend_recuperar_distribuicao()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _clinica uuid; _resultado jsonb; _n integer := 0;
BEGIN
  FOR _clinica IN SELECT DISTINCT c.clinica_id FROM public.atend_conversas c
    WHERE public.atend_conversa_na_fila(c.atribuida_user_id, c.is_teste, c.status, c.owner_type, c.ai_enabled)
  LOOP
    _resultado := public.atend_distribuir_fila_seguro(_clinica, 200, 'recuperacao_periodica', NULL);
    _n := _n + (_resultado->>'distribuidas')::integer;
  END LOOP;
  RETURN _n;
END;
$function$;

-- Privilégios explícitos: RPCs públicas autorizam clínica; núcleos e gatilhos
-- só podem ser chamados pelo proprietário das funções (inclusive o job).
REVOKE ALL ON FUNCTION public.atend_conversa_na_fila(uuid, boolean, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atend_conversa_na_fila(uuid, boolean, text, text, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.atend_pool_canonico(uuid, uuid),
  public.atend_distribuicao_snapshot(uuid, uuid, integer, text, text),
  public.atend_auto_assign_conversa_interno(uuid, uuid, uuid, text),
  public.atend_distribuir_fila_seguro(uuid, integer, text, uuid),
  public.atend_distribuir_fila_interno(uuid, integer),
  public.atend_presenca_serializa(), public.atend_presenca_redistribui(),
  public.atend_pausa_fim_redistribui(), public.atend_capacidade_liberada_redistribui(),
  public.atend_recuperar_distribuicao()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.atend_pool_telefonia_avaliacao(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atend_pool_telefonia_avaliacao(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.atend_distribuir_fila_status(uuid, integer),
  public.atend_diagnostico_distribuicao(uuid), public.atend_definir_presenca_manual(uuid, text, integer, uuid),
  public.atend_configurar_capacidade(uuid, uuid, integer), public.atend_distribuir_fila(uuid, integer),
  public.atend_auto_assign_conversa(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atend_distribuir_fila_status(uuid, integer),
  public.atend_diagnostico_distribuicao(uuid), public.atend_definir_presenca_manual(uuid, text, integer, uuid),
  public.atend_configurar_capacidade(uuid, uuid, integer), public.atend_distribuir_fila(uuid, integer),
  public.atend_auto_assign_conversa(uuid, uuid, uuid, text) TO authenticated, service_role;

-- Usa apenas o pg_cron já instalado. A ausência fica explícita no deploy;
-- ambientes locais mínimos podem executar o mesmo recuperador em seus testes.
DO $schedule$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    PERFORM cron.schedule('zap-os-recuperar-fila-humana', '* * * * *',
      'SELECT public.atend_recuperar_distribuicao();');
  ELSE
    RAISE NOTICE 'Zap OS: pg_cron ausente; recuperação periódica precisa ser habilitada neste ambiente';
  END IF;
END;
$schedule$;
