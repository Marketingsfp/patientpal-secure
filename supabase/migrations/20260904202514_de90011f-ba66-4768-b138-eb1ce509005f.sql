CREATE OR REPLACE FUNCTION public.atend_auto_assign_conversa(
  _conversa_id uuid,
  _clinica_id uuid,
  _departamento_id uuid DEFAULT NULL,
  _origem text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conv record;
  _escolhido uuid;
  _tem_setor boolean := false;
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

  CREATE TEMP TABLE IF NOT EXISTS _cand_tmp (user_id uuid) ON COMMIT DROP;
  DELETE FROM _cand_tmp WHERE true;

  INSERT INTO _cand_tmp (user_id)
  SELECT p.user_id
    FROM public.atend_agente_presenca p
   WHERE p.clinica_id = _clinica_id
     AND p.status = 'ONLINE'
     AND p.aceita_novas = true
     AND p.visto_em > now() - interval '5 minutes'
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

  SELECT c.user_id INTO _escolhido
    FROM _cand_tmp c
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS ativas,
             max(a.assigned_at) AS ultima
        FROM public.atend_conversas a
       WHERE a.clinica_id = _clinica_id
         AND a.atribuida_user_id = c.user_id
         AND a.status IN ('active', 'in_progress', 'waiting')
    ) carga ON true
   ORDER BY COALESCE(carga.ativas, 0) ASC,
            COALESCE(carga.ultima, to_timestamp(0)) ASC,
            c.user_id ASC
   LIMIT 1;

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

  INSERT INTO public.atend_conversa_eventos
    (clinica_id, conversa_id, evento, user_id, departamento_id, motivo, detalhes)
  VALUES
    (_clinica_id, _conversa_id, 'ASSUMIDA', _escolhido, _departamento_id,
     'Atribuição automática (menor carga)',
     jsonb_build_object('origem', COALESCE(_origem, 'auto_assignment')));

  RETURN _escolhido;
END;
$$;