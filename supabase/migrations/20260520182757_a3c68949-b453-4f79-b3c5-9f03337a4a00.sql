
CREATE OR REPLACE FUNCTION public.verificar_certificado(_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r record;
BEGIN
  IF _codigo IS NULL OR length(_codigo) < 6 OR length(_codigo) > 64 THEN
    RETURN NULL;
  END IF;
  SELECT c.emitido_em, p.nome AS aluno, cu.titulo AS curso, cl.nome AS clinica
  INTO _r
  FROM public.lms_certificados c
  LEFT JOIN public.profiles p ON p.id = c.user_id
  LEFT JOIN public.lms_cursos cu ON cu.id = c.curso_id
  LEFT JOIN public.clinicas cl ON cl.id = c.clinica_id
  WHERE c.codigo_verificacao = _codigo
  LIMIT 1;
  IF _r IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'aluno', _r.aluno,
    'curso', _r.curso,
    'clinica', _r.clinica,
    'emitido_em', _r.emitido_em
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verificar_certificado(text) TO anon, authenticated;
