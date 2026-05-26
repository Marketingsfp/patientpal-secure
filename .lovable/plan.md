## Objetivo

No detalhe do contrato (`/app/cartao-beneficios/contratos` → ao clicar em uma venda), adicionar uma terceira aba chamada **"Dados"** ao lado de "Resumo" e "Contrato", exibindo as informações cadastradas no momento da venda (mesmos campos da foto 2).

## Mudança

Arquivo único: `src/routes/_authenticated/app.contratos.tsx`, dentro do componente `DetalheContrato`.

### 1. Carregar campos extras no `load()`

- Acrescentar à query de `cb_convenios`: `faixas_pessoas` (para mostrar o rótulo da faixa selecionada).
- Acrescentar à query de `cb_planos` (novo `select` se necessário) ou ler do próprio contrato os campos: `dia_vencimento`, `taxa_adesao`, `num_pessoas`, `plano_id`, `paciente_id`.
- Estender o tipo `Contrato` local com `dia_vencimento`, `taxa_adesao`, `num_pessoas`, `paciente_id` (já lidos via cast hoje — vamos tipar).

### 2. Nova aba `<TabsTrigger value="dados">Dados</TabsTrigger>`

Conteúdo em grid 2 colunas (responsivo: 1 coluna em mobile) com campos read-only no mesmo estilo da foto 2:

- **Convênio** — `convenio.nome`
- **Nº de pessoas no contrato** — faixa selecionada (`num_pessoas` + valor) calculada a partir de `convenio.faixas_pessoas`
- **Paciente titular** — `contrato.paciente_nome` (+ CPF do `pacienteFull`)
- **Data início** — `fmtD(contrato.data_inicio)`
- **Dia de vencimento** — `contrato.dia_vencimento`
- **Valor mensal** — `BRL(contrato.valor_mensal)`
- **Taxa de adesão** — `BRL(contrato.taxa_adesao)`
- **Forma de pagamento** — label de `contrato.forma_pagamento` (dinheiro/pix/débito/crédito/boleto)
- **Dependentes (n/máx)** — lista dos `deps` já carregados, com nome, parentesco e CPF; se nenhum, mostrar "Nenhum dependente".

### 3. Sem mudanças em backend

Todos os dados já existem no banco (tabela `contratos`, `cb_convenios`, `contrato_dependentes`, `pacientes`). Apenas leitura — nenhuma migração, nenhuma alteração de RLS, nenhuma alteração nas abas existentes "Resumo" e "Contrato".

## Fora do escopo

- Edição dos dados pela nova aba (apenas leitura).
- Mudanças no fluxo de Nova venda.
- Mudanças nos diálogos de pagamento de parcela.
