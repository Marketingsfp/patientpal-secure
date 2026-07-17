
ALTER TABLE public.contratos_assinatura
  ADD COLUMN IF NOT EXISTS contrato_origem_id uuid REFERENCES public.contratos_assinatura(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS renovado_em timestamptz,
  ADD COLUMN IF NOT EXISTS numero_renovacoes integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_contr_assin_origem ON public.contratos_assinatura(contrato_origem_id) WHERE contrato_origem_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.contrato_renovacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  contrato_id uuid NOT NULL REFERENCES public.contratos_assinatura(id) ON DELETE CASCADE,
  contrato_novo_id uuid REFERENCES public.contratos_assinatura(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('extensao','troca_plano')),
  convenio_anterior_id uuid REFERENCES public.cb_convenios(id) ON DELETE SET NULL,
  convenio_novo_id uuid REFERENCES public.cb_convenios(id) ON DELETE SET NULL,
  valor_anterior numeric(12,2) NOT NULL DEFAULT 0,
  valor_novo numeric(12,2) NOT NULL DEFAULT 0,
  parcelas_geradas integer NOT NULL DEFAULT 0,
  periodo_inicio date,
  periodo_fim date,
  usuario_id uuid,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contr_renov_contrato ON public.contrato_renovacoes(contrato_id);
CREATE INDEX IF NOT EXISTS idx_contr_renov_clinica ON public.contrato_renovacoes(clinica_id, created_at DESC);

GRANT SELECT, INSERT ON public.contrato_renovacoes TO authenticated;
GRANT ALL ON public.contrato_renovacoes TO service_role;

ALTER TABLE public.contrato_renovacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cr_select" ON public.contrato_renovacoes;
CREATE POLICY "cr_select" ON public.contrato_renovacoes
  FOR SELECT TO authenticated
  USING (is_member(auth.uid(), clinica_id));

DROP POLICY IF EXISTS "cr_insert" ON public.contrato_renovacoes;
CREATE POLICY "cr_insert" ON public.contrato_renovacoes
  FOR INSERT TO authenticated
  WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));

