## Entendimento

Na impressão do orçamento de Odontologia, quando um item tem entrada (sinal), o bloco do item mostra:

```text
DINHEIRO      2.200,00
CARTÃO/PIX    2.420,00
SINAL         1.000,00
SALDO FINAL   1.200,00
TOTAL         2.200,00   <-- redundante (circulado em vermelho)
```

O valor TOTAL já aparece logo abaixo, no rodapé de totais (DINHEIRO / CARTÃO/PIX). Você quer que essa linha TOTAL do item deixe de sair quando o item tiver entrada.

Classificação: ajuste visual / de impressão. Sem mudança de regra de negócio, banco ou cálculo.

## O que será alterado

- Arquivo: `src/lib/print-orcamento.ts`
- No bloco por item que hoje imprime SINAL / SALDO FINAL / TOTAL, remover a linha TOTAL.
- Continuam saindo normalmente: SINAL, SALDO FINAL, o detalhamento por forma de pagamento e o rodapé com TOTAL SINAL / TOTAL SALDO FINAL.
- Itens sem entrada continuam exatamente como estão hoje (valor total à direita da quantidade).

## Fora do escopo

- Nenhum valor, cálculo, desconto ou dado de orçamento será alterado.
- `print-gr.ts` não será tocado (a mudança pedida está no cupom de orçamento). Se você também quiser tirar esse TOTAL da GR de atendimento, é só avisar que eu incluo.

## Validação

- Typecheck do projeto.
- Conferência visual do cupom com um item com sinal (a impressão física fica a seu cargo).

## Confirmação necessária

Regra 1.10: em qual(is) clínica(s) essa alteração deve valer — POLICLINICA MENINO JESUS, SÃO FRANCISCO DE PAULA, ou todas? Como é ajuste puramente de layout de impressão, minha sugestão é aplicar em todas, mas preciso da sua confirmação.
