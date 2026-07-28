## Problema

Na GR da foto, o item ODONTOLOGIA - IMPLANTE tem sinal de R$ 340,00 e total de R$ 2.200,00. O paciente pagou agora R$ 1.000,00, mas a guia imprimiu "SALDO FINAL: 1.860,00", que é apenas `total - sinal` — ou seja, ignora o que já foi pago e o pagamento atual.

Causa confirmada: em `src/lib/print-gr.ts` (bloco de sinal, ~linhas 858-896), o cálculo lê apenas `quantidade`, `valor_unitario`, `valor_total` e `sinal_valor` dos itens do orçamento. A coluna `valor_pago` (que já existe e é atualizada em `src/lib/agenda/sinal-orcamento.ts`) não é consultada.

Classificação: erro de código/apresentação (a regra de negócio de sinal/saldo já existe e está correta no motor de pagamento).

## O que será alterado

Apenas `src/lib/print-gr.ts`, no bloco que monta SINAL / SALDO FINAL / TOTAL:

1. Incluir `valor_pago` na consulta de `orcamento_itens`.
2. Somar `pagoTotal` (o que já está registrado nos itens, incluindo o pagamento que acabou de ser feito).
3. Calcular:
   - `pagoAnterior = pagoTotal − valor recebido nesta guia` (não menor que zero)
   - `faltaPagar = total − pagoTotal` (não menor que zero)
4. Trocar as linhas impressas por:

```text
SINAL:              340,00
JÁ PAGO ANTES:      340,00
PAGAMENTO ATUAL:  1.000,00
FALTA PAGAR:        860,00
TOTAL:            2.200,00
```

- "JÁ PAGO ANTES" só aparece quando maior que zero.
- Quando `faltaPagar` for zero, imprimir "FALTA PAGAR: 0,00" com destaque de quitado (texto "QUITADO").
- Quando o pagamento é justamente o sinal (primeira etapa), o resultado continua correto: SINAL 340 / PAGAMENTO ATUAL 340 / FALTA PAGAR 1.860 / TOTAL 2.200.

O restante da guia (cabeçalho, serviços, VALOR RECEBIDO, clínica/prestador) não muda.

## Escopo e riscos

- Fora do escopo: cupom 80mm de orçamento (`print-orcamento.ts`), telas da agenda e regra de distribuição de pagamento — nenhuma alteração.
- Nenhuma migração de banco; nenhum dado alterado.
- Reimpressão (2ª via) mostrará o estado atual do item, que pode ser diferente do momento da 1ª impressão — comportamento esperado e consistente com o restante da guia.

## Validação

- Typecheck.
- Conferência dos números para o orçamento D-2026-00002 (item IMPLANTE), comparando com os valores gravados em `orcamento_itens`.
