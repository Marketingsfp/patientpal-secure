-- 1) coluna taxa_adesao na parcela (só a parcela 1 recebe > 0)
ALTER TABLE public.contrato_mensalidades
  ADD COLUMN IF NOT EXISTS taxa_adesao NUMERIC(12,2) NOT NULL DEFAULT 0;

-- 2) tipo da GR (mensalidade vs taxa_adesao) para separar vias impressas
ALTER TABLE public.gr_impressoes
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'mensalidade';

-- 3) seed idempotente da categoria "TAXA DE ADESAO CARTAO" por clínica
INSERT INTO public.fin_categorias (clinica_id, nome, tipo, ativo)
SELECT c.id, 'TAXA DE ADESAO CARTAO', 'receita', true
FROM public.clinicas c
WHERE NOT EXISTS (
  SELECT 1 FROM public.fin_categorias fc
  WHERE fc.clinica_id = c.id
    AND upper(fc.nome) = 'TAXA DE ADESAO CARTAO'
    AND fc.tipo = 'receita'
);