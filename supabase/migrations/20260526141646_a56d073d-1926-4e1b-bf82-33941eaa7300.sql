
-- Médicos -> Pacientes
CREATE OR REPLACE FUNCTION public.ensure_paciente_para_medico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.nome IS NULL OR length(trim(NEW.nome)) = 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.email IS NOT NULL AND length(trim(NEW.email)) > 0 AND EXISTS (
    SELECT 1 FROM public.pacientes
    WHERE clinica_id = NEW.clinica_id AND lower(email) = lower(NEW.email)
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.cpf IS NOT NULL AND length(trim(NEW.cpf)) > 0 AND EXISTS (
    SELECT 1 FROM public.pacientes
    WHERE clinica_id = NEW.clinica_id AND cpf = NEW.cpf
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.pacientes (clinica_id, nome, email, cpf, telefone, data_nascimento, sexo, ativo)
  VALUES (NEW.clinica_id, NEW.nome, NEW.email, NEW.cpf, NEW.telefone, NEW.data_nascimento,
          COALESCE(NEW.sexo, 'nao_informar'), true);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_ensure_paciente_para_medico ON public.medicos;
CREATE TRIGGER tg_ensure_paciente_para_medico
AFTER INSERT ON public.medicos
FOR EACH ROW EXECUTE FUNCTION public.ensure_paciente_para_medico();

-- Funcionários (hr_contratos) -> Pacientes
CREATE OR REPLACE FUNCTION public.ensure_paciente_para_funcionario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  IF NEW.funcionario_nome IS NULL OR length(trim(NEW.funcionario_nome)) = 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = NEW.user_id;
  END IF;

  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pacientes
    WHERE clinica_id = NEW.clinica_id AND lower(email) = lower(v_email)
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.cpf IS NOT NULL AND length(trim(NEW.cpf)) > 0 AND EXISTS (
    SELECT 1 FROM public.pacientes
    WHERE clinica_id = NEW.clinica_id AND cpf = NEW.cpf
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.pacientes (clinica_id, nome, email, cpf, sexo, ativo)
  VALUES (NEW.clinica_id, NEW.funcionario_nome, v_email, NEW.cpf,
          COALESCE(NEW.sexo, 'nao_informar'), true);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_ensure_paciente_para_funcionario ON public.hr_contratos;
CREATE TRIGGER tg_ensure_paciente_para_funcionario
AFTER INSERT ON public.hr_contratos
FOR EACH ROW EXECUTE FUNCTION public.ensure_paciente_para_funcionario();
