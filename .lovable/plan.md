## Objetivo
Mostrar, na aba **Meu Caixa** do menu Caixa, um detalhamento por forma de pagamento (Dinheiro, PIX, Débito, Crédito e demais) das entradas da sessão atual, junto ao card **Saldo atual**.

## O que muda (apenas UI, sem alterações de banco/regras)

Arquivo: `src/routes/_authenticated/app.caixa.tsx`

1. **Novo cálculo `entradasPorForma`** (useMemo, ao lado de `resumoTipos`)
   - Percorre `minhasMovs` filtrando apenas movimentos que somam ao caixa em cada forma: `recebimento` e `suprimento` (positivos).
   - Agrupa por `forma_pagamento` (fallback `"outros"` quando nulo), normalizando as chaves conhecidas: `dinheiro`, `pix`, `debito`, `credito`, e uma categoria `outros` para o restante (boleto, transferência, cheque, convênio, etc.).
   - Retorna um objeto `{ dinheiro, pix, debito, credito, outros, total }`.

2. **Novo bloco visual abaixo do grid de 4 cards** (Saldo atual / Abertura / Entradas / Saídas):
   - Um card único intitulado **"Entradas por forma de pagamento"**, com 5 mini-linhas/chips em grid responsivo (`grid-cols-2 md:grid-cols-5`):
     - Dinheiro · PIX · Débito · Crédito · Outros
   - Cada item mostra rótulo + valor formatado com `fmt()`. Zeros aparecem como `R$ 0,00` (mantém consistência visual).
   - Estilo alinhado ao restante da aba (usa `Card`/`CardContent` já importados; sem novas dependências).

3. **Sem alteração** em: schema, RPCs, cálculo de `saldoAtual`, fluxo de fechamento, drill-down existente, aba "Todos os caixas" ou comprovantes.

## Detalhes técnicos
- Fonte dos dados: array `minhasMovs` já carregado (campo `forma_pagamento` já vem do select em `MOV_FIELDS`).
- Regra de agrupamento: somente `tipo ∈ {recebimento, suprimento}` para representar "quanto entrou"; sangrias/despesas continuam no card "Saídas".
- Sem impacto em regras de negócio ou memória do projeto.

## Verificação
- Abrir `/app/agenda` → Caixa → aba **Meu Caixa** com sessão aberta e conferir se o novo card exibe os totais e se batem com o card **Entradas** (soma das 5 categorias = Entradas).