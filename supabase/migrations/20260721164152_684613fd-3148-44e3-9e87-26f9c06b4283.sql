CREATE OR REPLACE VIEW public.nfse_emitentes_publico
WITH (security_invoker = off) AS
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
  SELECT 1 FROM public.clinica_memberships m
  WHERE m.user_id = auth.uid()
    AND m.clinica_id = e.clinica_id
    AND m.ativo = true
);

REVOKE ALL ON public.nfse_emitentes_publico FROM PUBLIC;
REVOKE ALL ON public.nfse_emitentes_publico FROM anon;
GRANT SELECT ON public.nfse_emitentes_publico TO authenticated;
GRANT ALL ON public.nfse_emitentes_publico TO service_role;