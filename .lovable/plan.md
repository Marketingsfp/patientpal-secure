
## O que está acontecendo

No modal **Histórico** do agendamento (fotos 1 e 3), quando um paciente foi **reagendado** de uma ficha para outra, a timeline mostra apenas:

- "Agendou o paciente X" no destino (foto 1 — ficha 32)
- "Slot da agenda gerado (horário disponibilizado)" na ficha antiga

Falta o que a foto 2 (outro sistema) mostra e o que você pediu antes:

> "REAGENDADO DE 15/07/2026 15:45 COM PROFISSIONAL ROSANGELA SCHMITZ RIOLINO"

O ajuste anterior tentou tratar o reagendamento **na listagem da agenda** (nas linhas coloridas), não no **modal Histórico**. Por isso, ao abrir o Histórico, a informação continua ausente. Precisa mudar o modal.

## Diagnóstico

O modal (`abrirAuditoria`, `src/routes/_authenticated/app.agenda.tsx:1308`) carrega apenas o `audit_log` do agendamento que você está vendo (`record_id = a.id`). Ele não sabe que a linha "Agendou" na ficha 32 é o par gêmeo da linha "Liberou horário" na ficha 33 — porque essa outra linha vive num `record_id` diferente e nunca é buscada.

Sinais que temos para detectar o par:

1. `dados_depois.observacoes` já contém uma trilha `"[Reagendado em ...] de <dataHora antiga> para <dataHora nova>"` — escrita pelo RPC `reagendar_atendimento` (linhas 1085 e 2957 do arquivo, também em `src/lib/agenda/reagendar-agendamento.functions.ts:184`). Isso identifica o **momento** do reagendamento no lado destino.
2. As duas linhas de `audit_log` (destino "slot→alocado" e origem "alocado→slot") acontecem dentro da mesma transação (RPC), então ficam dentro de ±5 segundos, mesma `clinica_id`, mesmo `paciente_nome`.

Ou seja, dá para identificar o par sem alterar banco.

## Escopo do que será feito

Fica dentro do escopo (apenas o modal Histórico):

1. **Buscar o par gêmeo** ao abrir o Histórico: para cada linha `UPDATE` do agendamento atual que muda `paciente_nome` (slot→alocado ou alocado→slot), consultar `audit_log` no mesmo `clinica_id`, tabela `agendamentos`, `record_id ≠` este, com `created_at` dentro de ±5s, movendo o mesmo `paciente_nome` no sentido oposto.
2. Se achou o par, buscar em `agendamentos` os dados da ficha gêmea (`ficha_numero`, `inicio`, `medico_id`) e em `medicos` (`nome`) para exibir na timeline.
3. **Substituir os rótulos**:
   - Destino (ficha atual = 32, era "Agendou o paciente X"): passa a ser **"Reagendou · veio da ficha #033 · 15/07/2026 15:45 · Profissional Rosangela Schmitz Riolino"**.
   - Origem (ficha atual = 33, era "Liberou horário"): passa a ser **"Reagendou · paciente movido para ficha #032 · 15/07/2026 16:30 · Profissional Rosangela Schmitz Riolino"**.
   - Rótulo/cor: usa o `kind: "reagendou"` já existente (âmbar).
4. **Fallback** quando não achar o gêmeo (registros muito antigos, log truncado, etc.): tentar extrair as datas da trilha em `depois.observacoes` (`[Reagendado em ...]`). Se ainda assim não der, mantém o comportamento atual ("Agendou" / "Liberou horário") — nada regride.

Fica fora do escopo:

- Não vou mexer no RPC `reagendar_atendimento`, no fluxo em lote, nem no banco/RLS.
- Não vou tocar na renderização da grade de fichas (a mudança anterior no render fica como está).
- Não vou incluir reagendamento entre clínicas diferentes (foge do caso relatado).

## Detalhes técnicos (para revisão do time)

Arquivo: `src/routes/_authenticated/app.agenda.tsx`

Em `abrirAuditoria` (linha 1308), depois de carregar `agAudit`:

