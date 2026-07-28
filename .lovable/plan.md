## Problema

Na GR da foto, aparecem duas linhas com o mesmo valor:

```text
SINAL:            340,00
JÁ PAGO ANTES:    340,00
```

Isso acontece porque o único pagamento anterior foi justamente o sinal, então as duas linhas informam a mesma coisa e a guia fica redundante.

Classificação: ajuste visual/apresentação. Nenhuma regra de negócio ou valor muda.

## Ajuste

Somente em `src/lib/print-gr.ts`, no bloco SINAL / JÁ PAGO ANTES / PAGAMENTO ATUAL / FALTA PAGAR / TOTAL:

1. Quando o valor já pago antes for igual ao sinal (mesma quantia), imprimir uma única linha:

```text
SINAL (JÁ PAGO):    340,00
PAGAMENTO ATUAL:  1.000,00
FALTA PAGAR:        860,00
TOTAL:            2.200,00
```

2. Quando o já pago antes for maior que o sinal (o paciente já pagou o sinal e mais alguma parcela do saldo), continuar com as duas linhas separadas:

```text
SINAL:              340,00
JÁ PAGO ANTES:      840,00
PAGAMENTO ATUAL:    500,00
FALTA PAGAR:        860,00
TOTAL:            2.200,00
```

3. Quando ainda não houve pagamento anterior (o pagamento atual é o próprio sinal), manter como está hoje: SINAL / PAGAMENTO ATUAL / FALTA PAGAR / TOTAL, sem a linha "já pago antes".

A comparação usa tolerância de centavos para evitar diferença por arredondamento.

## Escopo

- Fora do escopo: cálculo de valores, distribuição de pagamento, orçamento e telas da agenda — nada muda.
- Sem migração de banco e sem alteração de dados.

## Validação

- Typecheck.
- Conferência visual reimprimindo a GR do atendimento do JEAN XAVIER (implante).
