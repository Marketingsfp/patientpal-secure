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
  v_cpf text;
  v_tel text;
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

  v_cpf := regexp_replace(coalesce(NEW.cpf, ''), '\D', '', 'g');
  v_tel := NULLIF(trim(NEW.telefone), '');

  IF v_email IS NOT NULL THEN
    SELECT count(*), min(id::text)::uuid INTO v_qtd, v_id
    FROM public.pacientes
    WHERE clinica_id = NEW.clinica_id AND lower(email) = lower(v_email);
    IF v_qtd = 1 THEN
      NEW.paciente_id := v_id;
      -- Completa somente campos vazios do cadastro encontrado (nunca sobrescreve, nunca altera nome).
      BEGIN
        PERFORM set_config('app.skip_telefone_check', '1', true);
        UPDATE public.pacientes p SET
          cpf = CASE WHEN (p.cpf IS NULL OR trim(p.cpf) = '') AND length(v_cpf) = 11 THEN v_cpf ELSE p.cpf END,
          telefone = CASE WHEN (p.telefone IS NULL OR trim(p.telefone) = '') AND v_tel IS NOT NULL THEN v_tel ELSE p.telefone END,
          data_nascimento = COALESCE(p.data_nascimento, NEW.data_nascimento),
          email = CASE WHEN (p.email IS NULL OR trim(p.email) = '') AND v_email IS NOT NULL THEN v_email ELSE p.email END
        WHERE p.id = v_id
          AND (
            ((p.cpf IS NULL OR trim(p.cpf) = '') AND length(v_cpf) = 11)
            OR ((p.telefone IS NULL OR trim(p.telefone) = '') AND v_tel IS NOT NULL)
            OR (p.data_nascimento IS NULL AND NEW.data_nascimento IS NOT NULL)
            OR ((p.email IS NULL OR trim(p.email) = '') AND v_email IS NOT NULL)
          );
        PERFORM set_config('app.skip_telefone_check', '', true);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'ensure_paciente_para_funcionario: complemento do cadastro falhou: %', SQLERRM;
      END;
      RETURN NEW;
    END IF;
  END IF;

  IF length(v_cpf) = 11 THEN
    SELECT count(*), min(id::text)::uuid INTO v_qtd, v_id
    FROM public.pacientes
    WHERE clinica_id = NEW.clinica_id AND cpf_digits = v_cpf;
    IF v_qtd = 1 THEN
      NEW.paciente_id := v_id;
      -- Completa somente campos vazios do cadastro encontrado (nunca sobrescreve, nunca altera nome).
      BEGIN
        PERFORM set_config('app.skip_telefone_check', '1', true);
        UPDATE public.pacientes p SET
          cpf = CASE WHEN (p.cpf IS NULL OR trim(p.cpf) = '') AND length(v_cpf) = 11 THEN v_cpf ELSE p.cpf END,
          telefone = CASE WHEN (p.telefone IS NULL OR trim(p.telefone) = '') AND v_tel IS NOT NULL THEN v_tel ELSE p.telefone END,
          data_nascimento = COALESCE(p.data_nascimento, NEW.data_nascimento),
          email = CASE WHEN (p.email IS NULL OR trim(p.email) = '') AND v_email IS NOT NULL THEN v_email ELSE p.email END
        WHERE p.id = v_id
          AND (
            ((p.cpf IS NULL OR trim(p.cpf) = '') AND length(v_cpf) = 11)
            OR ((p.telefone IS NULL OR trim(p.telefone) = '') AND v_tel IS NOT NULL)
            OR (p.data_nascimento IS NULL AND NEW.data_nascimento IS NOT NULL)
            OR ((p.email IS NULL OR trim(p.email) = '') AND v_email IS NOT NULL)
          );
        PERFORM set_config('app.skip_telefone_check', '', true);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'ensure_paciente_para_funcionario: complemento do cadastro falhou: %', SQLERRM;
      END;
      RETURN NEW;
    END IF;
  END IF;

  -- Skip the pacientes telefone requirement while creating this shell record.
  PERFORM set_config('app.skip_telefone_check', '1', true);
  INSERT INTO public.pacientes (clinica_id, nome, email, cpf, sexo, telefone, data_nascimento, ativo)
  VALUES (NEW.clinica_id, NEW.funcionario_nome, v_email, NULLIF(v_cpf, ''),
          COALESCE(NEW.sexo, 'nao_informar'), v_tel,
          NEW.data_nascimento, true)
  RETURNING id INTO v_id;
  PERFORM set_config('app.skip_telefone_check', '', true);

  NEW.paciente_id := v_id;
  RETURN NEW;
END;
$function$;