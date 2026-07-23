## Diagnóstico

O toggle está aplicando o intervalo do picker de datas quando o usuário deixou uma **data final** preenchida:

```ts
// src/routes/_authenticated/app.agenda.tsx, linhas 1822-1828
if (apenasData) {
  const inicio = new Date(`${dataRef}T00:00:00`).toISOString();
  const fimDia = dataFim ?? dataRef;   // ← ainda respeita dataFim
  const fim = new Date(`${fimDia}T23:59:59`).toISOString();
  q = q.gte("inicio", inicio).lte("inicio", fim);
}
```

Por isso aparecem outras datas: se o usuário selecionou um intervalo (ex.: 23/07 → 30/07) e depois marcou "Exibir apenas a data selecionada", a consulta segue trazendo os 8 dias.

## Correção

Quando **"Exibir apenas a data selecionada"** estiver marcado, filtrar **estritamente pela `dataRef`**, ignorando qualquer `dataFim`. Nada muda nos outros filtros — Profissional, Status, Cliente, Especialidade, Agenda, Dia da semana continuam sendo aplicados normalmente (a filtragem em memória já cobre isso).

```ts
if (apenasData) {
  const inicio = new Date(`${dataRef}T00:00:00`).toISOString();
  const fim = new Date(`${dataRef}T23:59:59`).toISOString();
  q = q.gte("inicio", inicio).lte("inicio", fim);
}
```

## Escopo e clínica-alvo

Alteração puramente técnica em código de frontend (`app.agenda.tsx`), sem regra de negócio nova.

Você quer aplicar essa correção para **todas as 3 clínicas** (SFP, Menino Jesus, Consulta Hoje)? É uma correção de comportamento do toggle — o mais coerente é global. Posso confirmar antes de aplicar.