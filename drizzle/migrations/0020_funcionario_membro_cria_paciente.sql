CREATE OR REPLACE FUNCTION public.ensure_paciente_para_funcionario()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_id uuid;
  v_qtd int;
BEGIN
  IF NEW.paciente_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.funcionario_nome IS NULL OR length(trim(NEW.funcionario_nome)) = 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = NEW.user_id;
  END IF;

  IF v_email IS NOT NULL THEN
    SELECT count(*), min(id::text)::uuid INTO v_qtd, v_id
    FROM public.pacientes
    WHERE clinica_id = NEW.clinica_id AND lower(email) = lower(v_email);
    IF v_qtd = 1 THEN
      NEW.paciente_id := v_id;
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.cpf IS NOT NULL AND length(trim(NEW.cpf)) > 0 THEN
    SELECT count(*), min(id::text)::uuid INTO v_qtd, v_id
    FROM public.pacientes
    WHERE clinica_id = NEW.clinica_id AND cpf = NEW.cpf;
    IF v_qtd = 1 THEN
      NEW.paciente_id := v_id;
      RETURN NEW;
    END IF;
  END IF;

  -- Skip the pacientes telefone requirement while creating this shell record.
  PERFORM set_config('app.skip_telefone_check', '1', true);
  INSERT INTO public.pacientes (clinica_id, nome, email, cpf, sexo, telefone, data_nascimento, ativo)
  VALUES (NEW.clinica_id, NEW.funcionario_nome, v_email, NULLIF(trim(NEW.cpf), ''),
          COALESCE(NEW.sexo, 'nao_informar'), NULLIF(trim(NEW.telefone), ''),
          NEW.data_nascimento, true)
  RETURNING id INTO v_id;
  PERFORM set_config('app.skip_telefone_check', '', true);

  NEW.paciente_id := v_id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_ensure_paciente_para_funcionario ON public.hr_contratos;
CREATE TRIGGER tg_ensure_paciente_para_funcionario
  BEFORE INSERT ON public.hr_contratos
  FOR EACH ROW EXECUTE FUNCTION public.ensure_paciente_para_funcionario();

CREATE OR REPLACE FUNCTION public.ensure_paciente_para_membro()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nome text;
  v_email text;
BEGIN
  IF NEW.ativo IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  SELECT p.nome, u.email
    INTO v_nome, v_email
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = NEW.user_id;

  IF v_nome IS NULL OR length(trim(v_nome)) = 0 THEN
    v_nome := COALESCE(v_email, 'USUÁRIO');
  END IF;

  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pacientes
    WHERE clinica_id = NEW.clinica_id AND lower(email) = lower(v_email)
  ) THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM set_config('app.skip_telefone_check', '1', true);
    INSERT INTO public.pacientes (clinica_id, nome, email, ativo)
    VALUES (NEW.clinica_id, v_nome, v_email, true);
    PERFORM set_config('app.skip_telefone_check', '', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.skip_telefone_check', '', true);
    RAISE WARNING 'ensure_paciente_para_membro: paciente nao criado: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;