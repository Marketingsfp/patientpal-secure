## Contexto

Hoje, quando o recepcionista seleciona vários atendimentos do mesmo paciente e usa **Opções → Cobrar selecionados**, o sistema grava:

- **1 lançamento "principal"** com o valor total do grupo, vinculado ao primeiro atendimento (`fin_lancamentos.agendamento_id = principal`);
- **N lançamentos-sombra com valor R$ 0,00**, vinculados aos demais atendimentos, só para marcá-los como "pagos".

Isso quebra o estorno individual:

- Estornar a **linha principal** desfaz só o primeiro atendimento — os outros continuam aparecendo como pagos (as sombras seguem `confirmado`).
- Estornar uma **sombra** cancela uma linha de R$ 0,00 — o atendimento pedido "sai" do pago, mas o **valor total do grupo continua no principal**, ou seja, o paciente segue cobrado pelo item estornado.

Objetivo: cada atendimento deve poder ser estornado individualmente, tirando exatamente **o valor daquele atendimento** do movimento de caixa e mantendo os demais intactos.

## Estratégia

Trocar o modelo "1 principal + N sombras zeradas" por **N lançamentos individuais** (um por atendimento) agrupados por um mesmo `grupo_pagamento_id`. A soma dos N continua igual ao total cobrado, então:

- Movimento de Caixa, BI, resumo do dia: **sem mudança visível de totais** para pagamentos novos.
- Guia de atendimento agrupada, comprovante e forma de pagamento: **iguais**.
- Estorno: cancela apenas a linha do atendimento pedido → sai só o valor daquele atendimento; os outros do grupo permanecem.

## Mudanças

### 1. Banco (migration)

Adicionar em `fin_lancamentos`:
- `grupo_pagamento_id uuid` (nullable) — agrupa lançamentos de uma mesma cobrança em lote.
- Índice em `grupo_pagamento_id`.

Sem alteração de RLS/grants (colunas em tabela já existente).

### 2. Rateio do valor por atendimento (`app.agenda.tsx`, `cobrarSelecionados` → `onSavedWithData`)

Ao montar o pagamento agrupado, além do total, guardar o **valor unitário** de cada atendimento (já calculado hoje em `procsResolvidos` para somar o total). Passar essa lista adiante junto de `pagamentoExtraIds`.

Se houver **desconto** aplicado, ratear proporcionalmente pelos valores unitários (mantém consistência com o total pago).

No `onSavedWithData`, em vez de:
- atualizar o principal (feito pelo `LancamentoDialog`) + inserir sombras zeradas,

fazer:
1. Gerar um `grupoId = crypto.randomUUID()`.
2. Ajustar o lançamento **principal** já criado pelo `LancamentoDialog`: `update` com `valor = valorUnit[0]` e `grupo_pagamento_id = grupoId`, `descricao` da forma "Paciente — Procedimento (1/N do grupo)".
3. Inserir N-1 lançamentos individuais para os extras, cada um com:
   - `agendamento_id = extraId`,
   - `valor = valorUnit[i]`,
   - `forma_pagamento`, `status = confirmado`, `data`, `clinica_id` iguais ao principal,
   - `grupo_pagamento_id = grupoId`,
   - `descricao` "Paciente — Procedimento (i/N do grupo)",
   - `observacoes` "Pagamento agrupado (grupo <id>)".

Manter check-in automático e limpeza da seleção como estão.

### 3. Estorno individual (`app.financeiro.movimento.tsx`, `estornar`)

Nada muda no botão nem no fluxo. Como cada atendimento agora tem seu próprio lançamento com valor real, o `update status = cancelado` já:
- tira o valor daquele atendimento do caixa,
- reverte o agendamento correspondente,
- mantém os demais do grupo intactos.

Adicionar apenas um detalhe informativo na mensagem de confirmação quando `grupo_pagamento_id` estiver preenchido: "Este pagamento faz parte de um grupo de N atendimentos. Apenas este será estornado." (para o operador entender que os outros continuam pagos).

### 4. Compatibilidade com pagamentos antigos (sombras zeradas)

Para lançamentos legados (`observacoes` começando com "Pagamento agrupado com agendamento ..." ou valor 0 vinculado a agendamento pago):

- No diálogo de confirmação do estorno, quando o lançamento tem valor 0 e observação de agrupamento, avisar: "Este atendimento foi pago em grupo. Estornando-o o valor total do pagamento principal não será ajustado automaticamente — se necessário, ajuste o lançamento principal também."
- Não fazemos migração retroativa desses registros (arriscado alterar históricos financeiros).

## Fora de escopo

- Não altera fluxos individuais de pagamento (1 atendimento).
- Não altera RLS, políticas, ou tipos de recibo/guia.
- Não migra dados antigos.
- Não altera a auditoria (o log de ESTORNO por lançamento já existe e passa a marcar corretamente cada atendimento estornado).