CREATE OR REPLACE FUNCTION public.renovar_contrato_extensao(
  _contrato_id uuid,
  _observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contrato public.contratos_assinatura%ROWTYPE;
  v_convenio public.cb_convenios%ROWTYPE;
  v_pagas int;
  v_max int;
  v_novo_valor numeric(12,2);
  v_num_parcelas int;
  v_prox int;
  v_dia_venc int;
  v_data_base date;
  v_periodo_inicio date;
  v_periodo_fim date;
  i int;
  v_venc date;
  v_ano int;
  v_mes int;
  v_dia int;
BEGIN
  SELECT * INTO v_contrato FROM public.contratos_assinatura WHERE id = _contrato_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato nao encontrado'; END IF;

  IF NOT can_manage_clinica(auth.uid(), v_contrato.clinica_id) THEN
    RAISE EXCEPTION 'Sem permissao para renovar contratos desta clinica';
  END IF;

  IF v_contrato.status <> 'ativo' OR v_contrato.cancelado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Contrato nao esta ativo';
  END IF;

  IF v_contrato.convenio_id IS NULL THEN
    RAISE EXCEPTION 'Contrato sem convenio vinculado';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE status = 'pago'),
    COUNT(*)
  INTO v_pagas, v_max
  FROM public.contrato_mensalidades
  WHERE contrato_id = _contrato_id AND numero_parcela > 0;

  IF v_max = 0 OR v_pagas < v_max THEN
    RAISE EXCEPTION 'So e possivel renovar quando todas as mensalidades estiverem pagas (pagas: % de %)', v_pagas, v_max;
  END IF;

  SELECT * INTO v_convenio FROM public.cb_convenios WHERE id = v_contrato.convenio_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convenio do contrato nao encontrado'; END IF;

  v_novo_valor := v_convenio.valor_mensal;
  v_num_parcelas := COALESCE(NULLIF(v_convenio.num_parcelas, 0), 12);

  SELECT MAX(numero_parcela), MAX(vencimento)
  INTO v_prox, v_data_base
  FROM public.contrato_mensalidades
  WHERE contrato_id = _contrato_id AND numero_parcela > 0;

  v_prox := COALESCE(v_prox, 0) + 1;
  v_dia_venc := COALESCE(v_contrato.dia_vencimento, EXTRACT(DAY FROM v_data_base)::int, 10);

  v_periodo_inicio := (v_data_base + INTERVAL '1 month')::date;

  FOR i IN 0 .. v_num_parcelas - 1 LOOP
    v_ano := EXTRACT(YEAR FROM (v_data_base + ((i + 1) || ' month')::interval))::int;
    v_mes := EXTRACT(MONTH FROM (v_data_base + ((i + 1) || ' month')::interval))::int;
    v_dia := LEAST(v_dia_venc, EXTRACT(DAY FROM (date_trunc('month', make_date(v_ano, v_mes, 1)) + INTERVAL '1 month - 1 day'))::int);
    v_venc := make_date(v_ano, v_mes, v_dia);

    INSERT INTO public.contrato_mensalidades (
      contrato_id, clinica_id, numero_parcela, vencimento, valor, status
    ) VALUES (
      _contrato_id, v_contrato.clinica_id, v_prox + i, v_venc, v_novo_valor, 'pendente'
    );
    v_periodo_fim := v_venc;
  END LOOP;

  UPDATE public.contratos_assinatura
  SET data_fim = v_periodo_fim,
      valor_mensal = v_novo_valor,
      numero_renovacoes = COALESCE(numero_renovacoes, 0) + 1,
      renovado_em = now(),
      updated_at = now()
  WHERE id = _contrato_id;

  INSERT INTO public.contrato_renovacoes (
    clinica_id, contrato_id, contrato_novo_id, tipo,
    convenio_anterior_id, convenio_novo_id, valor_anterior, valor_novo,
    parcelas_geradas, periodo_inicio, periodo_fim, usuario_id, observacao
  ) VALUES (
    v_contrato.clinica_id, _contrato_id, NULL, 'extensao',
    v_contrato.convenio_id, v_contrato.convenio_id,
    v_contrato.valor_mensal, v_novo_valor,
    v_num_parcelas, v_periodo_inicio, v_periodo_fim, auth.uid(), _observacao
  );

  RETURN jsonb_build_object(
    'ok', true,
    'parcelas_geradas', v_num_parcelas,
    'valor_novo', v_novo_valor,
    'periodo_inicio', v_periodo_inicio,
    'periodo_fim', v_periodo_fim
  );
END;
$$;

