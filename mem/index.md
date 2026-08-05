# Project Memory

## Core
Testes e simulações NUNCA podem tocar dados reais de produção (pacientes, agendamentos, contratos, mensalidades, atendimentos, caixa, financeiro, prontuário, LGPD). Usar APENAS registros fictícios com prefixo `SIM_*` ou `REG_E2E_*`, criados e removidos no mesmo teste. Se o fluxo exigir dado real como pré-condição, PARE e peça confirmação explícita.
URL de publicação é IMUTÁVEL. Nunca alterar slug/URL Lovable (`patientpal-secure.lovable.app`). Não passar parâmetro `slug` em publish. Não sugerir renomear.
Configurações são independentes por clínica: código/UI compartilhados, mas toda parametrização (convênios, valores, taxas, carência, permissões, integrações, branding, seeds) é isolada por `clinica_id`. Nunca vazar config entre clínicas.
Independência de features/layout entre clínicas via feature flags por `clinica_id` (Opção B). Toda nova mudança divergível nasce com flag; correção global só para bugs críticos (segurança, LGPD, financeiro, schema). Nunca `if` por nome de clínica.

## Memories
- [Testes só com dados fictícios](mem://constraints/testes-dados-ficticios) — proibido tocar registros reais em qualquer simulação
- [URL de publicação imutável](mem://constraints/url-publicacao-imutavel) — nunca alterar slug ou URL Lovable
- [Config independente por clínica](mem://preferences/config-por-clinica) — parametrização sempre escopada por clinica_id
- [Feature flags por clínica](mem://preferences/feature-flags-por-clinica) — Opção B: mudanças divergíveis via flag por clinica_id, sem fork
