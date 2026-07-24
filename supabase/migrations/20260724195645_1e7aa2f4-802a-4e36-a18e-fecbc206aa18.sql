
-- 1) Colunas em medicos: vínculo com paciente (para virar titular do convênio-sombra)
--    e vínculo direto com o contrato-sombra gerado.
ALTER TABLE public.medicos
  ADD COLUMN IF NOT EXISTS paciente_id uuid REFERENCES public.pacientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS convenio_contrato_id uuid REFERENCES public.contratos_assinatura(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_medicos_paciente_id ON public.medicos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_medicos_convenio_contrato_id ON public.medicos(convenio_contrato_id);

-- 2) RPCs espelhando as de RH, mas apontando para medicos.
CREATE OR REPLACE FUNCTION public.medico_toggle_convenio_funcionario(
  _medico_id uuid, _titular_paciente_id uuid, _habilitar boolean
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_clinica_id uuid;
  v_medico_nome text;
  v_convenio_id uuid;
  v_paciente_nome text;
  v_contrato_id uuid;
  v_existente uuid;
BEGIN
  SELECT clinica_id, nome, convenio_contrato_id
    INTO v_clinica_id, v_medico_nome, v_existente
  FROM public.medicos WHERE id = _medico_id;
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Médico não encontrado';
  END IF;

  IF _habilitar THEN
    IF _titular_paciente_id IS NULL THEN
      RAISE EXCEPTION 'Selecione o paciente titular (o médico deve estar cadastrado como cliente)';
    END IF;

    SELECT id INTO v_convenio_id
      FROM public.cb_convenios
     WHERE clinica_id = v_clinica_id
       AND nome ILIKE '%FUNCION%'
       AND coalesce(ativo, true) = true
     ORDER BY created_at ASC
     LIMIT 1;
    IF v_convenio_id IS NULL THEN
      RAISE EXCEPTION 'Nenhum "Convênio Funcionário" cadastrado nesta clínica. Cadastre em Cartão Benefícios → Convênios.';
    END IF;

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
      'ativo', true, 'medico',
      'Contrato gerado automaticamente pelo cadastro do médico (' || coalesce(v_medico_nome,'') || ').'
    ) RETURNING id INTO v_contrato_id;

    UPDATE public.medicos
       SET convenio_contrato_id = v_contrato_id, updated_at = now()
     WHERE id = _medico_id;

    RETURN v_contrato_id;
  ELSE
    IF v_existente IS NOT NULL THEN
      UPDATE public.contrato_dependentes
         SET ativo = false, excluido_em = CURRENT_DATE
       WHERE contrato_id = v_existente AND ativo = true;
      UPDATE public.contratos_assinatura
         SET status = 'cancelado',
             cancelado_em = now(),
             cancelamento_motivo = 'Convênio Funcionário desligado no cadastro do médico',
             updated_at = now()
       WHERE id = v_existente;
    END IF;
    RETURN v_existente;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.medico_convenio_add_dependente(
  _medico_id uuid, _paciente_id uuid, _parentesco text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contrato_id uuid;
  v_paciente_nome text;
  v_dep_id uuid;
BEGIN
  SELECT convenio_contrato_id INTO v_contrato_id
    FROM public.medicos WHERE id = _medico_id;
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

CREATE OR REPLACE FUNCTION public.medico_convenio_remove_dependente(_dependente_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.contrato_dependentes
     SET ativo = false, excluido_em = CURRENT_DATE
   WHERE id = _dependente_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.medico_toggle_convenio_funcionario(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.medico_convenio_add_dependente(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.medico_convenio_remove_dependente(uuid) TO authenticated;