REVOKE ALL ON FUNCTION public.renovar_contrato_extensao(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renovar_contrato_extensao(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.renovar_contrato_troca_plano(
  _contrato_id uuid,
  _convenio_novo_id uuid,
  _observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contrato public.contratos_assinatura%ROWTYPE;
  v_convenio_novo public.cb_convenios%ROWTYPE;
  v_pagas int;
  v_max int;
  v_novo_id uuid;
  v_num_parcelas int;
  v_dia_venc int;
  v_data_inicio date;
  v_periodo_fim date;
  v_ano int; v_mes int; v_dia int; v_venc date;
  i int;
BEGIN
  SELECT * INTO v_contrato FROM public.contratos_assinatura WHERE id = _contrato_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato nao encontrado'; END IF;

  IF NOT can_manage_clinica(auth.uid(), v_contrato.clinica_id) THEN
    RAISE EXCEPTION 'Sem permissao para renovar contratos desta clinica';
  END IF;

  IF v_contrato.status <> 'ativo' OR v_contrato.cancelado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Contrato nao esta ativo';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE status = 'pago'),
    COUNT(*)
  INTO v_pagas, v_max
  FROM public.contrato_mensalidades
  WHERE contrato_id = _contrato_id AND numero_parcela > 0;

  IF v_max = 0 OR v_pagas < v_max THEN
    RAISE EXCEPTION 'So e possivel renovar quando todas as mensalidades estiverem pagas';
  END IF;

  SELECT * INTO v_convenio_novo FROM public.cb_convenios WHERE id = _convenio_novo_id AND clinica_id = v_contrato.clinica_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convenio novo invalido'; END IF;

  v_num_parcelas := COALESCE(NULLIF(v_convenio_novo.num_parcelas, 0), 12);
  v_dia_venc := COALESCE(v_contrato.dia_vencimento, 10);
  v_data_inicio := CURRENT_DATE;

  INSERT INTO public.contratos_assinatura (
    clinica_id, plano_id, paciente_id, paciente_nome,
    data_inicio, dia_vencimento, valor_mensal, taxa_adesao,
    num_parcelas, forma_pagamento, status, convenio_id,
    contrato_origem_id, titular_apenas_financeiro,
    numero, criado_por
  ) VALUES (
    v_contrato.clinica_id, v_contrato.plano_id, v_contrato.paciente_id, v_contrato.paciente_nome,
    v_data_inicio, v_dia_venc, v_convenio_novo.valor_mensal, 0,
    v_num_parcelas, v_contrato.forma_pagamento, 'ativo', _convenio_novo_id,
    _contrato_id, v_contrato.titular_apenas_financeiro,
    COALESCE((SELECT MAX(numero) + 1 FROM public.contratos_assinatura WHERE clinica_id = v_contrato.clinica_id), 1),
    auth.uid()
  )
  RETURNING id INTO v_novo_id;

  FOR i IN 1 .. v_num_parcelas LOOP
    v_ano := EXTRACT(YEAR FROM (v_data_inicio + (i || ' month')::interval))::int;
    v_mes := EXTRACT(MONTH FROM (v_data_inicio + (i || ' month')::interval))::int;
    v_dia := LEAST(v_dia_venc, EXTRACT(DAY FROM (date_trunc('month', make_date(v_ano, v_mes, 1)) + INTERVAL '1 month - 1 day'))::int);
    v_venc := make_date(v_ano, v_mes, v_dia);

    INSERT INTO public.contrato_mensalidades (
      contrato_id, clinica_id, numero_parcela, vencimento, valor, status
    ) VALUES (
      v_novo_id, v_contrato.clinica_id, i, v_venc, v_convenio_novo.valor_mensal, 'pendente'
    );
    v_periodo_fim := v_venc;
  END LOOP;

  UPDATE public.contratos_assinatura
  SET data_fim = v_periodo_fim
  WHERE id = v_novo_id;

  INSERT INTO public.contrato_dependentes (
    contrato_id, clinica_id, paciente_id, paciente_nome, parentesco, tipo, incluido_em, ativo
  )
  SELECT v_novo_id, clinica_id, paciente_id, paciente_nome, parentesco, tipo, CURRENT_DATE, true
  FROM public.contrato_dependentes
  WHERE contrato_id = _contrato_id AND ativo = true;

  UPDATE public.contratos_assinatura
  SET renovado_em = now(),
      numero_renovacoes = COALESCE(numero_renovacoes, 0) + 1,
      status = 'renovado',
      updated_at = now()
  WHERE id = _contrato_id;

  INSERT INTO public.contrato_renovacoes (
    clinica_id, contrato_id, contrato_novo_id, tipo,
    convenio_anterior_id, convenio_novo_id, valor_anterior, valor_novo,
    parcelas_geradas, periodo_inicio, periodo_fim, usuario_id, observacao
  ) VALUES (
    v_contrato.clinica_id, _contrato_id, v_novo_id, 'troca_plano',
    v_contrato.convenio_id, _convenio_novo_id,
    v_contrato.valor_mensal, v_convenio_novo.valor_mensal,
    v_num_parcelas, v_data_inicio, v_periodo_fim, auth.uid(), _observacao
  );

  RETURN jsonb_build_object(
    'ok', true,
    'contrato_novo_id', v_novo_id,
    'parcelas_geradas', v_num_parcelas,
    'valor_novo', v_convenio_novo.valor_mensal
  );
END;
$$;

REVOKE ALL ON FUNCTION public.renovar_contrato_troca_plano(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renovar_contrato_troca_plano(uuid, uuid, text) TO authenticated;
