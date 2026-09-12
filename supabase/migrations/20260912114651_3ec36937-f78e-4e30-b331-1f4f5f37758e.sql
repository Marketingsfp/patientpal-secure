-- FASE 2 — presença do atendente é 100% manual.
-- Heartbeat vencido (visto_em antigo) deixa de excluir alguém da distribuição:
-- só a escolha manual (refletida em status/aceita_novas) e a pausa aberta decidem.

CREATE OR REPLACE FUNCTION public.atend_pool_telefonia_avaliacao(_clinica_id uuid, _departamento_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      p.user_id,
      p.status::text                                            AS presence_status,
      COALESCE(p.aceita_novas, false)                           AS aceita_novas,
      (p.visto_em > now() - interval '5 minutes')               AS presenca_recente,
      public.atend_usuario_e_admin(p.user_id, _clinica_id)      AS admin,
      public.atend_tem_perfil_telefonia(p.user_id, _clinica_id) AS perfil_telefonia,
      EXISTS (
        SELECT 1 FROM public.atend_pausas_log pl
         WHERE pl.clinica_id = _clinica_id
           AND pl.user_id = p.user_id
           AND pl.finalizada_em IS NULL
      ) AS em_pausa,
      COALESCE((
        SELECT count(*)::int FROM public.atend_conversas a
         WHERE a.clinica_id = _clinica_id
           AND a.atribuida_user_id = p.user_id
           AND a.is_teste IS NOT TRUE
           AND a.status IN ('active', 'in_progress', 'waiting')
      ), 0) AS load_at_selection,
      COALESCE((
        SELECT max(dm.max_simultaneas)::int FROM public.atend_departamento_membros dm
         WHERE dm.clinica_id = _clinica_id AND dm.user_id = p.user_id
      ), 5) AS capacidade,
      (_departamento_id IS NULL OR EXISTS (
        SELECT 1 FROM public.atend_departamento_membros dm
         WHERE dm.clinica_id = _clinica_id
           AND dm.user_id = p.user_id
           AND dm.departamento_id = _departamento_id
      )) AS do_setor
    FROM public.atend_agente_presenca p
    WHERE p.clinica_id = _clinica_id
  ), avaliado AS (
    SELECT b.*,
      CASE
        WHEN NOT b.perfil_telefonia THEN 'sem_perfil_telefonia'
        WHEN b.admin                    THEN 'admin_excluido'
        WHEN b.presence_status <> 'ONLINE' THEN 'status_' || lower(b.presence_status)
        WHEN NOT b.aceita_novas         THEN 'nao_aceita_novas'
        WHEN b.em_pausa                 THEN 'em_pausa'
        WHEN b.load_at_selection >= b.capacidade THEN 'capacidade_lotada'
        WHEN NOT b.do_setor             THEN 'setor_incompativel'
        ELSE NULL
      END AS motivo_exclusao
    FROM base b
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'user_id', a.user_id,
           'perfil_telefonia', a.perfil_telefonia,
           'permission_telefonia', a.perfil_telefonia,
           'presence_status', a.presence_status,
           'aceita_novas', a.aceita_novas,
           'presenca_recente', a.presenca_recente,
           'em_pausa', a.em_pausa,
           'admin', a.admin,
           'load_at_selection', a.load_at_selection,
           'capacidade', a.capacidade,
           'do_setor', a.do_setor,
           'elegivel', a.motivo_exclusao IS NULL,
           'motivo_exclusao', a.motivo_exclusao
         ) ORDER BY (a.motivo_exclusao IS NULL) DESC, a.load_at_selection ASC, a.user_id ASC), '[]'::jsonb)
    FROM avaliado a;
$function$;

