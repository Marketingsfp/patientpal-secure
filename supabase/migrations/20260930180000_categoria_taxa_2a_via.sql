-- Categoria de receita da taxa de 2ª via de carnê/cartão, usada pelo botão
-- "Emitir 2ª Via" em Contratos → Mensalidades. Criada em todas as clínicas;
-- idempotente (não duplica se já existir).
INSERT INTO public.fin_categorias (clinica_id, nome, tipo, cor, ativo)
SELECT c.id, 'TAXA 2A VIA CARNE/CARTAO', 'receita', '#2563eb', true
FROM public.clinicas c
WHERE NOT EXISTS (
  SELECT 1 FROM public.fin_categorias f
  WHERE f.clinica_id = c.id
    AND upper(f.nome) = 'TAXA 2A VIA CARNE/CARTAO'
    AND f.tipo = 'receita'
);
