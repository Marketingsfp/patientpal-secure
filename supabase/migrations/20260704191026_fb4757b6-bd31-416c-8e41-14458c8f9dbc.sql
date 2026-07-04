
CREATE OR REPLACE FUNCTION public.paciente_resumo_recepcao(_paciente_id uuid, _clinica_id uuid)
RETURNS TABLE(
  paciente_id uuid,
  nome text,
  telefone text,
  idade int,
  tipo text,                       -- 'associado' | 'particular'
  convenio_nome text,
  empresa_nome text,
  ultima_consulta_data timestamptz,
  ultima_consulta_medico text,
  ultima_consulta_especialidade text,
  ultimo_exame_data timestamptz,
  ultimo_exame_nome text,
  pendencia_valor numeric,
  pendencia_qtd int,
  cadastro_incompleto boolean,
  whatsapp_valido boolean,
  faltantes text[]
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  p public.pacientes%ROWTYPE;
  v_allowed boolean;
  v_faltantes text[];
  v_nfse_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.clinica_memberships m
    WHERE m.user_id = auth.uid() AND m.ativo AND m.clinica_id = _clinica_id
  ) INTO v_allowed;
  IF NOT v_allowed THEN RETURN; END IF;

  SELECT * INTO p FROM public.pacientes WHERE id = _paciente_id AND clinica_id = _clinica_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT faltantes, nfse_ok INTO v_faltantes, v_nfse_ok
  FROM public.paciente_pendencias_cadastro(_paciente_id);

  RETURN QUERY
  WITH ult_consulta AS (
    SELECT a.inicio, m.nome AS medico_nome, e.nome AS esp_nome
    FROM public.agendamentos a
    LEFT JOIN public.medicos m ON m.id = a.medico_id
    LEFT JOIN public.medico_especialidades me ON me.medico_id = m.id
    LEFT JOIN public.especialidades e ON e.id = me.especialidade_id
    WHERE a.paciente_id = _paciente_id
      AND a.clinica_id = _clinica_id
      AND a.inicio <= now()
      AND coalesce(a.tipo_atendimento,'consulta') = 'consulta'
    ORDER BY a.inicio DESC
    LIMIT 1
  ),
  ult_exame AS (
    SELECT a.inicio, a.procedimento
    FROM public.agendamentos a
    WHERE a.paciente_id = _paciente_id
      AND a.clinica_id = _clinica_id
      AND a.inicio <= now()
      AND coalesce(a.tipo_atendimento,'') = 'exame'
    ORDER BY a.inicio DESC
    LIMIT 1
  ),
  contrato AS (
    SELECT c.id, cv.nome AS convenio_nome
    FROM public.contratos_assinatura c
    LEFT JOIN public.cb_convenios cv ON cv.id = c.convenio_id
    WHERE c.paciente_id = _paciente_id
      AND c.clinica_id = _clinica_id
      AND c.status = 'ativo'
    ORDER BY c.created_at DESC
    LIMIT 1
  ),
  pend AS (
    SELECT coalesce(sum(l.valor),0) AS valor, count(*)::int AS qtd
    FROM public.fin_lancamentos l
    WHERE l.paciente_id = _paciente_id
      AND l.clinica_id = _clinica_id
      AND l.tipo = 'receita'
      AND l.status IN ('pendente','vencido','parcial')
  )
  SELECT
    p.id,
    p.nome,
    p.telefone,
    CASE WHEN p.data_nascimento IS NULL THEN NULL
         ELSE extract(year FROM age(p.data_nascimento))::int END AS idade,
    CASE WHEN (SELECT id FROM contrato) IS NOT NULL THEN 'associado' ELSE 'particular' END AS tipo,
    (SELECT convenio_nome FROM contrato),
    NULL::text AS empresa_nome,
    (SELECT inicio FROM ult_consulta),
    (SELECT medico_nome FROM ult_consulta),
    (SELECT esp_nome FROM ult_consulta),
    (SELECT inicio FROM ult_exame),
    (SELECT procedimento FROM ult_exame),
    (SELECT valor FROM pend),
    (SELECT qtd FROM pend),
    NOT v_nfse_ok,
    (length(regexp_replace(coalesce(p.telefone,''),'\D','','g')) >= 10),
    v_faltantes;
END;
$$;

GRANT EXECUTE ON FUNCTION public.paciente_resumo_recepcao(uuid, uuid) TO authenticated;
