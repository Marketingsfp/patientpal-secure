## Objetivo

Melhorar o diálogo "Pagamento avulso — Mensalidade do Cartão" (`src/components/cartao-beneficios/pagamento-avulso-dialog.tsx`) para as 3 clínicas. Alteração só de tela + gravação do contrato; nada de valores de Cartão Consulta é recalculado por automação (Regra 1.11 — os valores vêm do que já está cadastrado no convênio).

## O que muda

### 1. Parcelas já pagas
- Novo campo "Quantas parcelas já foram pagas?" (0 a 11), exibido logo após o mês de referência.
- Se ficar vazio ou 0: aviso visível no diálogo — "Será criado um novo contrato com as 12 mensalidades, sendo a do mês de referência baixada agora."
- Se informar X: o contrato passa a começar X meses antes do mês de referência, as X parcelas anteriores entram já como **pagas** (histórico, sem lançamento no caixa, observação "Regularização — parcela informada como paga anteriormente"), a parcela do mês de referência é a baixada com o pagamento real, e as demais ficam pendentes até completar 12.

### 2. Valor automático por número de vidas
- Após escolher o convênio e definir o número de pessoas (titular + dependentes), o valor da mensalidade é preenchido automaticamente pela faixa de vidas do convênio (`cb_convenio_faixas`: vidas_de/vidas_ate → valor_mensal).
- Sem faixa correspondente, cai no `valor_mensal` do convênio.
- O campo continua editável, e mostra abaixo qual faixa foi usada (ex.: "Faixa 2 a 3 vidas — R$ 175,00").

### 3. Dependentes na hora
- Bloco "Dependentes" com botão "Adicionar dependente".
- Cada linha usa a busca de pacientes existente; se o paciente não existir, abre o cadastro rápido já disponível no sistema (nome, CPF, nascimento) e devolve o paciente selecionado.
- Campo de parentesco por dependente.
- O número de vidas = 1 (titular) + dependentes ativos, e recalcula o valor automaticamente.
- Ao salvar, os dependentes são gravados em `contrato_dependentes` vinculados ao contrato criado (as validações existentes de limite/parentesco continuam valendo — se o banco recusar, mostramos o motivo e o contrato/pagamento não se perdem).

## Detalhes técnicos

- Arquivo principal: `src/components/cartao-beneficios/pagamento-avulso-dialog.tsx`.
- Reuso: `PatientSearchInput` e o diálogo de cadastro rápido de paciente (`src/components/pacientes/quick-patient-dialog.tsx`).
- Nova leitura: `cb_convenio_faixas` por `convenio_id` ao carregar convênios.
- Geração de parcelas: offset de meses passa a começar em `-parcelasPagas`; `numero_parcela` continua 1..12; a parcela paga agora é a de índice `parcelasPagas` e é ela que recebe `lancamento_id` e a impressão da GR.
- Sem migração de banco: as tabelas `cb_convenio_faixas` e `contrato_dependentes` já existem.

## Fora do escopo

- Não altera valores/regras de convênio (Regra 1.11).
- Não mexe no fluxo de faturamento rápido de contratos existentes nem no caixa.
