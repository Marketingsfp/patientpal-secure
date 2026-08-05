
-- 1. Trigger de auditoria: nunca gravar autor totalmente em branco
CREATE OR REPLACE FUNCTION public.fn_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_clinica uuid;
  v_record_id text;
  v_before jsonb;
  v_after jsonb;
  v_headers jsonb;
  v_ip inet;
  v_ua text;
  v_role text;
  v_actor_source text;
BEGIN
  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  EXCEPTION WHEN OTHERS THEN v_email := NULL; END;

  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_ua := v_headers->>'user-agent';
    BEGIN
      v_ip := NULLIF(
        split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1),
        ''
      )::inet;
    EXCEPTION WHEN OTHERS THEN v_ip := NULL; END;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL; v_ua := NULL; v_ip := NULL;
  END;

  -- Preencher autor "Sistema" quando não houver usuário autenticado
  IF v_user_id IS NULL THEN
    BEGIN
      v_role := current_setting('request.jwt.claim.role', true);
    EXCEPTION WHEN OTHERS THEN v_role := NULL; END;

    BEGIN
      v_actor_source := current_setting('app.actor_source', true);
    EXCEPTION WHEN OTHERS THEN v_actor_source := NULL; END;

    IF v_actor_source IS NOT NULL AND v_actor_source <> '' THEN
      v_email := 'sistema (' || v_actor_source || ')';
    ELSIF v_role = 'service_role' THEN
      v_email := 'sistema (service_role)';
    ELSIF v_headers IS NULL THEN
      v_email := 'sistema (manutenção)';
    ELSE
      v_email := 'sistema';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_before := to_jsonb(OLD);
    v_after := NULL;
    v_record_id := (to_jsonb(OLD)->>'id');
    v_clinica := NULLIF(to_jsonb(OLD)->>'clinica_id','')::uuid;
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_record_id := (to_jsonb(NEW)->>'id');
    v_clinica := NULLIF(to_jsonb(NEW)->>'clinica_id','')::uuid;
  ELSE
    v_before := NULL;
    v_after := to_jsonb(NEW);
    v_record_id := (to_jsonb(NEW)->>'id');
    v_clinica := NULLIF(to_jsonb(NEW)->>'clinica_id','')::uuid;
  END IF;

  INSERT INTO public.audit_log (
    user_id, user_email, clinica_id, table_name, record_id, action,
    dados_antes, dados_depois, ip_address, user_agent
  ) VALUES (
    v_user_id, v_email, v_clinica, TG_TABLE_NAME, v_record_id, TG_OP,
    v_before, v_after, v_ip, v_ua
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 2. RPC contrato_historico: devolver "Sistema" como fallback
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
  contrato_audit AS (
    SELECT
      a.id, a.created_at AS ts,
      CASE WHEN a.action = 'INSERT' THEN 'contrato_criado'
           WHEN a.action = 'DELETE' THEN 'contrato_excluido'
           ELSE 'contrato_alterado' END AS tipo,
      a.action, a.user_id, a.user_email,
      a.dados_antes, a.dados_depois, NULL::text AS extra
    FROM public.audit_log a
    WHERE a.table_name = 'contratos_assinatura'
      AND a.record_id = _contrato_id::text
  ),
  dep_audit AS (
    SELECT
      a.id, a.created_at AS ts,
      CASE WHEN a.action = 'INSERT' THEN 'dependente_incluido'
           WHEN a.action = 'DELETE' THEN 'dependente_excluido'
           ELSE 'dependente_alterado' END AS tipo,
      a.action, a.user_id, a.user_email,
      a.dados_antes, a.dados_depois,
      COALESCE(a.dados_depois->>'paciente_nome', a.dados_antes->>'paciente_nome') AS extra
    FROM public.audit_log a
    WHERE a.table_name = 'contrato_dependentes'
      AND (
        (a.dados_depois->>'contrato_id') = _contrato_id::text
        OR (a.dados_antes->>'contrato_id') = _contrato_id::text
      )
  ),
  dep_fallback AS (
    SELECT
      d.id, (d.incluido_em::timestamptz + interval '12 hours') AS ts,
      'dependente_incluido_legado' AS tipo, 'INSERT'::text AS action,
      NULL::uuid AS user_id, NULL::text AS user_email,
      NULL::jsonb AS dados_antes, to_jsonb(d) AS dados_depois,
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
      d.id, (d.excluido_em::timestamptz + interval '12 hours'),
      'dependente_excluido_legado', 'DELETE',
      NULL, NULL, to_jsonb(d), NULL::jsonb, d.paciente_nome
    FROM public.contrato_dependentes d
    WHERE d.contrato_id = _contrato_id
      AND d.excluido_em IS NOT NULL
      AND d.ativo = false
      AND NOT EXISTS (
        SELECT 1 FROM public.audit_log a
        WHERE a.table_name = 'contrato_dependentes'
          AND a.action IN ('UPDATE','DELETE')
          AND ((a.dados_depois->>'id') = d.id::text OR (a.dados_antes->>'id') = d.id::text)
          AND ((a.dados_depois->>'ativo') = 'false' OR a.action = 'DELETE')
      )
  ),
  mens_audit AS (
    SELECT
      a.id, a.created_at AS ts,
      'mensalidade_alterada' AS tipo, a.action,
      a.user_id, a.user_email, a.dados_antes, a.dados_depois,
      COALESCE(a.dados_depois->>'numero_parcela', a.dados_antes->>'numero_parcela') AS extra
    FROM public.audit_log a
    WHERE a.table_name = 'contrato_mensalidades'
      AND a.action = 'UPDATE'
      AND (
        (a.dados_depois->>'contrato_id') = _contrato_id::text
        OR (a.dados_antes->>'contrato_id') = _contrato_id::text
      )
  ),
  renov AS (
    SELECT
      r.id, r.created_at AS ts, 'renovacao' AS tipo, 'INSERT'::text AS action,
      r.usuario_id AS user_id, NULL::text AS user_email,
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
      t.id, t.ts, t.tipo, t.action, t.user_id,
      COALESCE(p.nome, NULLIF(t.user_email, ''), 'Sistema') AS user_nome,
      t.user_email,
      t.dados_antes, t.dados_depois, t.extra
    FROM todos t
    LEFT JOIN public.profiles p ON p.id = t.user_id
  ) x;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- 3. RPCs internas declaram origem para o trigger de auditoria
--    (só afeta o email 'sistema (...)' quando auth.uid() estiver ausente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trocar_convenio_contrato') THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.__actor_set_trocar_convenio() RETURNS void
      LANGUAGE sql AS 'SELECT set_config(''app.actor_source'', ''trocar_convenio_contrato'', true)::void';
    $body$;
  END IF;
END $$;
