## Objetivo

Tornar o **pagamento antecipado** uma regra obrigatória em todo o fluxo clínico. Hoje a tela de **Check-in** já só lista quem pagou, mas **Triagem**, **Atendimento** e a **Agenda** ainda deixam o paciente avançar sem pagamento. Vamos fechar essas brechas, mantendo exceções legítimas (convênio e cartão benefícios cobrem a consulta).

## Regra de negócio

Considera-se **pago** quando existe pelo menos um destes para o agendamento:
1. `fin_lancamentos` tipo `receita` vinculado ao `agendamento_id` (pagamento no caixa).
2. `agendamento_orcamento_itens` quitado (orçamento já pago).
3. Atendimento por **convênio** (`agendamentos.convenio_id` preenchido) ou **Cartão Benefícios** ativo do paciente cobrindo o procedimento — nesses casos a "cobrança" do paciente é a taxa simbólica e o repasse é tratado pela regra do CB.

Bloqueio aplica-se a: avançar para **Triagem**, **Atendimento (sala/IA)** e **Caixa de saída**. Não bloqueia agendar nem reagendar.

## Mudanças

### 1. Helper único de status de pagamento
- Criar `src/lib/pagamento-status.ts` com `agendamentoEstaPago(agendamentoId)` e versão batch `agendamentosPagosMap(ids[])`, retornando `{ pago, motivo: 'caixa' | 'orcamento' | 'convenio' | 'cartao_beneficios' | null }`.
- Centralizar a lógica que hoje está duplicada em `app.checkin.tsx`, `app.recepcao.tsx` e `app.agenda.tsx`.

### 2. Triagem (`src/routes/_authenticated/app.triagem-enfermagem.tsx`)
- Carregar status de pagamento dos agendamentos do dia.
- Badge **PAGAMENTO PENDENTE** ao lado do nome.
- Botão "Iniciar triagem" desabilitado quando `!pago`, com tooltip "Pagamento pendente — envie ao caixa".
- Atalho rápido "Ir para o caixa" que navega para `/app/caixa?agendamento_id=...`.

### 3. Atendimento (`src/routes/_authenticated/app.atendimento-ia.$agendamentoId.tsx` e `app.recepcao.tsx`)
- No `loader`/efeito inicial verificar pagamento.
- Se não pago: renderizar tela bloqueada com aviso amarelo "Consulta requer pagamento antecipado" + botão **Abrir caixa**.
- Permitir override apenas para usuários com permissão `caixa.supervisor` (reaproveitar `SupervisorAuthDialog`), gerando log em `audit_log` (`acao = 'atendimento_sem_pagamento'`).

### 4. Agenda (`src/routes/_authenticated/app.agenda.tsx`)
- Já existe `pago` no card; reforçar visual: linha com borda âmbar quando pendente.
- Ação "Iniciar atendimento" desabilitada quando pendente (mesma regra do item 3).

### 5. Check-in (`src/routes/_authenticated/app.checkin.tsx`)
- Manter comportamento atual; trocar lógica inline pelo helper novo para não divergir.

### 6. Configuração (opcional, mesma migração)
- Adicionar flag `clinicas.exige_pagamento_antecipado boolean default true`.
- Quando `false`, helper retorna sempre `pago = true` (mantendo apenas o badge informativo). Permite clínicas que aceitam pagar depois.
- Toggle em `/app/clinicas` (edição da clínica): "Exigir pagamento antes da consulta".

## Detalhes técnicos

- Bloqueio é **client-side de UX**; a integridade financeira continua garantida pelas regras de caixa existentes.
- Override usa o fluxo já implementado de `SupervisorAuthDialog` + `audit_log` (tabela já existe).
- Nenhuma migração destrutiva. Apenas `ALTER TABLE clinicas ADD COLUMN exige_pagamento_antecipado boolean NOT NULL DEFAULT true;` + `GRANT` já cobertos pela política existente.
- Helper consulta em uma única query batch para não regredir performance da agenda (`in('agendamento_id', ids)` em `fin_lancamentos` + join leve em `agendamento_orcamento_itens`).

## Fora do escopo

- Cobrança automática por link PIX (pode virar próxima feature).
- Mudanças na lógica de repasse / cartão consulta (já documentadas em memória).
