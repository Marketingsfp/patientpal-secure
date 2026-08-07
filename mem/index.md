# Project Memory

## Core
Sem pagamento não se realiza atendimento: particular exige pagamento na chegada; convênio exige autorização confirmada (regra global).
Nunca usar popups nativos (window.confirm/alert) — usar confirmDialog global.
Alterações de sistema: sempre confirmar a clínica-alvo antes de aplicar (multi-clínica por clinica_id).

## Memories
- [Pagamento antes do atendimento](mem://features/pagamento-antes-do-atendimento) — regra global de bloqueio, campos de convênio e trigger no banco
