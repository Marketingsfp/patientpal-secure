CREATE OR REPLACE FUNCTION public.ensure_paciente_para_medico()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.nome IS NULL OR length(trim(NEW.nome)) = 0 THEN
    RETURN NEW;
  END IF;

  -- Médico sem telefone com DDD não ganha ficha de paciente: a ficha exige
  -- telefone, e sem este desvio o cadastro do médico inteiro seria recusado.
  IF length(regexp_replace(coalesce(NEW.telefone, ''), '\D', '', 'g')) < 10 THEN
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
$function$;