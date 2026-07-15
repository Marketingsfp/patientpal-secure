## Problema

No modal **Fechar caixa**, a soma do "Total conferido esperado" por forma de pagamento **não bate com o Saldo atual** do dia. No caso da Mayra: Saldo R$ 245,00 vs Total esperado R$ 335,00 (diferença = R$ 90 de sangria em dinheiro).

**Causa:** o cálculo `porFormaDoDiaFechamento` (arquivo `src/routes/_authenticated/app.caixa.tsx`, linhas ~1184–1209) considera apenas `recebimento`, `suprimento` e `estorno`. **Sangrias e despesas não são descontadas** da forma correspondente (normalmente Dinheiro). Já o Saldo atual desconta tudo, então os dois valores divergem.

## O que muda

Ajustar o cálculo do "Esperado por forma" no fechamento para também **subtrair** os movimentos de saída (`sangria` e `despesa`) da forma de pagamento correspondente. Assim:

```text
Esperado(forma) = recebimentos(forma)
                + suprimentos(forma)
                − estornos(forma)
                − sangrias(forma)
                − despesas(forma)
```

E a soma de todas as formas passa a bater com o Saldo do dia (Entradas − Saídas), independente do valor de abertura (que continua fora do "por forma", como saldo inicial).

## Arquivos alterados

- `src/routes/_authenticated/app.caixa.tsx` — função `porFormaDoDiaFechamento` (fechamento do próprio caixa) e o cálculo equivalente dentro do modal **Fechar caixa de outro operador** (linhas ~2461, usa `entradasPorFormaSessao`) para aplicar a mesma regra.
- Se necessário, ajustar também `entradasPorFormaSessao` para incluir saídas quando usada no contexto de fechamento (avaliar se ela é usada em outro lugar apenas como "entradas brutas" — se for, criar uma variante `saldoPorFormaSessao`).

## Regras de sinal

- `recebimento`, `suprimento` → soma na forma correspondente.
- `estorno`, `sangria`, `despesa` → subtrai da forma correspondente.
- `abertura`, `fechamento` → ignorados (não têm forma de pagamento operacional).
- Forma "misto": aplicar o mesmo tratamento por parcela, respeitando o sinal do tipo.

## Fora do escopo

- Não altero regras de negócio de sangria/suprimento/estorno em si.
- Não altero o cálculo do Saldo atual (já está correto).
- Não altero UI do modal além do valor exibido em "Esperado" (que passa a refletir o líquido real).

## Validação

1. Reproduzir cenário da Mayra: entradas R$ 405 (Dinheiro 200 + PIX 135 + Débito 90 – ex.), sangria R$ 90 em dinheiro, despesa R$ 10 em Outros.
2. Antes: Total esperado = 335, Saldo = 245 (diferença 90 — bug).
3. Depois: Total esperado = 245 (Dinheiro 110, PIX 135, Débito 90, Outros 0 — igual à imagem, mas somando 245 = Saldo).
4. Conferir também o modal de fechamento de terceiros (gestor) com os mesmos números.

## Riscos

Baixo — mudança limitada a como o "Esperado" é apresentado e conferido. Nada é gravado diferente no banco: `valor_fechamento_calculado` já é o saldo líquido, o ajuste apenas alinha a conferência por forma com esse saldo.