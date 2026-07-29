CREATE OR REPLACE FUNCTION public.listar_unidades_basico()
RETURNS TABLE (id uuid, nome text, cidade text, estado text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.nome, c.cidade, c.estado
  FROM public.clinicas c
  WHERE COALESCE(c.ativo, true)
  ORDER BY c.nome
$$;

REVOKE ALL ON FUNCTION public.listar_unidades_basico() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_unidades_basico() TO authenticated;