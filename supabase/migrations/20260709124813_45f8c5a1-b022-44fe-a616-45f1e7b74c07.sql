
-- Allow ensure_paciente_para_funcionario to insert a paciente shell without telefone.
-- The pacientes require-telefone trigger will skip the check when this session-local flag is set.

CREATE OR REPLACE FUNCTION public.pacientes_require_telefone_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  digits text;
  skip_flag text;
BEGIN
  skip_flag := current_setting('app.skip_telefone_check', true);
  IF skip_flag = '1' THEN
    RETURN NEW;
  END IF;

  digits := regexp_replace(coalesce(NEW.telefone,''),'\D','','g');
  IF length(digits) < 10 THEN
    IF TG_OP = 'UPDATE' THEN
      IF length(regexp_replace(coalesce(OLD.telefone,''),'\D','','g')) < 10 THEN
        RETURN NEW;
      END IF;
    END IF;
    RAISE EXCEPTION 'Telefone é obrigatório (mínimo 10 dígitos)'
      USING ERRCODE = 'check_violation', HINT = 'Informe DDD + número';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_paciente_para_funcionario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Skip the pacientes telefone requirement while creating this shell record.
  PERFORM set_config('app.skip_telefone_check', '1', true);
  INSERT INTO public.pacientes (clinica_id, nome, email, cpf, sexo, ativo)
  VALUES (NEW.clinica_id, NEW.funcionario_nome, v_email, NEW.cpf,
          COALESCE(NEW.sexo, 'nao_informar'), true);
  PERFORM set_config('app.skip_telefone_check', '', true);

  RETURN NEW;
END;
$function$;
