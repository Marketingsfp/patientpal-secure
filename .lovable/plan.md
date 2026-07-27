## Objetivo

Nos serviços de Odontologia que usam pagamento em duas etapas (sinal no início + saldo no final), a impressão hoje mostra apenas o valor cheio do item. Vamos passar a imprimir **SINAL**, **SALDO FINAL** e **TOTAL** em dois lugares:

1. Cupom do **Orçamento** (2ª via da aba Orçamento em Odontologia)
2. **GR** (guia de recebimento do atendimento na Agenda)

Escopo confirmado: vale para **as 3 clínicas**, sem feature flag.

## O que muda na prática

**No cupom do orçamento** — para cada serviço que tiver sinal cadastrado, sai abaixo do item:

```text
CLAREAMENTO DENTAL
1 x 500,00                          500,00
   SINAL ...........................200,00
   SALDO FINAL .....................300,00
   TOTAL ...........................500,00
```

E, no rodapé de totais, quando houver pelo menos um item com sinal, entram duas linhas extras: **TOTAL SINAL** e **TOTAL SALDO FINAL**, mantendo o TOTAL geral que já existe hoje.

**Na GR** — quando o atendimento estiver vinculado a itens de orçamento com sinal, entra um bloco logo após os serviços:

```text
SINAL ..............................200,00
SALDO FINAL ........................300,00
TOTAL ..............................500,00
```

Serviços sem sinal continuam impressos exatamente como hoje (nada muda para eles).

## Detalhes técnicos

- `src/lib/print-orcamento.ts`: já lê `orcamento_itens` com `select("*")`, então `sinal_valor`, `valor_total` e `valor_pago` já estão disponíveis. Adicionar, por item, o bloco de sinal/saldo/total quando `sinal_valor > 0`, e as linhas de totais agregados na tabela final. Saldo = `valor_total - sinal_valor` (mínimo 0).
- `src/lib/print-gr.ts` (`printGuiaAtendimentoCore`): buscar os itens do orçamento ligados ao agendamento via `agendamento_orcamento_itens` → `orcamento_itens` (`sinal_valor, valor_total, quantidade, valor_unitario`), somar sinal e saldo e renderizar o bloco. Sem itens com sinal, o HTML fica idêntico ao atual.
- Reimpressão e GR agrupada usam o mesmo core/monta o HTML pela mesma rota, então herdam o bloco.
- Sem alteração de banco, de regra de negócio ou de cálculo de cobrança — é apenas exibição na impressão.

## Riscos

- Baixo: mudança restrita a geração de HTML de impressão. Não altera lançamentos financeiros, caixa nem status de pagamento.
- Validação sugerida: imprimir a 2ª via de um orçamento odontológico com sinal e uma GR de atendimento vinculado a esse orçamento, conferindo se sinal + saldo = total.
