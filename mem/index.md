# Project Memory

## Core
Médicos: serviços (medico_procedimentos) e aba "Repasse" (medico_convenios) devem ficar sincronizados. Ao adicionar/remover um serviço, criar/remover automaticamente o item correspondente em Repasse. Itens manuais (nomes que não correspondem a procedimentos) são preservados.
Cartão Consulta: repasse do médico é SEMPRE fixo (`medicos.cb_valor_repasse`, ex.: R$ 35,00), mesmo que o paciente pague uma taxa simbólica (R$ 9,99). Nunca limitar pelo valor pago.

## Memories
- [Repasse cartão consulta](mem://features/repasse-cartao-consulta) — Regra de cálculo do prestador em atendimentos de cartão consulta vs. convênio comum
