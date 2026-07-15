## Diagnóstico

A linha **"Outros — Esperado: R$ 40,00"** aparece na tela "Fechar caixa" porque o cálculo `porFormaDoDiaFechamento` (arquivo `src/routes/_authenticated/app.caixa.tsx`, linhas ~1188–1224) inclui **sangria, suprimento e despesa** no rateio por forma de pagamento. Esses três tipos são operações no dinheiro físico do caixa e são gravadas com `forma_pagamento = null` (confirmado no banco). Como o normalizador devolve `"outros"` para valor nulo/vazio, todo lançamento de sangria/suprimento/despesa vira "Outros".

No dia 15/07 no banco: só existem `sangria`, `suprimento` e `abertura` com `forma_pagamento` vazio. Todos os `recebimento` já têm forma correta (dinheiro, pix, cartao_credito, cartao_debito, misto). Ou seja, **"Outros" nunca é uma forma de pagamento real** — é ruído gerado pelo classificador.

Classificação: erro de código/UX no cálculo, não regra de negócio nova.

## Correção proposta

Tratar sangria, suprimento e despesa como movimentação de **Dinheiro** (afinal, mexem no caixa físico), removendo-as do bucket "Outros". Aplicar em todos os lugares que hoje montam o rateio por forma:

1. `porFormaDoDiaFechamento` (linha ~1188) — modal de Fechar caixa (o da foto).
2. `entradasPorForma` (linha ~1090) — cards de resumo do caixa próprio.
3. `resumoPorDia` (linha ~1130) — quebra do saldo por dia.
4. `entradasPorFormaSessao` (linha ~1343) e o rateio equivalente do relatório impresso (linha ~2808) — mesma lógica.

Regra unificada:
- `recebimento` / `estorno` mantêm o comportamento atual (usam `forma_pagamento`).
- `suprimento` sem forma → **dinheiro** (+).
- `sangria` sem forma → **dinheiro** (−).
- `despesa` sem forma → **dinheiro** (−).
- Se algum desses tipos vier com `forma_pagamento` preenchido (edge), respeitar a forma informada.
- Bucket `outros` continua existindo apenas como fallback defensivo para o resto de um `misto` cuja obs ainda não foi carregada. Na UI do modal de fechamento, ocultar a linha "Outros" quando o valor for zero.

## Onde aparece na tela

- Modal "Fechar caixa": some a linha "Outros" (fica zerada e escondida). O valor esperado de Dinheiro passa a refletir sangria/suprimento/despesa, o que também deixa o "Total conferido esperado" mais fiel à realidade do caixa físico.
- Card "Movimentação por dia" e "Entradas agrupadas por forma": mesmo ajuste.
- Relatório impresso da sessão: rateio por forma sem "Outros" fantasma; sangria/suprimento continuam listados na tabela detalhada exatamente como hoje (não removo linhas de auditoria).

## Fora do escopo

- Não altero o schema de `caixa_movimentos` nem inicio migração de dados antigos — só corrijo o cálculo em runtime.
- Não mexo em fluxo de lançamento (o botão Sangria/Suprimento continua idêntico).
- Não removo a constante `outros` do código; mantenho como fallback para `misto` decomposto.

## Validação

1. Recarregar a aba Caixa → abrir "Fechar caixa" no dia 15/07.
2. Conferir: linha "Outros" some. O valor esperado em "Dinheiro" agora considera a sangria/suprimento do dia.
3. Fechar um caixa de teste conferindo valor e verificar que Diferença bate.
4. Verificar cards "Movimentação por dia" e o Relatório impresso da sessão: nada aparece em "Outros".

## Risco

Baixo. Mudança em cálculos de exibição/conferência do modal de fechamento; não altera saldo total nem grava dado novo. Se o operador estiver acostumado a ver a sangria em "Outros", o valor migra para "Dinheiro" (que é o correto para o caixa físico).
