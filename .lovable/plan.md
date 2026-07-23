## Ajuste

Na Agenda (`src/routes/_authenticated/app.agenda.tsx`, linha 3468), o seletor de itens de orçamento de Odontologia só abre quando o orçamento tem **mais de um item**:

```ts
if (isOdonto && its.length > 1) { ... }
```

Quando há apenas 1 item, o sistema pula direto o pop-up e já preenche o agendamento automaticamente (comportamento atual visto no print do #202600084 restando 1 item).

## Alteração proposta

Remover a condição `its.length > 1`, mantendo apenas `isOdonto`. Assim o pop-up **SelecionarItensOrcamentoDialog** aparece sempre em orçamentos de Odontologia, mesmo com um único item restante — o usuário confirma explicitamente o que está sendo agendado (mais consistente e evita agendar item errado por engano).

## Escopo

- Apenas frontend, arquivo `src/routes/_authenticated/app.agenda.tsx` (1 linha).
- Nenhuma alteração de regra de negócio, banco ou impressão.
- Nenhum outro fluxo afetado (orçamentos de outras especialidades continuam com comportamento atual).

## Clínica-alvo

Precisa confirmar: aplico nas **3 clínicas** (SFP, Menino Jesus, Policlínica) ou em uma específica? Como é ajuste puramente de UX (sem regra de negócio), sugiro global nas 3 — me confirma antes de aplicar.