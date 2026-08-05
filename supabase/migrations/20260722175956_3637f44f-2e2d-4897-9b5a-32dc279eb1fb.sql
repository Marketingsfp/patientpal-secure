
-- 1) Coluna 'origem' em contratos_assinatura para separar contratos operacionais
--    dos contratos-sombra criados via RH (Convênio Funcionário).
ALTER TABLE public.contratos_assinatura
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'padrao';

CREATE INDEX IF NOT EXISTS idx_contratos_assinatura_origem
  ON public.contratos_assinatura(clinica_id, origem);

-- 2) Vínculo entre o funcionário (hr_contratos) e o contrato-sombra do
--    "Convênio Funcionário".
ALTER TABLE public.hr_contratos
  ADD COLUMN IF NOT EXISTS convenio_contrato_id uuid
    REFERENCES public.contratos_assinatura(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hr_contratos_convenio_contrato
  ON public.hr_contratos(convenio_contrato_id);

-- 3) Habilita/desabilita o Convênio Funcionário para um funcionário.
--    Reutiliza a estrutura de contratos_assinatura + contrato_dependentes,
--    portanto o motor de preços da agenda já reconhece titular e dependentes.
CREATE OR REPLACE FUNCTION public.hr_toggle_convenio_funcionario(
  _hr_contrato_id uuid,
  _titular_paciente_id uuid,
  _habilitar boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica_id uuid;
  v_funcionario_nome text;
  v_convenio_id uuid;
  v_paciente_nome text;
  v_contrato_id uuid;
  v_existente uuid;
BEGIN
  SELECT clinica_id, funcionario_nome, convenio_contrato_id
    INTO v_clinica_id, v_funcionario_nome, v_existente
  FROM public.hr_contratos WHERE id = _hr_contrato_id;
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Funcionário não encontrado';
  END IF;

  IF _habilitar THEN
    IF _titular_paciente_id IS NULL THEN
      RAISE EXCEPTION 'Selecione o paciente titular (o funcionário deve estar cadastrado como cliente)';
    END IF;

    -- Convênio Funcionário da clínica do funcionário
    SELECT id INTO v_convenio_id
      FROM public.cb_convenios
     WHERE clinica_id = v_clinica_id
       AND (
         nome ILIKE '%FUNCION%'
       )
       AND coalesce(ativo, true) = true
     ORDER BY created_at ASC
     LIMIT 1;
    IF v_convenio_id IS NULL THEN
      RAISE EXCEPTION 'Nenhum "Convênio Funcionário" cadastrado nesta clínica. Cadastre em Cartão Benefícios → Convênios.';
    END IF;

    -- Se já existe um contrato-sombra vinculado, apenas reativa/ajusta.
    IF v_existente IS NOT NULL THEN
      UPDATE public.contratos_assinatura
         SET status = 'ativo',
             paciente_id = _titular_paciente_id,
             paciente_nome = (SELECT nome FROM public.pacientes WHERE id = _titular_paciente_id),
             convenio_id = v_convenio_id,
             valor_mensal = 0, taxa_adesao = 0, num_parcelas = 0,
             sem_carencia = true,
             updated_at = now()
       WHERE id = v_existente;
      RETURN v_existente;
    END IF;

    SELECT nome INTO v_paciente_nome FROM public.pacientes WHERE id = _titular_paciente_id;
    IF v_paciente_nome IS NULL THEN
      RAISE EXCEPTION 'Paciente titular não encontrado';
    END IF;

    INSERT INTO public.contratos_assinatura(
      clinica_id, paciente_id, paciente_nome, convenio_id,
      data_inicio, dia_vencimento,
      valor_mensal, taxa_adesao, num_parcelas,
      status, sem_carencia, origem,
      observacoes
    ) VALUES (
      v_clinica_id, _titular_paciente_id, v_paciente_nome, v_convenio_id,
      CURRENT_DATE, 10,
      0, 0, 0,
      'ativo', true, 'rh_funcionario',
      'Contrato gerado automaticamente pelo cadastro de funcionário (' || coalesce(v_funcionario_nome,'') || ').'
    ) RETURNING id INTO v_contrato_id;

    UPDATE public.hr_contratos
       SET convenio_contrato_id = v_contrato_id, updated_at = now()
     WHERE id = _hr_contrato_id;

    RETURN v_contrato_id;
  ELSE
    -- Desabilita: cancela o contrato-sombra (mantém histórico) e desativa dependentes.
    IF v_existente IS NOT NULL THEN
      UPDATE public.contrato_dependentes
         SET ativo = false, excluido_em = CURRENT_DATE
       WHERE contrato_id = v_existente AND ativo = true;
      UPDATE public.contratos_assinatura
         SET status = 'cancelado',
             cancelado_em = now(),
             cancelamento_motivo = 'Convênio Funcionário desligado no cadastro do funcionário',
             updated_at = now()
       WHERE id = v_existente;
    END IF;
    RETURN v_existente;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_toggle_convenio_funcionario(uuid, uuid, boolean)
  TO authenticated, service_role;

-- 4) Adiciona dependente ao Convênio Funcionário do funcionário.
CREATE OR REPLACE FUNCTION public.hr_convenio_add_dependente(
  _hr_contrato_id uuid,
  _paciente_id uuid,
  _parentesco text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contrato_id uuid;
  v_clinica uuid;
  v_paciente_nome text;
  v_dep_id uuid;
BEGIN
  SELECT convenio_contrato_id, clinica_id INTO v_contrato_id, v_clinica
    FROM public.hr_contratos WHERE id = _hr_contrato_id;
  IF v_contrato_id IS NULL THEN
    RAISE EXCEPTION 'Habilite o Convênio Funcionário antes de adicionar dependentes.';
  END IF;
  IF _parentesco IS NULL OR btrim(_parentesco) = '' THEN
    RAISE EXCEPTION 'Informe o grau de parentesco.';
  END IF;
  SELECT nome INTO v_paciente_nome FROM public.pacientes WHERE id = _paciente_id;
  IF v_paciente_nome IS NULL THEN
    RAISE EXCEPTION 'Paciente não encontrado. Cadastre o dependente como cliente antes.';
  END IF;

  -- Reativa se já existir dependente inativo com o mesmo paciente
  UPDATE public.contrato_dependentes
     SET ativo = true, excluido_em = NULL, parentesco = btrim(_parentesco), incluido_em = CURRENT_DATE
   WHERE contrato_id = v_contrato_id AND paciente_id = _paciente_id
   RETURNING id INTO v_dep_id;
  IF v_dep_id IS NOT NULL THEN
    RETURN v_dep_id;
  END IF;

  INSERT INTO public.contrato_dependentes(
    contrato_id, paciente_id, paciente_nome, parentesco, tipo, incluido_em, ativo
  ) VALUES (
    v_contrato_id, _paciente_id, v_paciente_nome, btrim(_parentesco), 'dependente', CURRENT_DATE, true
  ) RETURNING id INTO v_dep_id;
  RETURN v_dep_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_convenio_add_dependente(uuid, uuid, text)
  TO authenticated, service_role;

-- 5) Remove (desativa) dependente do Convênio Funcionário.
CREATE OR REPLACE FUNCTION public.hr_convenio_remove_dependente(_dependente_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.contrato_dependentes
     SET ativo = false, excluido_em = CURRENT_DATE
   WHERE id = _dependente_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_convenio_remove_dependente(uuid)
  TO authenticated, service_role;
