
-- 1) Trigger de auditoria em contrato_dependentes
DROP TRIGGER IF EXISTS trg_audit_contrato_dependentes ON public.contrato_dependentes;
CREATE TRIGGER trg_audit_contrato_dependentes
AFTER INSERT OR UPDATE OR DELETE ON public.contrato_dependentes
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- 2) RPC unificada de histórico do contrato
CREATE OR REPLACE FUNCTION public.contrato_historico(_contrato_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica uuid;
  v_result jsonb;
BEGIN
  SELECT clinica_id INTO v_clinica
  FROM public.contratos_assinatura
  WHERE id = _contrato_id;

  IF v_clinica IS NULL THEN
    RETURN jsonb_build_array();
  END IF;

  IF NOT public.is_member(auth.uid(), v_clinica) THEN
    RAISE EXCEPTION 'Acesso negado ao histórico deste contrato';
  END IF;

  WITH
  -- Auditoria do próprio contrato
  contrato_audit AS (
    SELECT
      a.id,
      a.created_at AS ts,
      CASE WHEN a.action = 'INSERT' THEN 'contrato_criado'
           WHEN a.action = 'DELETE' THEN 'contrato_excluido'
           ELSE 'contrato_alterado' END AS tipo,
      a.action,
      a.user_id,
      a.user_email,
      a.dados_antes,
      a.dados_depois,
      NULL::text AS extra
    FROM public.audit_log a
    WHERE a.table_name = 'contratos_assinatura'
      AND a.record_id = _contrato_id::text
  ),
  -- Auditoria de dependentes deste contrato
  dep_audit AS (
    SELECT
      a.id,
      a.created_at AS ts,
      CASE WHEN a.action = 'INSERT' THEN 'dependente_incluido'
           WHEN a.action = 'DELETE' THEN 'dependente_excluido'
           ELSE 'dependente_alterado' END AS tipo,
      a.action,
      a.user_id,
      a.user_email,
      a.dados_antes,
      a.dados_depois,
      COALESCE(a.dados_depois->>'paciente_nome', a.dados_antes->>'paciente_nome') AS extra
    FROM public.audit_log a
    WHERE a.table_name = 'contrato_dependentes'
      AND (
        (a.dados_depois->>'contrato_id') = _contrato_id::text
        OR (a.dados_antes->>'contrato_id') = _contrato_id::text
      )
  ),
  -- Fallback: dependentes já existentes sem trigger anterior
  dep_fallback AS (
    SELECT
      d.id,
      (d.incluido_em::timestamptz + interval '12 hours') AS ts,
      'dependente_incluido_legado' AS tipo,
      'INSERT'::text AS action,
      NULL::uuid AS user_id,
      NULL::text AS user_email,
      NULL::jsonb AS dados_antes,
      to_jsonb(d) AS dados_depois,
      d.paciente_nome AS extra
    FROM public.contrato_dependentes d
    WHERE d.contrato_id = _contrato_id
      AND NOT EXISTS (
        SELECT 1 FROM public.audit_log a
        WHERE a.table_name = 'contrato_dependentes'
          AND a.action = 'INSERT'
          AND (a.dados_depois->>'id') = d.id::text
      )
    UNION ALL
    SELECT
      d.id,
      (d.excluido_em::timestamptz + interval '12 hours'),
      'dependente_excluido_legado',
      'DELETE',
      NULL, NULL, to_jsonb(d), NULL::jsonb,
      d.paciente_nome
    FROM public.contrato_dependentes d
    WHERE d.contrato_id = _contrato_id
      AND d.excluido_em IS NOT NULL
      AND d.ativo = false
      AND NOT EXISTS (
        SELECT 1 FROM public.audit_log a
        WHERE a.table_name = 'contrato_dependentes'
          AND a.action IN ('UPDATE','DELETE')
          AND ((a.dados_depois->>'id') = d.id::text OR (a.dados_antes->>'id') = d.id::text)
          AND (
            (a.dados_depois->>'ativo') = 'false'
            OR a.action = 'DELETE'
          )
      )
  ),
  -- Auditoria de mensalidades deste contrato (só UPDATEs manuais interessam)
  mens_audit AS (
    SELECT
      a.id,
      a.created_at AS ts,
      'mensalidade_alterada' AS tipo,
      a.action,
      a.user_id,
      a.user_email,
      a.dados_antes,
      a.dados_depois,
      COALESCE(a.dados_depois->>'numero_parcela', a.dados_antes->>'numero_parcela') AS extra
    FROM public.audit_log a
    WHERE a.table_name = 'contrato_mensalidades'
      AND a.action = 'UPDATE'
      AND (
        (a.dados_depois->>'contrato_id') = _contrato_id::text
        OR (a.dados_antes->>'contrato_id') = _contrato_id::text
      )
  ),
  -- Renovações
  renov AS (
    SELECT
      r.id,
      r.created_at AS ts,
      'renovacao' AS tipo,
      'INSERT'::text AS action,
      r.usuario_id AS user_id,
      NULL::text AS user_email,
      NULL::jsonb AS dados_antes,
      jsonb_build_object(
        'tipo', r.tipo,
        'convenio_anterior_id', r.convenio_anterior_id,
        'convenio_novo_id', r.convenio_novo_id,
        'valor_anterior', r.valor_anterior,
        'valor_novo', r.valor_novo,
        'parcelas_geradas', r.parcelas_geradas,
        'periodo_inicio', r.periodo_inicio,
        'periodo_fim', r.periodo_fim,
        'observacao', r.observacao,
        'dependentes_incluidos', r.dependentes_incluidos,
        'contrato_novo_id', r.contrato_novo_id
      ) AS dados_depois,
      r.tipo AS extra
    FROM public.contrato_renovacoes r
    WHERE r.contrato_id = _contrato_id
  ),
  todos AS (
    SELECT * FROM contrato_audit
    UNION ALL SELECT * FROM dep_audit
    UNION ALL SELECT * FROM dep_fallback
    UNION ALL SELECT * FROM mens_audit
    UNION ALL SELECT * FROM renov
  )
  SELECT jsonb_agg(x ORDER BY ts DESC)
  INTO v_result
  FROM (
    SELECT
      t.id,
      t.ts,
      t.tipo,
      t.action,
      t.user_id,
      COALESCE(p.nome, t.user_email) AS user_nome,
      t.user_email,
      t.dados_antes,
      t.dados_depois,
      t.extra
    FROM todos t
    LEFT JOIN public.profiles p ON p.id = t.user_id
  ) x;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.contrato_historico(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contrato_historico(uuid) TO authenticated;
