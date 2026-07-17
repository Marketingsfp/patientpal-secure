## Objetivo

Quando um dependente é incluído em um contrato já vendido, gerar automaticamente uma cobrança de **"Taxa de inclusão de dependente"**, com opção de o operador desmarcar/ajustar antes de confirmar. A taxa aparece na aba **Mensalidades** do contrato, mas **não conta** no total de parcelas mensais.

## Como funciona hoje (para contexto)

- `contrato_mensalidades.numero_parcela = 0` já é usado como linha de **Adesão** (taxa inicial do contrato). O helper `isAdesao(m)` filtra essa linha do bloco de parcelas mensais (contador "3/14" etc.), mas ela aparece na tabela de mensalidades com o badge "Adesão".
- Hoje, ao **incluir dependente** (`incluirDependenteContrato`), o sistema só grava em `contrato_dependentes` — nenhuma cobrança é gerada.
- O convênio tem apenas `cb_convenios.taxa_adesao` (taxa inicial do contrato). Não existe campo para taxa de inclusão de dependente.

## Escopo

Somente **contratos já vendidos** (a inclusão pós-venda). Nada muda no wizard de venda inicial nem no cálculo das mensalidades correntes.

Áreas afetadas:
- `src/components/pages/contratos-page.tsx` (diálogo "Incluir dependente" + tabela Mensalidades + resumo)
- `src/lib/contrato-dependentes.ts` (retornar dados necessários pra criar a cobrança na mesma transação lógica)
- `cb_convenios` (nova coluna opcional de valor padrão da taxa)
- `contrato_mensalidades` (novas linhas com `numero_parcela` negativo — sem alteração de schema)

## Regra de negócio

1. **Quando incluir dependente**, se a data de inclusão **for igual à data de início do contrato** (mesmo dia da venda), **não** gerar taxa por padrão (checkbox desmarcado, mas pode marcar).
2. **Caso contrário**, gerar taxa por padrão (checkbox marcado, pode desmarcar).
3. Valor sugerido: `cb_convenios.taxa_inclusao_dependente` (nova coluna). Se 0/nulo, sugerir `cb_convenios.taxa_adesao` como fallback razoável — sempre editável no diálogo.
4. Vencimento sugerido: hoje. Editável.
5. A taxa é **cobrança única, avulsa** — não altera valor mensal, não altera nº de parcelas, não gera juros/multa automáticos por atraso da mensalidade (segue o mesmo comportamento da linha de Adesão inicial).
6. Ao **excluir** um dependente que tenha taxa de inclusão **pendente** vinculada a ele: perguntar ao operador se deseja também excluir a taxa pendente (não excluir automaticamente para não sumir com histórico sem consentimento).

## Modelagem

Sem quebrar o padrão atual:

- Continuar usando `contrato_mensalidades` para as taxas (assim já entra em `Mensalidades`, aceita "Pagar", "Reverter", "Paga (histórica)", boleto, carnê e NFS-e sem duplicar código).
- Convenção de `numero_parcela`:
  - `0`  → Adesão inicial do contrato (já existe)
  - `-1, -2, -3…` → Taxas de inclusão de dependente (nova convenção)
- A restrição UNIQUE em `(contrato_id, numero_parcela)` já suporta múltiplos negativos.
- Guardar o nome do dependente em `observacoes` no formato: `Taxa de inclusão de dependente — <NOME DO DEPENDENTE>` para exibição/emissão de NFS-e.

Ajustar helpers:
- `isAdesao(m)` → renomear conceito para `isEncargoAvulso(m) = numero_parcela <= 0`, mantendo `isAdesao` como caso `=== 0` para o texto do resumo.
- `cobrancaLabel(m)`:
  - `=== 0` → "Adesão"
  - `< 0`   → "Taxa inclusão" (badge secundário, com tooltip contendo o nome do dependente)
  - `> 0`   → `Mensalidade N`
- Todos os pontos que filtram parcelas mensais com `!isAdesao(m)` passam a filtrar com `!isEncargoAvulso(m)`:
  - `mensalidades = mens.filter(...)`
  - `recalcularParcelasAbertas` (não deve recalcular taxas)
  - `numeracao/renumeração` ao adicionar/excluir parcela
  - contador `3/14` no card "Pagas"

## Migração de banco

Uma migração:

```sql
ALTER TABLE public.cb_convenios
  ADD COLUMN IF NOT EXISTS taxa_inclusao_dependente numeric(10,2) NOT NULL DEFAULT 0;
```

Cadastro do valor: exibir esse campo no formulário de edição do convênio (aba Convênios → editar convênio), ao lado de "Taxa de adesão". *(Se preferir deixar essa parte fora deste ciclo, mantemos apenas o valor sugerido pelo operador no diálogo, sem valor padrão do convênio — validar.)*

## UI — Diálogo "Incluir dependente"

Adicionar bloco antes do rodapé do diálogo:

