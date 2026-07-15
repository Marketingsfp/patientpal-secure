## Objetivo

Na tela **Histórico** do agendamento (aberta pelo balão de fala em cada linha da Agenda), hoje um reagendamento aparece como duas entradas separadas — "Liberou horário" no slot antigo e "Agendou" no slot novo — sem indicar para qual ficha/horário/médico o paciente foi. Queremos que fique visível **uma única entrada "Reagendou"** com:

- número da ficha de destino (ex.: `#32`) e origem (`#33`);
- novo horário (data + hora);
- nome do médico de destino.

## Onde mudar (somente 1 arquivo)

`src/routes/_authenticated/app.agenda.tsx` — bloco de renderização da timeline do Histórico (aprox. linhas 5865-6180). Nada muda no banco, nas RPCs (`reagendar_atendimento`) nem em `reagendarAgendamento` da Agenda V2.

## Como identificar um reagendamento no `audit_log`

Tanto o reagendamento clássico (RPC `reagendar_atendimento`) quanto o da V2 gravam no campo `observacoes` da linha que **recebeu** o paciente uma trilha com prefixo fixo:

```
[Reagendado em DD/MM/AAAA, HH:MM:SS] de DD/MM/AAAA, HH:MM:SS para DD/MM/AAAA, HH:MM:SS
```

Regra de detecção em cada `UPDATE` de `agendamentos`:

1. Se `depois.observacoes` contém uma linha `[Reagendado em ...` que **não** existe em `antes.observacoes` → é a linha do **destino** (paciente entrou aqui). Rende como `Reagendou` e:
   - suprime a entrada gêmea "Agendou" que hoje seria emitida por `pacienteMudou && antesLivre && !depoisLivre`;
   - também suprime a entrada "Liberou horário" gerada pelo mesmo par (par identificado por `created_at` no mesmo segundo + mesmo `user_email`).
2. Se a mesma linha aparece só na trilha da própria linha (V2 preserva o id — o paciente é o mesmo, mudou `inicio`/`fim`/`medico_id`), a lógica atual já classifica como `reagendou`; passa a incluir os dados extras abaixo.

## Conteúdo da nova entrada "Reagendou"

Usa dados já disponíveis no diff `dados_antes`/`dados_depois` da própria linha do audit + mapas em memória já existentes na página:

```
Reagendou para #{ficha_destino} · {novo início pt-BR}
Profissional: {nome do médico}
(vindo de #{ficha_origem} · {início antigo})
```

- `ficha_destino` = `depois.ficha_numero`; `ficha_origem` = extraída do par "Liberou horário" (mesma janela + `antes.paciente_nome` = paciente que apareceu no destino).
- `nome do médico` = `medicoNomePorId.get(depois.medico_id)` — o mapa já existe no arquivo (usado em outras partes da timeline). Fallback: "—".
- Horários formatados com o helper `fmtDateTime` já presente.
- Ícone/cor: mantém `kind: "reagendou"` (amber) e o rótulo "Reagendou".

## Casos de borda

- Se por qualquer motivo não achar o par "Liberou horário" (ex.: audit_log truncado), mostra a entrada "Reagendou" só com destino + novo horário + médico, sem "vindo de #..." — não some com o registro.
- Reagendamento V2 (id preservado): não há par a suprimir; só enriquece a entrada existente com ficha atual + novo horário + médico.
- Cancelamentos/exclusões não são afetados — a detecção depende do prefixo `[Reagendado em` novo em `observacoes`.

## Validação

- Abrir o Histórico do paciente reagendado da ficha 33 → 32 na agenda Eletrocardiograma e confirmar que aparece **uma** entrada "Reagendou" com `#32`, horário e nome do médico, e que a linha "Liberou horário" antiga desapareceu (ou virou parte do "vindo de #33").
- Abrir Histórico de um agendamento **não** reagendado — nada muda.
- Abrir Histórico de um paciente reagendado pela Agenda V2 (mesmo id) — a entrada "Reagendou" existente ganha ficha/horário/médico e nada duplica.

## Fora do escopo

- Alterar RPC, schema ou o texto da trilha gravada em `observacoes`.
- Mexer no Histórico do painel financeiro (`HistoricoAtendimentoDialog`) — pedido é sobre o histórico da agenda.
- Backfill de reagendamentos antigos: entradas anteriores continuam como estão; só reagendamentos daqui pra frente ganham o formato novo automaticamente (o audit_log já guarda o diff, então retroativamente também funciona desde que a trilha exista — que é o caso desde a implementação atual).
