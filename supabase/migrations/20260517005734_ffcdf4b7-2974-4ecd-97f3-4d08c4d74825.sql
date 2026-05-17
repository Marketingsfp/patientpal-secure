-- 1. token público no agendamento
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS token_publico text UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', '');

UPDATE public.agendamentos
SET token_publico = replace(gen_random_uuid()::text, '-', '')
WHERE token_publico IS NULL;

-- 2. link anamnese -> agendamento
ALTER TABLE public.anamnese_respostas
  ADD COLUMN IF NOT EXISTS agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_anamnese_respostas_agendamento
  ON public.anamnese_respostas(agendamento_id);

-- 3. RPC: ver consulta pelo token (paciente sem login)
CREATE OR REPLACE FUNCTION public.consulta_publica(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ag record;
  _result jsonb;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN
    RAISE EXCEPTION 'Token inválido';
  END IF;

  SELECT a.id, a.inicio, a.fim, a.paciente_nome, a.paciente_id, a.medico_id,
         a.procedimento, a.status, a.teleconsulta, a.link_teleconsulta,
         a.clinica_id, a.token_publico,
         m.nome AS medico_nome, e.nome AS medico_especialidade,
         c.nome AS clinica_nome
  INTO _ag
  FROM public.agendamentos a
  LEFT JOIN public.medicos m ON m.id = a.medico_id
  LEFT JOIN public.especialidades e ON e.id = m.especialidade_id
  LEFT JOIN public.clinicas c ON c.id = a.clinica_id
  WHERE a.token_publico = _token
  LIMIT 1;

  IF _ag.id IS NULL THEN
    RAISE EXCEPTION 'Consulta não encontrada';
  END IF;

  _result := jsonb_build_object(
    'agendamento', to_jsonb(_ag),
    'anamneses_modelos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'perguntas', perguntas))
      FROM public.anamnese_modelos
      WHERE clinica_id = _ag.clinica_id AND ativo = true
    ), '[]'::jsonb),
    'anamneses_enviadas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'modelo_id', modelo_id, 'respondida_em', respondida_em))
      FROM public.anamnese_respostas
      WHERE agendamento_id = _ag.id
    ), '[]'::jsonb)
  );

  RETURN _result;
END;
$$;

-- 4. RPC: salvar anamnese pública pelo token
CREATE OR REPLACE FUNCTION public.salvar_anamnese_publica(
  _token text,
  _modelo_id uuid,
  _respostas jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ag record;
  _id uuid;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN
    RAISE EXCEPTION 'Token inválido';
  END IF;
  IF _respostas IS NULL OR jsonb_typeof(_respostas) <> 'object' THEN
    RAISE EXCEPTION 'Respostas inválidas';
  END IF;

  SELECT id, clinica_id, paciente_id
  INTO _ag
  FROM public.agendamentos
  WHERE token_publico = _token
  LIMIT 1;

  IF _ag.id IS NULL THEN
    RAISE EXCEPTION 'Consulta não encontrada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.anamnese_modelos
    WHERE id = _modelo_id AND clinica_id = _ag.clinica_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Modelo de anamnese inválido';
  END IF;

  INSERT INTO public.anamnese_respostas
    (clinica_id, modelo_id, paciente_id, agendamento_id, respostas, respondida_em)
  VALUES
    (_ag.clinica_id, _modelo_id, _ag.paciente_id, _ag.id, _respostas, now())
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

-- 5. RPC: minhas consultas (paciente logado)
CREATE OR REPLACE FUNCTION public.minhas_consultas()
RETURNS TABLE (
  id uuid,
  inicio timestamptz,
  fim timestamptz,
  status agendamento_status,
  teleconsulta boolean,
  token_publico text,
  procedimento text,
  paciente_nome text,
  medico_nome text,
  medico_especialidade text,
  clinica_nome text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.inicio, a.fim, a.status, a.teleconsulta, a.token_publico,
         a.procedimento, a.paciente_nome,
         m.nome, e.nome, c.nome
  FROM public.agendamentos a
  LEFT JOIN public.medicos m ON m.id = a.medico_id
  LEFT JOIN public.especialidades e ON e.id = m.especialidade_id
  LEFT JOIN public.clinicas c ON c.id = a.clinica_id
  WHERE a.paciente_id IN (
    SELECT p.id FROM public.pacientes p
    WHERE lower(p.email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
      AND p.email IS NOT NULL
  )
  ORDER BY a.inicio DESC;
$$;

GRANT EXECUTE ON FUNCTION public.consulta_publica(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_anamnese_publica(text, uuid, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minhas_consultas() TO authenticated;