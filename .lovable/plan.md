Atualizar `src/lib/print-carne.ts` (modelo do carnê):

**Correção do Convênio**
- Hoje o código busca o nome do convênio em `planos_assinatura`, mas `convenio_id` referencia a tabela `cb_convenios`. Por isso o nome vem vazio.
- Trocar a consulta para `cb_convenios` (id, nome). Manter fallback para `planos_assinatura` apenas se `convenio_id` for nulo.

**Contagem de pessoas no convênio**
- Buscar `contrato_dependentes` (count, filtrando `ativo = true`) para o `contrato_id`.
- Total = 1 (titular) + dependentes ativos. Exibir como "Pessoas no convênio".

**Campos por parcela (ficha)**
Grid passa a ter:
1. Titular
2. CPF
3. Convênio
4. Pessoas no convênio
5. Mês de referência — derivado do `vencimento` da parcela, formato `MM/AAAA` em português (ex.: `05/2026`)
6. Vencimento
7. Valor
8. Data de pagamento — campo manual (linha em branco para preencher à mão); quando a parcela já estiver `pago`, mostra `fmtD(pago_em)` no lugar da linha

**Remover do rodapé**
- "Recebido em"
- "Forma de pagamento"
- "Status" (do grid)
- Mantém apenas a "Assinatura / Carimbo do recebedor"

**Capa (página inicial)**
- Também substituir o card "Convênio" pela fonte correta (`cb_convenios.nome`).
- Acrescentar "Pessoas no convênio" no grid da capa.

Nada mais é alterado (layout, CSS, fluxo de impressão permanecem iguais).