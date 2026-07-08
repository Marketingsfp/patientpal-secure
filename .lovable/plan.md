## Diagnóstico

Na 2ª via, o horário do pagamento aparece como "21:00" mesmo o pagamento tendo sido feito às ~15:31 local. Causa:

- `repasse_pago_at` desse pagamento foi **backfillado** pela migration, com `repasse_pago_em::timestamptz` — como o Postgres do servidor está em UTC, um `date` "2026-07-08" vira `2026-07-08 00:00:00 UTC`.
- No navegador (fuso BRT, UTC−3), `new Date("2026-07-08T00:00:00Z").getHours()` retorna **21** (do dia anterior, mas hora 21).
- A verificação atual "se hh/mm/ss são 0, não mostra hora" usa **horário local** e por isso não detecta o backfill fora do fuso UTC.

## Correção

Em `src/routes/_authenticated/app.financeiro.atendimentos.tsx`, dentro de `buildComprovante`:

- Detectar o "sem horário" comparando os componentes em **UTC** (`getUTCHours/getUTCMinutes/getUTCSeconds === 0`). Assim, backfills feitos à meia-noite UTC são reconhecidos e o comprovante exibe "(horário não registrado)".
- Manter a exibição de HH:mm em horário local para pagamentos novos (`repasse_pago_at` gravado com `new Date().toISOString()`, que raramente cai exatamente em 00:00:00 UTC).

## Fora de escopo

- Nenhuma migration.
- Nenhuma mudança em outras telas nem no fluxo de gravação.
