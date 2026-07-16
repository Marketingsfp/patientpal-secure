## Ajuste dos pagamentos retroativos lançados hoje

### O que foi encontrado

Consultando `caixa_movimentos` de hoje (16/07/26) cujo `fin_lancamentos.data` é anterior, encontrei **15 movimentos** de 4 operadoras que caíram na sessão aberta de hoje quando deveriam ter ido para o caixa do dia do pagamento:

| Operadora | Data do pagamento | Qtd | Total | Sessão destino |
|---|---|---:|---:|---|
| EDNALDA PAULINA DE OLIVEIRA | 13/07 | 1 | R$ 110,00 | `b0e4bcba` (13/07, fechada) |
| MAYARA APARECIDA VIANA LUCENA | 13/07 | 4 | R$ 324,00 | `e9c3c272` (13/07, fechada) |
| SUELLEN ALEXANDRE BATISTA | 13/07 | 6 | R$ 710,00 | `f950176a` (13/07, fechada) |
| SUELLEN ALEXANDRE BATISTA | 14/07 | 4 | R$ 239,98 | `c6b455ae` (14/07, fechada) |

Não incluí a QUÉDIMA SUELEN (2 movs de 15/07, R$ 440): já estão na sessão dela do dia 15/07 (que só foi fechada hoje de manhã) — nada a mover.

### Ajuste proposto

Para cada bloco acima, uma única migração (`INSERT/UPDATE`):

1. `UPDATE caixa_movimentos` dos 15 IDs afetados:
   - `sessao_id` = sessão fechada do usuário no dia do pagamento;
   - `created_at` = data do pagamento às 12:00 UTC (para que o histórico "Meu caixa" exiba na data certa).
2. `UPDATE caixa_sessoes` das 4 sessões de destino:
   - recalcular `valor_fechamento_calculado` somando os movimentos após anexar;
   - recalcular `diferenca = valor_fechamento_calculado - valor_fechamento_informado`;
   - **preservar `valor_fechamento_informado`** (foi conferido em espécie na época);
   - acrescentar linha em `observacoes` do tipo "Ajuste 16/07: anexados N mov(s), total R$ X.XX (lançados retroativamente hoje)."

Nada é feito nas sessões abertas de hoje (16/07) — os valores simplesmente saem do saldo diário, que é o comportamento esperado.

### Efeitos

- **Antes:** R$ 1.383,98 aparecendo no caixa de hoje das 3 operadoras (Ednalda, Mayara, Suellen).
- **Depois:** cada valor volta ao caixa do dia de origem; a diferença de cada sessão fechada fica registrada (valor informado permanece intacto).
- Relatórios financeiros baseados em `fin_lancamentos.data` não mudam (já estavam corretos).

### Segurança

- Só toca 15 movimentos + 4 sessões, todos identificados por ID.
- Nenhuma alteração em outras operadoras, dias ou fluxos.
- Reversível: as observações registram os IDs anexados, então dá para desfazer manualmente se necessário.

Se aprovado, executo a migração única com todos os 4 blocos de UPDATE.