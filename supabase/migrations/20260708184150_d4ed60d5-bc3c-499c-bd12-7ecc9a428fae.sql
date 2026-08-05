CREATE OR REPLACE FUNCTION public.ensure_paciente_para_membro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Cria o paciente-espelho quando possível; se validações opcionais
  -- (ex.: telefone obrigatório) barrarem, apenas ignora — o paciente pode
  -- ser cadastrado manualmente depois, sem impedir o cadastro do usuário.
  BEGIN
    INSERT INTO public.pacientes (clinica_id, nome, email, ativo)
    VALUES (NEW.clinica_id, v_nome, v_email, true);
  EXCEPTION WHEN OTHERS THEN
    -- silencioso: preserva o cadastro do membro
    NULL;
  END;

  RETURN NEW;
END;
$$;