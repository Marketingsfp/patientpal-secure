-- Tela de login: expõe também a logo completa (branding->>'logo_full_url').
-- Só esse campo a mais; o retorno continua restrito a dados não sensíveis.
DROP FUNCTION IF EXISTS public.clinica_por_dominio(text);
DROP FUNCTION IF EXISTS public.clinica_acesso_por_id(uuid);

CREATE FUNCTION public.clinica_por_dominio(_hostname text)
RETURNS TABLE(clinica_id uuid, nome text, logo_url text, "primary" text, accent text, logo_full_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.nome, c.branding->>'logo_url', c.branding->>'primary', c.branding->>'accent', c.branding->>'logo_full_url'
  FROM public.clinica_dominios d JOIN public.clinicas c ON c.id = d.clinica_id
  WHERE d.ativo AND d.hostname = public.normalizar_hostname(_hostname)
  LIMIT 1
$$;

CREATE FUNCTION public.clinica_acesso_por_id(_clinica_id uuid)
RETURNS TABLE(clinica_id uuid, nome text, logo_url text, "primary" text, accent text, logo_full_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.nome, c.branding->>'logo_url', c.branding->>'primary', c.branding->>'accent', c.branding->>'logo_full_url'
  FROM public.clinicas c WHERE c.id = _clinica_id
$$;

REVOKE ALL ON FUNCTION public.clinica_por_dominio(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clinica_acesso_por_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clinica_por_dominio(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clinica_acesso_por_id(uuid) TO anon, authenticated;