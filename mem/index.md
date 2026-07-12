# Project Memory

## Core
Testes e simulações NUNCA podem tocar dados reais de produção (pacientes, agendamentos, contratos, mensalidades, atendimentos, caixa, financeiro, prontuário, LGPD). Usar APENAS registros fictícios com prefixo `SIM_*` ou `REG_E2E_*`, criados e removidos no mesmo teste. Se o fluxo exigir dado real como pré-condição, PARE e peça confirmação explícita.
URL de publicação é IMUTÁVEL. Nunca alterar slug/URL Lovable (`patientpal-secure.lovable.app`). Não passar parâmetro `slug` em publish. Não sugerir renomear.

## Memories
- [Testes só com dados fictícios](mem://constraints/testes-dados-ficticios) — proibido tocar registros reais em qualquer simulação
- [URL de publicação imutável](mem://constraints/url-publicacao-imutavel) — nunca alterar slug ou URL Lovable