1. Filtrar linhas candidatas: `action === "UPDATE"` e `paciente_nome` mudou (slot↔alocado).
2. Para cada candidata, consultar:
   ```
   supabase.from("audit_log")
     .select("id, record_id, dados_antes, dados_depois, created_at")
     .eq("table_name", "agendamentos")
     .neq("record_id", a.id)
     .gte("created_at", <candidata.created_at - 5s>)
     .lte("created_at", <candidata.created_at + 5s>)
     .limit(20)
   ```
   Fazer isso em batch (uma consulta com `.or()` cobrindo todas as janelas) para não estourar rate.
3. Bater no cliente: mesmo `paciente_nome`, direção oposta.
4. Para cada par encontrado, coletar `record_id` do gêmeo e buscar de uma vez:
   ```
   supabase.from("agendamentos")
     .select("id, ficha_numero, inicio, medico_id, enfermagem_recurso_id")
     .in("id", <ids gêmeos>)
   ```
   e `medicos` por `id`.
5. Guardar em um `Map<auditRowId, { fichaGemea, inicioGemea, medicoNome }>` (`enrichReag`).
6. No render (linhas ~6118 e ~6134), antes de emitir `agendou`/`liberou`, checar o mapa:
   - Se destino tem gêmeo (origem), emite `kind: "reagendou"` com corpo "Reagendou · veio da ficha #NNN · <data hora> · Profissional <nome>".
   - Se origem tem gêmeo (destino), emite `kind: "reagendou"` com corpo "Reagendou · movido para ficha #NNN · <data hora> · Profissional <nome>".
7. Fallback trilha: se `depois.observacoes` (destino) contém `[Reagendado em ...] de <X> para <Y>`, parseia X e Y para exibir data/hora mesmo sem gêmeo; ficha e profissional ficam em branco quando não há gêmeo.

Formato de exibição (mantém consistência visual):

- Destino: **"Reagendou"** (chip âmbar) — corpo: `Veio da ficha #033 · 15/07/2026 15:45 · Prof. Rosangela Schmitz Riolino`.
- Origem: **"Reagendou"** (chip âmbar) — corpo: `Paciente movido para ficha #032 · 15/07/2026 16:30 · Prof. Rosangela Schmitz Riolino`.

## Antes e depois (validação)

- **Antes:** Histórico da ficha 32 mostra apenas "Agendou o paciente Quedima…". Histórico da ficha 33 mostra apenas "Slot da agenda gerado" (ou "Liberou horário", dependendo do caso).
- **Depois:** As duas fichas mostram um item **"Reagendou"** com origem/destino (ficha + data/hora + profissional), no formato da foto 2.
- **Como vou validar:**
  1. Abrir o Histórico da ficha 32 (Eletrocardiograma, paciente QUEDIMA SUELEN) — deve aparecer uma entrada "Reagendou · veio da ficha #033 · 15/07/2026 15:45 · Prof. …".
  2. Abrir o Histórico da ficha 33 do mesmo dia — deve aparecer "Reagendou · movido para ficha #032 · 15/07/2026 16:30 · Prof. …".
  3. Abrir o Histórico de um agendamento **normal** (sem reagendamento) — continua mostrando "Agendou o paciente X", sem regressão.
  4. Verificar visualmente: sem duplicação (não pode aparecer "Agendou" **e** "Reagendou" para o mesmo evento).

## Pendências / riscos

- **Regra de negócio:** nenhuma mudança de negócio — só apresentação do histórico.
- **Risco:** o pareamento por janela de ±5s pode, em teoria, casar dois eventos coincidentes sem serem reagendamento. Mitigação: exigir mesmo `paciente_nome` e sentido oposto; se houver mais de um candidato, priorizar o mais próximo no tempo.
- **Reagendamentos muito antigos** sem par no `audit_log` (log expirado) caem no fallback da trilha em `observacoes`, com ficha/profissional em branco.
- **LGPD / auditoria:** não altero conteúdo do `audit_log`; só leio.

Se aprovar, aplico apenas essa alteração no modal Histórico e valido nos dois lados (ficha 32 e ficha 33 do caso relatado).