CREATE OR REPLACE FUNCTION public.atend_auto_assign_conversa(_conversa_id uuid, _clinica_id uuid, _departamento_id uuid DEFAULT NULL::uuid, _origem text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _conv record;
  _cand record;
  _escolhido uuid := NULL;
  _tem_setor boolean := false;
  _perfil text;
  _carga int := 0;
  _limite int := 0;
  _descartados int := 0;
  _ainda_ok boolean;
  _avaliacao jsonb := '[]'::jsonb;
  _handoff_evento_id uuid;
  _presenca text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('atend_assign:' || _clinica_id::text));

  SELECT id, clinica_id, atribuida_user_id, owner_type, is_teste, departamento_id
    INTO _conv
    FROM public.atend_conversas
   WHERE id = _conversa_id AND clinica_id = _clinica_id
   FOR UPDATE;

  IF NOT FOUND THEN RETURN NULL; END IF;
  IF _conv.atribuida_user_id IS NOT NULL THEN RETURN NULL; END IF;
  IF _conv.is_teste THEN RETURN NULL; END IF;

  IF _departamento_id IS NULL THEN
    _departamento_id := _conv.departamento_id;
  END IF;

  _avaliacao := public.atend_pool_telefonia_avaliacao(_clinica_id, _departamento_id);

  CREATE TEMP TABLE IF NOT EXISTS _cand_tmp (user_id uuid) ON COMMIT DROP;
  DELETE FROM _cand_tmp WHERE true;

  -- Sem filtro por visto_em: escolha manual manda, conexão não.
  INSERT INTO _cand_tmp (user_id)
  SELECT p.user_id
    FROM public.atend_agente_presenca p
   WHERE p.clinica_id = _clinica_id
     AND p.status = 'ONLINE'
     AND p.aceita_novas = true
     AND NOT public.atend_usuario_e_admin(p.user_id, _clinica_id)
     AND public.atend_tem_perfil_telefonia(p.user_id, _clinica_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.atend_pausas_log pl
        WHERE pl.clinica_id = _clinica_id
          AND pl.user_id = p.user_id
          AND pl.finalizada_em IS NULL
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.atend_departamento_membros dm
        WHERE dm.clinica_id = _clinica_id
          AND dm.user_id = p.user_id
          AND dm.queue_locked = true
          AND NOT EXISTS (
            SELECT 1 FROM public.atend_departamento_membros dm2
             WHERE dm2.clinica_id = _clinica_id
               AND dm2.user_id = p.user_id
               AND dm2.queue_locked = false
          )
     );

  IF NOT EXISTS (SELECT 1 FROM _cand_tmp) THEN RETURN NULL; END IF;

  IF _departamento_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM _cand_tmp c
       JOIN public.atend_departamento_membros dm
         ON dm.user_id = c.user_id
        AND dm.clinica_id = _clinica_id
        AND dm.departamento_id = _departamento_id
    ) INTO _tem_setor;

    IF _tem_setor THEN
      DELETE FROM _cand_tmp c
       WHERE NOT EXISTS (
         SELECT 1 FROM public.atend_departamento_membros dm
          WHERE dm.user_id = c.user_id
            AND dm.clinica_id = _clinica_id
            AND dm.departamento_id = _departamento_id
       );
    END IF;
  END IF;

  FOR _cand IN
    SELECT c.user_id,
           COALESCE(carga.ativas, 0) AS ativas,
           COALESCE(lim.maximo, 5)   AS maximo
      FROM _cand_tmp c
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS ativas,
               max(a.assigned_at) AS ultima
          FROM public.atend_conversas a
         WHERE a.clinica_id = _clinica_id
           AND a.atribuida_user_id = c.user_id
           AND a.is_teste IS NOT TRUE
           AND a.status IN ('active', 'in_progress', 'waiting')
      ) carga ON true
      LEFT JOIN LATERAL (
        SELECT max(a2.assigned_at) AS ultima_geral
          FROM public.atend_conversas a2
         WHERE a2.clinica_id = _clinica_id
           AND a2.atribuida_user_id = c.user_id
           AND a2.is_teste IS NOT TRUE
      ) hist ON true
      LEFT JOIN LATERAL (
        SELECT max(dm.max_simultaneas)::int AS maximo
          FROM public.atend_departamento_membros dm
         WHERE dm.clinica_id = _clinica_id
           AND dm.user_id = c.user_id
      ) lim ON true
     WHERE COALESCE(carga.ativas, 0) < COALESCE(lim.maximo, 5)
     ORDER BY COALESCE(carga.ativas, 0) ASC,
              COALESCE(hist.ultima_geral, to_timestamp(0)) ASC,
              c.user_id ASC
  LOOP
    SELECT EXISTS (
      SELECT 1
        FROM public.atend_agente_presenca p
       WHERE p.clinica_id = _clinica_id
         AND p.user_id = _cand.user_id
         AND p.status = 'ONLINE'
         AND p.aceita_novas = true
         AND NOT public.atend_usuario_e_admin(p.user_id, _clinica_id)
         AND public.atend_tem_perfil_telefonia(p.user_id, _clinica_id)
         AND NOT EXISTS (
           SELECT 1 FROM public.atend_pausas_log pl
            WHERE pl.clinica_id = _clinica_id
              AND pl.user_id = p.user_id
              AND pl.finalizada_em IS NULL
         )
    ) INTO _ainda_ok;

    IF NOT _ainda_ok THEN
      _descartados := _descartados + 1;
      CONTINUE;
    END IF;

    _escolhido := _cand.user_id;
    _carga     := _cand.ativas;
    _limite    := _cand.maximo;
    EXIT;
  END LOOP;

  IF _escolhido IS NULL THEN RETURN NULL; END IF;

  UPDATE public.atend_conversas
     SET atribuida_user_id = _escolhido,
         owner_type = 'HUMAN',
         ai_enabled = false,
         status = 'active',
         aguardando_desde = NULL,
         assigned_at = now(),
         atribuicao_origem = COALESCE(_origem, 'auto_assignment'),
         updated_at = now()
   WHERE id = _conversa_id
     AND clinica_id = _clinica_id
     AND atribuida_user_id IS NULL;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT m.role::text INTO _perfil
    FROM public.clinica_memberships m
   WHERE m.clinica_id = _clinica_id
     AND m.user_id = _escolhido
     AND m.ativo = true
   LIMIT 1;

  SELECT e.id INTO _handoff_evento_id
    FROM public.atend_conversa_eventos e
   WHERE e.conversa_id = _conversa_id
     AND e.evento IN ('HANDOFF', 'TRANSFERIDA_IA', 'AGUARDANDO_HUMANO')
   ORDER BY e.created_at DESC
   LIMIT 1;

  SELECT p.status::text INTO _presenca
    FROM public.atend_agente_presenca p
   WHERE p.clinica_id = _clinica_id AND p.user_id = _escolhido;

  INSERT INTO public.atend_conversa_eventos
    (clinica_id, conversa_id, evento, user_id, departamento_id, motivo, detalhes)
  VALUES
    (_clinica_id, _conversa_id, 'ASSUMIDA', _escolhido, _departamento_id,
     'Atribuição automática (menor carga)',
     jsonb_build_object(
       'conversation_id', _conversa_id,
       'handoff_event_id', _handoff_evento_id,
       'selected_user_id', _escolhido,
       'perfil_telefonia', true,
       'permission_telefonia', true,
       'presence_status', COALESCE(_presenca, 'ONLINE'),
       'load_at_selection', COALESCE(_carga, 0),
       'unit_queue', _departamento_id,
       'assignment_method', 'distribuicao_automatica',
       'assigned_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
       'origem', COALESCE(_origem, 'auto_assignment'),
       'origem_handoff', 'handoff_nina',
       'perfil', COALESCE(_perfil, 'desconhecido'),
       'permissao_elegivel', 'perfil:telefonia',
       'limite_simultaneas', COALESCE(_limite, 5),
       'candidatos_descartados_na_revalidacao', _descartados,
       'candidates_evaluated', _avaliacao,
       'metodo', 'distribuicao_automatica',
       'atendente_user_id', _escolhido,
       'carga_no_momento', COALESCE(_carga, 0),
       'departamento_id', _departamento_id,
       'distribuido_em', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
     ));

  RETURN _escolhido;
END;
$function$;