```
┌────────────────────────────────────────────────────────┐
│ [x] Cobrar taxa de inclusão de dependente              │
│      Valor (R$):  [  50,00  ]                          │
│      Vencimento:  [ 17/07/2026 ]                       │
│      Cobrança avulsa — não conta como mensalidade.     │
└────────────────────────────────────────────────────────┘
```

- Checkbox marcada por padrão, exceto quando `data de inclusão == contrato.data_inicio`.
- Se desmarcada, os campos ficam desabilitados.
- Botão "Incluir" continua fazendo a inclusão do dependente; se checkbox marcada, também insere a linha em `contrato_mensalidades` com `numero_parcela` = min(negativos existentes) − 1.

## UI — Tabela Mensalidades (aba Resumo do contrato)

- Linhas com `numero_parcela < 0` aparecem na tabela com Badge `Taxa inclusão` (variant secondary) na coluna "Cobrança" e tooltip com o nome do dependente.
- Ações disponíveis nessa linha: **Pagar**, **Paga (histórica)**, **Reverter** e **Excluir** — mesmas da linha de Adesão.
- Cabeçalho de mensalidades continua o mesmo. Contador de parcelas ("3/14") continua ignorando `numero_parcela <= 0`.

## Fluxos derivados que passam a considerar a taxa

- **Card "A receber"**: passa a somar taxas de inclusão pendentes também (é dinheiro a receber).
- **Card "Recebido"**: soma taxas pagas.
- **Card "Pagas 3/14"**: **não** conta a taxa de inclusão (nem hoje conta a de adesão).
- **Descrição para NFS-e / lançamento financeiro** (`emitirNfseParcela` + `criarLancamentoFinanceiro`): usar `Taxa de inclusão de dependente — <NOME DEP> — Contrato #N — <TITULAR>` (baseado em `observacoes`).
- **Boleto / carnê "parcelas em aberto"**: seguem incluindo linhas negativas em aberto (mesma regra da adesão hoje). Se a UX atual do carnê já pula adesão, manter esse mesmo tratamento — validar no código antes de tocar.

## Exclusão de dependente

Ao clicar em Excluir dependente:
1. Consultar se há linha `numero_parcela < 0` **pendente** cujo `observacoes` referencia esse dependente.
2. Se houver, mostrar aviso no diálogo de exclusão: *"Existe uma taxa de inclusão pendente vinculada a este dependente. Deseja também excluí-la?"* com checkbox opcional.
3. Taxas de inclusão **já pagas** nunca são excluídas — permanecem como histórico financeiro.

## Passos de implementação

1. **Migração**: adicionar `cb_convenios.taxa_inclusao_dependente` (com default 0). *(Aguarda aprovação antes de rodar.)*
2. **Convênios (opcional neste ciclo)**: expor o novo campo no formulário de edição do convênio.
3. **Helpers em `contratos-page.tsx`**: introduzir `isEncargoAvulso`, ajustar `cobrancaLabel`, e trocar todos os filtros `!isAdesao` que se referem a "parcelas mensais" por `!isEncargoAvulso`. Manter `isAdesao` apenas para o texto do resumo.
4. **`incluirDependenteContrato`**: aceitar opcional `taxa?: { valor: number; vencimento: string; observacoes: string }`; quando presente, inserir a linha em `contrato_mensalidades` após inserir o dependente (mesma função) e retornar a linha criada.
5. **Diálogo "Incluir dependente"** em `contratos-page.tsx`: novos estados `cobrarTaxa`, `taxaValor`, `taxaVenc`; carregar valor padrão do convênio; regra do "mesmo dia" para default do checkbox; passar payload de taxa para o helper.
6. **Tabela Mensalidades**: renderizar badge "Taxa inclusão" com tooltip do nome do dependente; garantir que ações "Pagar/Reverter/Excluir/Paga (histórica)" funcionam nas linhas negativas (a lógica atual já é agnóstica ao número da parcela).
7. **Diálogo Excluir dependente**: detectar taxa pendente e oferecer excluí-la junto.
8. **Cards do Resumo**: revisar `A receber`/`Recebido` para incluir as novas linhas negativas.
9. **Validação manual em produção (com cautela, conforme AGENTS.md)**: em um contrato de teste rastreável, incluir dependente com taxa, conferir que aparece na tabela, que o contador de parcelas não muda, pagar/reverter, e depois excluir. Registrar antes/depois no chat.

## Fora do escopo

- Não altero o wizard de venda inicial (taxa de adesão inicial continua igual).
- Não altero o cálculo automático do valor mensal por vida.
- Não crio integração com boleto/carnê nova — reaproveita a que já existe para adesão.

## Pontos que preciso confirmar

1. **Valor padrão da taxa** — vem de um novo campo no convênio (`taxa_inclusao_dependente`), ou o operador digita sempre? Recomendo criar o campo no convênio para padronizar entre unidades.
2. **Regra do "mesmo dia"** — considerar "mesmo dia" = `data_inicio` do contrato? Ou uma janela (ex: até 7 dias após a venda) para não cobrar?
3. **Ao excluir um dependente com taxa pendente** — perguntar ao operador (recomendado) ou excluir automaticamente a taxa pendente?
