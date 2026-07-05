CREATE OR REPLACE FUNCTION public.pacientes_aniversariantes_hoje(_clinica_id uuid, _limite int DEFAULT 200)
RETURNS SETOF public.pacientes
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.pacientes
  WHERE clinica_id = _clinica_id
    AND ativo IS TRUE
    AND data_nascimento IS NOT NULL
    AND to_char(data_nascimento, 'MM-DD') = to_char(current_date, 'MM-DD')
  ORDER BY nome
  LIMIT _limite;
$$;

GRANT EXECUTE ON FUNCTION public.pacientes_aniversariantes_hoje(uuid, int) TO authenticated;