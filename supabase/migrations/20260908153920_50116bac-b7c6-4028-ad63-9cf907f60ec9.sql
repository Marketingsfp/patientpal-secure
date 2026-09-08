CREATE INDEX IF NOT EXISTS idx_pacientes_tel_norm_ult8
  ON public.pacientes (clinica_id, right(telefone_norm, 8))
  WHERE telefone_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pacientes_tel2_norm_ult8
  ON public.pacientes (clinica_id, right(telefone2_norm, 8))
  WHERE telefone2_norm IS NOT NULL;

CREATE OR REPLACE FUNCTION public.integracao_verificacao_pacientes_por_telefone(
  _clinica_id uuid,
  _ultimos8 text,
  _limite integer DEFAULT 7
)
RETURNS TABLE (id uuid, nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nome
  FROM public.pacientes p
  WHERE p.clinica_id = _clinica_id
    AND p.ativo IS TRUE
    AND length(_ultimos8) = 8
    AND (
      right(p.telefone_norm, 8) = _ultimos8
      OR right(p.telefone2_norm, 8) = _ultimos8
    )
  ORDER BY p.nome
  LIMIT GREATEST(_limite, 1)
$$;

REVOKE ALL ON FUNCTION public.integracao_verificacao_pacientes_por_telefone(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.integracao_verificacao_pacientes_por_telefone(uuid, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.integracao_verificacao_pacientes_por_telefone(uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.integracao_verificacao_pacientes_por_telefone(uuid, text, integer) TO service_role;