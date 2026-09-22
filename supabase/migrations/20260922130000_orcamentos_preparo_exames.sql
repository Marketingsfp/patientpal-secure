-- Preparo de exames do orçamento de Laboratório: caixinhas marcadas
-- (chaves de src/lib/orcamento-preparos.ts) e recomendações livres.
-- Saem impressos no cupom entregue ao paciente.
ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS preparos text[],
  ADD COLUMN IF NOT EXISTS preparo_observacoes text;

COMMENT ON COLUMN public.orcamentos.preparos IS
  'Preparos de exame marcados no orçamento de Laboratório (chaves fixas definidas no front).';
COMMENT ON COLUMN public.orcamentos.preparo_observacoes IS
  'Outras recomendações de preparo digitadas pela recepção; impressas no orçamento.';
