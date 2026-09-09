CREATE INDEX IF NOT EXISTS idx_audit_agend_record_data
  ON public.audit_log (record_id, created_at DESC)
  WHERE table_name = 'agendamentos';

CREATE OR REPLACE FUNCTION public.rel_marcacoes_por_atendente(
  _clinica_id uuid,
  _atend_ini date DEFAULT NULL,
  _atend_fim date DEFAULT NULL,
  _marc_ini date DEFAULT NULL,
  _marc_fim date DEFAULT NULL,
  _status text DEFAULT NULL,
  _medico_id uuid DEFAULT NULL,
  _especialidade_id uuid DEFAULT NULL
)
RETURNS TABLE (usuario_id uuid, usuario_nome text, qtd bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.clinica_memberships cm
    WHERE cm.user_id = auth.uid()
      AND cm.clinica_id = _clinica_id
      AND cm.ativo
      AND cm.pode_autorizar
      AND cm.role IN ('admin', 'gestor')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para ver a produtividade da equipe.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    m.user_id,
    COALESCE(
      p.nome,
      m.user_email,
      CASE WHEN m.achou THEN '(não identificado)' ELSE '(marcado antes do registro)' END
    ) AS usuario_nome,
    count(*)::bigint AS qtd
  FROM public.agendamentos a
  LEFT JOIN LATERAL (
    SELECT al.user_id, al.user_email, al.created_at, true AS achou
    FROM public.audit_log al
    WHERE al.record_id = a.id::text
      AND al.table_name = 'agendamentos'
      AND al.action IN ('INSERT', 'UPDATE')
      AND lower(unaccent(COALESCE(al.dados_depois ->> 'paciente_nome', '')))
            NOT IN ('', 'disponivel', 'bloqueio')
      AND (
        al.action = 'INSERT'
        OR lower(unaccent(COALESCE(al.dados_antes ->> 'paciente_nome', '')))
             IN ('', 'disponivel', 'bloqueio')
      )
    ORDER BY al.created_at DESC
    LIMIT 1
  ) m ON true
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE a.clinica_id = _clinica_id
    AND lower(unaccent(COALESCE(a.paciente_nome, ''))) NOT IN ('', 'disponivel', 'bloqueio')
    AND (_atend_ini IS NULL OR (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date >= _atend_ini)
    AND (_atend_fim IS NULL OR (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date <= _atend_fim)
    AND (_marc_ini IS NULL OR (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= _marc_ini)
    AND (_marc_fim IS NULL OR (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= _marc_fim)
    AND (_status IS NULL OR a.status::text = _status)
    AND (_medico_id IS NULL OR a.medico_id = _medico_id)
    AND (
      _especialidade_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.medico_especialidades me
        WHERE me.medico_id = a.medico_id
          AND me.especialidade_id = _especialidade_id
      )
    )
  GROUP BY 1, 2
  ORDER BY 3 DESC, 2;
END;
$$;

REVOKE ALL ON FUNCTION public.rel_marcacoes_por_atendente(
  uuid, date, date, date, date, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rel_marcacoes_por_atendente(
  uuid, date, date, date, date, text, uuid, uuid) TO authenticated;