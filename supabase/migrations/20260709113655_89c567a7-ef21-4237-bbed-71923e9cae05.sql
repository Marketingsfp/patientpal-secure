UPDATE public.procedimentos
SET valor_padrao = 0,
    valor_dinheiro = 0,
    valor_pix = 0,
    valor_cartao = 0,
    valor_cartao_credito = 0,
    valor_cartao_debito = 0,
    valor_dinheiro_pix = 0,
    valor_cartao_consulta = 0,
    valor_cartao_desconto = 0,
    valor_variavel = true
WHERE nome ILIKE 'TOXICOLOGICO%' OR nome ILIKE 'TOXICOLÓGICO%';