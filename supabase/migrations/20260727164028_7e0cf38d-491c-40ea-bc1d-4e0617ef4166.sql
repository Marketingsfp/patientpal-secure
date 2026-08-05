CREATE OR REPLACE FUNCTION public.listar_nfse_emitentes_publico()
RETURNS TABLE (
  id uuid,
  clinica_id uuid,
  nome text,
  cnpj text,
  inscricao_municipal text,
  inscricao_estadual text,
  razao_social text,
  nome_fantasia text,
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  municipio text,
  codigo_municipio text,
  uf text,
  telefone text,
  email text,
  regime_tributario text,
  optante_simples boolean,
  incentivador_cultural boolean,
  item_lista_servico text,
  codigo_tributario_municipio text,
  codigo_cnae text,
  aliquota_iss numeric(5,4),
  descricao_servico_padrao text,
  certificado_validade date,
  focus_ambiente text,
  rps_serie text,
  rps_proximo_numero integer,
  ativo boolean,
  padrao boolean,
  usar_ambiente_nacional boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.clinica_id,
    e.nome,
    e.cnpj,
    e.inscricao_municipal,
    e.inscricao_estadual,
    e.razao_social,
    e.nome_fantasia,
    e.cep,
    e.logradouro,
    e.numero,
    e.complemento,
    e.bairro,
    e.municipio,
    e.codigo_municipio,
    e.uf,
    e.telefone,
    e.email,
    e.regime_tributario,
    e.optante_simples,
    e.incentivador_cultural,
    e.item_lista_servico,
    e.codigo_tributario_municipio,
    e.codigo_cnae,
    e.aliquota_iss,
    e.descricao_servico_padrao,
    e.certificado_validade,
    e.focus_ambiente,
    e.rps_serie,
    e.rps_proximo_numero,
    e.ativo,
    e.padrao,
    e.usar_ambiente_nacional,
    e.created_at,
    e.updated_at
  FROM public.nfse_emitentes e
  WHERE EXISTS (
    SELECT 1
    FROM public.clinica_memberships m
    WHERE m.user_id = auth.uid()
      AND m.clinica_id = e.clinica_id
      AND m.ativo = true
  );
$$;

REVOKE ALL ON FUNCTION public.listar_nfse_emitentes_publico() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listar_nfse_emitentes_publico() FROM anon;
GRANT EXECUTE ON FUNCTION public.listar_nfse_emitentes_publico() TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_nfse_emitentes_publico() TO service_role;

DROP VIEW IF EXISTS public.nfse_emitentes_publico;
CREATE VIEW public.nfse_emitentes_publico
WITH (security_invoker = true) AS
SELECT * FROM public.listar_nfse_emitentes_publico();

GRANT SELECT ON public.nfse_emitentes_publico TO authenticated;
GRANT SELECT ON public.nfse_emitentes_publico TO service_role;