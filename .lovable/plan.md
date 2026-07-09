
## Objetivo

Quando existir uma solicitação de estorno **pendente** vinculada a um agendamento:
1. A linha desse agendamento na Agenda aparece em **vermelho** (com uma etiqueta "Estorno solicitado").
2. Para o usuário com perfil **Médico**, o nome do paciente e ações do paciente ficam **ocultos** naquela linha (aparece "— aguardando estorno —"), impedindo o médico de acessar/atender esse paciente até o financeiro decidir.

Quando o financeiro **aprova** o estorno, o agendamento já volta para "Agendado" (fluxo existente). Quando **recusa**, a linha volta ao estado normal.

## O que muda

### 1. Backfill do vínculo `agendamento_id` nas solicitações de estorno
Hoje o Caixa abre o diálogo passando apenas `lancamentoId`, então `estorno_solicitacoes.agendamento_id` fica `null` nesses casos. Vou:
- Ajustar o `SolicitarEstornoDialog` para, quando `agendamentoId` não vier explícito, buscar `fin_lancamentos.agendamento_id` pelo `lancamento_id` antes de inserir a solicitação.
- Rodar uma **migração leve de dados** que preenche `agendamento_id` retroativo nas solicitações existentes com base no `lancamento_id`.

### 2. Agenda (`src/routes/_authenticated/app.agenda.tsx`)
- Carregar em paralelo com os agendamentos as solicitações de estorno **pendentes** da clínica, cruzando por `agendamento_id` (e por `lancamento_id → agendamento_id` como fallback).
- Assinar realtime em `estorno_solicitacoes` para refletir criação/aprovação/recusa sem F5.
- Novo estilo visual da linha quando `estornoPendente(agendamentoId) === true`:
  - Cor de fundo/borda vermelhas (token `destructive`), independente do status.
  - Badge extra "Estorno solicitado" ao lado do status.
- Para o perfil médico (`isMedicoOnly`):
  - Substituir `paciente_nome` por "— aguardando estorno —".
  - Desabilitar botões da coluna "Ações" que abrem paciente/atendimento nessa linha.
- Atualizar a **Legenda** incluindo "Estorno solicitado" em vermelho.

### 3. Grid "por médico" (`AgendaPorMedicoGrid`)
Mesmo tratamento visual e mesmo mascaramento do paciente para médico.

### 4. Caixa
Passar `agendamentoId` também para o `SolicitarEstornoDialog` (quando conhecido a partir do lançamento), para o vínculo ficar imediato.

## Detalhes técnicos

- Fonte da verdade: `estorno_solicitacoes.status = 'pendente'`.
- Cor vermelha via classes existentes (`bg-rose-100 text-rose-800 border border-rose-300`) para manter consistência com o resto do app; sem hardcode fora de tokens.
- Nenhuma alteração de RLS: `is_member` já permite membros da clínica lerem `estorno_solicitacoes`.
- Sem mudar schema (só um UPDATE de backfill em `estorno_solicitacoes`).

## Perguntas rápidas (opcional)

Se preferir, posso também:
- Bloquear completamente o clique na linha (não só ocultar o paciente) para o médico.
- Manter a linha vermelha visível para o médico **ou** ocultá-la totalmente. Meu default é **mostrar em vermelho com paciente mascarado**, para o médico ver que aquele slot está travado.
