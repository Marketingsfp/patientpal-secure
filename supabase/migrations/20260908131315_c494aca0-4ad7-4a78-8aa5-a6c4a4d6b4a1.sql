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
BEGIN
  -- Trava por clínica: dois handoffs simultâneos, dois workers, webhook
  -- duplicado ou retry entram em fila aqui e nunca escolhem ao mesmo tempo.
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

  CREATE TEMP TABLE IF NOT EXISTS _cand_tmp (user_id uuid) ON COMMIT DROP;
  DELETE FROM _cand_tmp WHERE true;

  -- Elegibilidade lida AO VIVO do banco (o cliente nunca manda lista pronta):
  -- Telefonia + Online + aceita novas + presença recente + sem pausa
  -- + não administrador + fila não travada.
  INSERT INTO _cand_tmp (user_id)
  SELECT p.user_id
    FROM public.atend_agente_presenca p
   WHERE p.clinica_id = _clinica_id
     AND p.status = 'ONLINE'
     AND p.aceita_novas = true
     AND p.visto_em > now() - interval '5 minutes'
     AND NOT public.atend_usuario_e_admin(p.user_id, _clinica_id)
     AND public.has_module_access(p.user_id, _clinica_id, 'telefonia', 'read')
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

  -- Setor da conversa só filtra quando existe candidato elegível daquele setor.
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

  -- Ordem de preferência (balanceamento):
  --   1) menor carga: conversas REAIS em andamento (active/in_progress/waiting)
  --      atribuídas à pessoa, sem contar conversas de teste da homologação;
  --   2) empate: quem está há mais tempo sem receber conversa (histórico
  --      completo de assigned_at), o que produz rodízio justo em vez de
  --      premiar sempre o primeiro da consulta;
  --   3) empate total: user_id, apenas para o resultado ser determinístico.
  -- Quem já atingiu o limite de simultâneas do setor é descartado aqui.
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
    -- Revalidação imediatamente antes de persistir: entre a leitura do pool e
    -- a gravação a pessoa pode ter entrado em pausa, ficado offline ou perdido
    -- a permissão. Se isso aconteceu, ela é descartada e a vez passa para a
    -- próxima da fila — nunca se entrega conversa a quem não pode receber.
    SELECT EXISTS (
      SELECT 1
        FROM public.atend_agente_presenca p
       WHERE p.clinica_id = _clinica_id
         AND p.user_id = _cand.user_id
         AND p.status = 'ONLINE'
         AND p.aceita_novas = true
         AND p.visto_em > now() - interval '5 minutes'
         AND NOT public.atend_usuario_e_admin(p.user_id, _clinica_id)
         AND public.has_module_access(p.user_id, _clinica_id, 'telefonia', 'read')
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

  -- Ninguém elegível: a conversa continua em "Não atribuídas".
  IF _escolhido IS NULL THEN RETURN NULL; END IF;

  -- Compare-and-set: só grava se a conversa continuar sem dono. Um segundo
  -- evento de handoff para a mesma conversa não cria atribuição duplicada.
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

  INSERT INTO public.atend_conversa_eventos
    (clinica_id, conversa_id, evento, user_id, departamento_id, motivo, detalhes)
  VALUES
    (_clinica_id, _conversa_id, 'ASSUMIDA', _escolhido, _departamento_id,
     'Atribuição automática (menor carga)',
     jsonb_build_object(
       'origem', COALESCE(_origem, 'auto_assignment'),
       'metodo', 'distribuicao_automatica',
       'atendente_user_id', _escolhido,
       'perfil', COALESCE(_perfil, 'desconhecido'),
       'permissao_elegivel', 'telefonia',
       'carga_no_momento', COALESCE(_carga, 0),
       'limite_simultaneas', COALESCE(_limite, 5),
       'candidatos_descartados_na_revalidacao', _descartados,
       'departamento_id', _departamento_id,
       'distribuido_em', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
     ));

  RETURN _escolhido;
END;
$function$;