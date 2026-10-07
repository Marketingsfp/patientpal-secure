CREATE OR REPLACE FUNCTION public._rel_agendamentos_acoes(
  _clinica_id uuid,
  _ini date,
  _fim date
)
RETURNS TABLE (
  record_id text,
  feito_em timestamptz,
  user_id uuid,
  user_email text,
  tipo text,
  paciente_nome text,
  inicio text,
  medico_id text,
  procedimento text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH ev AS (
    SELECT
      al.record_id::text AS record_id,
      al.user_id,
      al.user_email,
      al.action,
      al.created_at,
      lower(unaccent(COALESCE(al.dados_antes ->> 'paciente_nome', '')))
        NOT IN ('', 'disponivel', 'bloqueio') AS tinha_pac,
      lower(unaccent(COALESCE(al.dados_depois ->> 'paciente_nome', '')))
        NOT IN ('', 'disponivel', 'bloqueio') AS tem_pac,
      al.dados_antes ->> 'paciente_nome' AS pac_antes,
      al.dados_depois ->> 'paciente_nome' AS pac_depois,
      al.dados_antes ->> 'status' AS st_antes,
      al.dados_depois ->> 'status' AS st_depois,
      al.dados_antes ->> 'reagendamento_em' AS rg_antes,
      al.dados_depois ->> 'reagendamento_em' AS rg_depois,
      COALESCE(al.dados_depois ->> 'inicio', al.dados_antes ->> 'inicio') AS inicio,
      COALESCE(al.dados_depois ->> 'medico_id', al.dados_antes ->> 'medico_id') AS medico_id,
      COALESCE(al.dados_depois ->> 'procedimento', al.dados_antes ->> 'procedimento') AS procedimento
    FROM public.audit_log al
    WHERE al.clinica_id = _clinica_id
      AND al.table_name = 'agendamentos'
      AND al.created_at >= (_ini::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND al.created_at < ((_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
  ),
  marc AS (
    SELECT * FROM ev
    WHERE ev.tem_pac
      AND (ev.action = 'INSERT' OR (ev.action = 'UPDATE' AND NOT ev.tinha_pac))
  ),
  lib AS (
    SELECT * FROM ev
    WHERE ev.action = 'UPDATE' AND ev.tinha_pac AND NOT ev.tem_pac
  )
  SELECT
    m.record_id, m.created_at, m.user_id, m.user_email,
    CASE
      WHEN (m.rg_depois IS NOT NULL AND m.rg_depois IS DISTINCT FROM m.rg_antes)
        OR EXISTS (
          SELECT 1 FROM lib l
          WHERE l.created_at = m.created_at AND l.pac_antes = m.pac_depois
        )
      THEN 'remarcado'
      ELSE 'marcado'
    END,
    m.pac_depois, m.inicio, m.medico_id, m.procedimento
  FROM marc m
  UNION ALL
  SELECT l.record_id, l.created_at, l.user_id, l.user_email, 'cancelado',
         l.pac_antes, l.inicio, l.medico_id, l.procedimento
  FROM lib l
  WHERE COALESCE(l.st_antes, '') <> 'cancelado'
    AND NOT EXISTS (
      SELECT 1 FROM marc m
      WHERE m.created_at = l.created_at AND m.pac_depois = l.pac_antes
    )
  UNION ALL
  SELECT e.record_id, e.created_at, e.user_id, e.user_email, 'cancelado',
         e.pac_antes, e.inicio, e.medico_id, e.procedimento
  FROM ev e
  WHERE e.action = 'DELETE' AND e.tinha_pac AND COALESCE(e.st_antes, '') <> 'cancelado'
  UNION ALL
  SELECT e.record_id, e.created_at, e.user_id, e.user_email, 'cancelado',
         COALESCE(NULLIF(e.pac_depois, ''), e.pac_antes), e.inicio, e.medico_id, e.procedimento
  FROM ev e
  WHERE e.action = 'UPDATE' AND e.st_depois = 'cancelado'
    AND e.st_antes IS DISTINCT FROM 'cancelado'
  UNION ALL
  SELECT e.record_id, e.created_at, e.user_id, e.user_email, 'confirmado',
         COALESCE(NULLIF(e.pac_depois, ''), e.pac_antes), e.inicio, e.medico_id, e.procedimento
  FROM ev e
  WHERE e.action = 'UPDATE' AND e.st_depois = 'confirmado'
    AND e.st_antes IS DISTINCT FROM 'confirmado'
$$;

REVOKE ALL ON FUNCTION public._rel_agendamentos_acoes(uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._rel_agendamentos_acoes(uuid, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public._rel_agendamentos_acoes(uuid, date, date) FROM authenticated;

CREATE OR REPLACE FUNCTION public.rel_agendamentos_por_usuario_dia(
  _clinica_id uuid,
  _ini date,
  _fim date
)
RETURNS TABLE (
  usuario_id uuid,
  usuario_nome text,
  dia date,
  marcados bigint,
  confirmados bigint,
  cancelados bigint,
  remarcados bigint
)
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

  IF _ini IS NULL OR _fim IS NULL OR _fim < _ini THEN
    RAISE EXCEPTION 'Informe um período válido.';
  END IF;

  RETURN QUERY
  SELECT
    a.user_id,
    COALESCE(p.nome, max(a.user_email), 'Sistema') AS usuario_nome,
    (a.feito_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
    count(*) FILTER (WHERE a.tipo = 'marcado')::bigint,
    count(*) FILTER (WHERE a.tipo = 'confirmado')::bigint,
    count(*) FILTER (WHERE a.tipo = 'cancelado')::bigint,
    count(*) FILTER (WHERE a.tipo = 'remarcado')::bigint
  FROM public._rel_agendamentos_acoes(_clinica_id, _ini, _fim) a
  LEFT JOIN public.profiles p ON p.id = a.user_id
  GROUP BY a.user_id, p.nome, 3
  ORDER BY 2, 3;
END;
$$;

REVOKE ALL ON FUNCTION public.rel_agendamentos_por_usuario_dia(uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rel_agendamentos_por_usuario_dia(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.rel_agendamentos_por_usuario_dia(uuid, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.rel_agendamentos_por_usuario_lista(
  _clinica_id uuid,
  _dia date,
  _usuario_id uuid
)
RETURNS TABLE (
  agendamento_id text,
  feito_em timestamptz,
  tipo text,
  paciente_nome text,
  inicio timestamptz,
  medico_nome text,
  procedimento text
)
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

  IF _dia IS NULL THEN
    RAISE EXCEPTION 'Informe o dia.';
  END IF;

  RETURN QUERY
  SELECT
    a.record_id,
    a.feito_em,
    a.tipo,
    a.paciente_nome,
    NULLIF(a.inicio, '')::timestamptz,
    m.nome,
    a.procedimento
  FROM public._rel_agendamentos_acoes(_clinica_id, _dia, _dia) a
  LEFT JOIN public.medicos m ON m.id::text = a.medico_id
  WHERE a.user_id IS NOT DISTINCT FROM _usuario_id
  ORDER BY a.feito_em, a.paciente_nome;
END;
$$;

REVOKE ALL ON FUNCTION public.rel_agendamentos_por_usuario_lista(uuid, date, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rel_agendamentos_por_usuario_lista(uuid, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rel_agendamentos_por_usuario_lista(uuid, date, uuid) TO authenticated;