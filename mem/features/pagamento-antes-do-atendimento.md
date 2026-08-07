---
name: Pagamento antes da execução
description: Regra global — nenhum atendimento (consulta ou exame) pode ser realizado sem pagamento na chegada; convênio exige autorização confirmada.
type: feature
---
# Sem pagamento, não realiza (todas as clínicas)

- O paciente paga na chegada, antes da consulta ou do exame.
- **Particular:** só pode ir para as etapas `atendimento`, `exame`, `finalizado` ou status `realizado` se houver pagamento
  (`agendamentos.data_pagamento` preenchida OU lançamento de receita confirmado OU movimento de recebimento no caixa).
- **Convênio:** exige `agendamentos.convenio_autorizado = true` (autorização confirmada na recepção),
  registrada em `convenio_autorizado_em` / `convenio_autorizado_por`.
- Cancelamento e falta continuam liberados.
- Garantia no banco: trigger `trg_agendamento_exige_pagamento` → `public.fn_agendamento_exige_pagamento()`.
- Frontend: checagem espelhada em `mudarStatus` (`app.agenda.tsx`) + ação "Autorizar convênio" no menu do agendamento.
