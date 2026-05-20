-- Função que garante um paciente para o usuário quando ele é vinculado a uma clínica
CREATE OR REPLACE FUNCTION public.ensure_paciente_para_membro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  -- Evita duplicar se já existe paciente com o mesmo e-mail nessa clínica
  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pacientes
    WHERE clinica_id = NEW.clinica_id AND lower(email) = lower(v_email)
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.pacientes (clinica_id, nome, email, ativo)
  VALUES (NEW.clinica_id, v_nome, v_email, true);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_ensure_paciente_para_membro ON public.clinica_memberships;
CREATE TRIGGER tg_ensure_paciente_para_membro
AFTER INSERT ON public.clinica_memberships
FOR EACH ROW
EXECUTE FUNCTION public.ensure_paciente_para_membro();

-- Backfill: cria pacientes para usuários já vinculados que ainda não têm ficha
INSERT INTO public.pacientes (clinica_id, nome, email, ativo)
SELECT m.clinica_id,
       COALESCE(NULLIF(trim(p.nome), ''), u.email, 'USUÁRIO'),
       u.email,
       true
FROM public.clinica_memberships m
JOIN auth.users u ON u.id = m.user_id
LEFT JOIN public.profiles p ON p.id = m.user_id
WHERE m.ativo = true
  AND u.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.pacientes pa
    WHERE pa.clinica_id = m.clinica_id
      AND lower(pa.email) = lower(u.email)
  );