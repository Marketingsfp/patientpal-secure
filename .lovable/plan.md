## Problema

Hoje o sistema bloqueia qualquer novo agendamento a partir de um orçamento assim que existe **um** agendamento ativo vinculado a ele (`src/routes/_authenticated/app.agenda.tsx`, linha ~1885). Isso impede o uso parcelado do orçamento — exatamente o caso do #202600013, onde só a eletroneuromiografia foi agendada e a audiometria + teste do olhinho ficaram travadas.

## Solução proposta

Permitir **agendamentos parciais** do orçamento, controlando quais itens já foram usados em vez de bloquear o orçamento inteiro.

### 1. Banco — vincular agendamento ↔ item de orçamento
- Nova tabela `agendamento_orcamento_itens` (relação N:N entre `agendamentos` e `orcamento_itens`) com `clinica_id`, `agendamento_id`, `orcamento_item_id`, `quantidade` (default 1) e timestamps. RLS por clínica, com grants completos.
- Permite saber exatamente quais itens (e quantidade) de cada orçamento já foram consumidos, mesmo quando o orçamento foi dividido em vários agendamentos.

### 2. Lógica de abertura do orçamento (app.agenda.tsx)
- Remover o `toast.error("Este orçamento já está vinculado…")`.
- Ao abrir um orçamento, buscar os itens já consumidos via `agendamento_orcamento_itens` (excluindo agendamentos cancelados).
- Calcular a lista de **itens restantes** (quantidade pedida − quantidade já agendada).
- Se não sobrar nenhum item → aviso amigável "Todos os itens deste orçamento já foram agendados" + botão para ver os agendamentos existentes.
- Se sobrar 1 item → fluxo direto (igual hoje), só com os itens restantes.
- Se sobrar mais de um grupo → abrir o `DividirOrcamentoDialog` apenas com os itens restantes.

### 3. DividirOrcamentoDialog
- Receber a lista de itens restantes (já filtrada) e exibir um cabeçalho informativo: "Restam X de Y itens deste orçamento".
- Ao salvar os agendamentos, inserir também as linhas em `agendamento_orcamento_itens` (um insert por item incluído em cada grupo).

### 4. Backfill
- Migração de dados única: para cada agendamento existente com `orcamento_id`, marcar **todos** os itens do orçamento como consumidos por aquele agendamento (comportamento atual). Assim orçamentos legados continuam consistentes.

### 5. UI extra (pequenos ajustes)
- Na listagem de orçamentos (`/app/orcamentos-agenda`), mostrar contador `Realizados (n/total)` por orçamento, considerando itens (não mais "tudo ou nada").
- No DANFSE / impressão do orçamento: nada muda.

## Arquivos afetados

- **Migração nova**: tabela `agendamento_orcamento_itens` + RLS + grants + backfill.
- `src/routes/_authenticated/app.agenda.tsx` — remover bloqueio, calcular itens restantes, passar para o dialog.
- `src/components/agenda/dividir-orcamento-dialog.tsx` — receber itens restantes, gravar vínculo na nova tabela após criar os agendamentos.
- `src/routes/_authenticated/app.orcamentos-agenda.tsx` — atualizar badge "Realizados" para refletir itens (opcional, mas recomendado).

## Pergunta para confirmar antes de implementar

Quando um item tem **quantidade > 1** (ex.: "4 x ELETRONEUROMIOGRAFIA"), você quer:
- **(A)** Tratar como **1 item consumido = orçamento item inteiro** (mais simples: agendou eletroneuromiografia → as 4 saem do saldo); ou
- **(B)** Permitir agendar **parcial por quantidade** (agenda 1 das 4 hoje, sobram 3 para depois)?

A opção **A** é mais simples e cobre 95% dos casos; a **B** dá flexibilidade máxima mas exige um seletor de quantidade no dialog.
