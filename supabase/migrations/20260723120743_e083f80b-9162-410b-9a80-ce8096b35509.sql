UPDATE public.orcamento_itens oi
SET valores_formas = jsonb_build_object(
      'Dinheiro', COALESCE(p.valor_dinheiro, p.valor_dinheiro_pix, p.valor_padrao, oi.valor_unitario, 0),
      'Cartão de Crédito', COALESCE(p.valor_cartao_credito, p.valor_cartao, p.valor_padrao, oi.valor_unitario, 0)
    )
FROM public.orcamentos o,
     public.especialidades e,
     public.procedimentos p
WHERE oi.orcamento_id = o.id
  AND e.id = o.especialidade_id
  AND p.id = oi.procedimento_id
  AND oi.valores_formas IS NULL
  AND oi.procedimento_id IS NOT NULL
  AND lower(unaccent(e.nome)) LIKE '%odontolog%';