## Objetivo

Na página **Mov. Caixa** (`src/routes/_authenticated/app.financeiro.movimento.tsx`), acrescentar na listagem, para cada lançamento vindo de `fin_lancamentos`:

- **Médico** (nova coluna) — nome do médico do lançamento.
- **Ficha** (nova coluna) — `ficha_numero` do agendamento vinculado.
- **Horário** — hora do pagamento (HH:MM) exibida junto à Data, no mesmo formato que hoje é usado para sangria/suprimento (que já mostra hora).

Sem tocar em lógica financeira, RLS ou schema.

## Mudanças

### 1. `load()` — trazer novos campos e enriquecer

- Ampliar o `select` em `fin_lancamentos` para incluir `medico_id, agendamento_id, created_at`.
- Após montar `finList`, executar duas buscas em batch (só se houver ids):
  - `medicos` → `id, nome` para os `medico_id` distintos.
  - `agendamentos` → `id, ficha_numero` para os `agendamento_id` distintos.
- Preencher em cada linha `fin`:
  - `medico_nome` a partir do map.
  - `ficha_numero` a partir do map.
  - `hora` = `created_at` convertido para `HH:MM` local (mesma UX das linhas de `caixa_movimentos`, que já preenchem `hora`).

### 2. Interface `Lanc`

Acrescentar `medico_nome?: string | null; ficha_numero?: number | null` (os demais já cabem em `hora`/`agendamento_id`).

### 3. Tabela (linhas ~671-694)

- Novo `<TableHead>Médico</TableHead>` entre "Descrição" e "Usuário".
- Novo `<TableHead className="text-right">Ficha</TableHead>` entre "Médico" e "Usuário" (nº da ficha, formatação com 3 dígitos como no restante do sistema — `String(n).padStart(3,"0")`, fallback "—").
- Célula da Data já concatena `hora` quando presente; passa a mostrar hora também para receitas/despesas (via `hora` derivado de `created_at`).

### 4. Exportar Excel (linhas ~468-486)

Incluir no payload e nas colunas: `medico`, `ficha`, `hora` (novas colunas após "Data").

## Fora de escopo

- Linhas de `caixa_movimentos` (sangria/suprimento) não têm médico/ficha; ficam com "—" nas novas colunas.
- Nenhuma alteração no filtro, no cálculo dos totais, no CRUD do dialog, ou nas outras abas.
