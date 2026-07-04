
# Fase 3.b — UI de Conversão + RPCs

Foco: entregar as 4 RPCs de conversão, o `ConversaoOrcamentoDialog` para orçamentos mistos e um alerta/aba de "Procedimentos sem classificação" (`tipo_destino IS NULL`). A migration da Fase 3.a já criou colunas, triggers e status. Nada de dado real é tocado nos testes.

---

## 1. RPCs (SECURITY INVOKER, retorno JSON, PT-BR)

Todas usam `SELECT ... FOR UPDATE` no item + checagem de `orcamentos.status`; qualquer bloqueio grava no `audit_log` via trigger da Fase 2. Concorrência garantida pelas UNIQUE já criadas em `orcamento_itens.agendamento_id` e `orcamento_itens.fin_atendimento_id`.

### 1.1 `converter_item_venda(p_item_id uuid, p_caixa_sessao_id uuid, p_forma_pagamento text, p_desconto numeric default 0)`
- Pré-condições:
  - item existe, `status_item = 'pendente'`, orçamento não `convertido` nem `cancelado`;
  - `procedimentos.tipo_destino IN ('venda_balcao','laboratorio','exame_equipamento','procedimento_medico')` (consulta pura NÃO pode ser vendida sem agenda);
  - `tipo_destino` NÃO pode ser NULL → erro `PROC_NAO_CLASSIFICADO`;
  - `caixa_sessoes.status = 'aberta'` E pertence ao usuário/clínica atual → senão `CAIXA_FECHADO`.
- Efeitos: cria `fin_atendimentos` (com `orcamento_item_id`), cria `caixa_movimentos` (entrada), grava `status_item='vendido'`, `fin_atendimento_id`, `status_alterado_por/em`.
- Retorno: `{ ok, fin_atendimento_id, caixa_movimento_id, orcamento_status_novo }`.

### 1.2 `converter_item_agendamento(p_item_id uuid, p_payload jsonb)`
Payload:
```json
{
  "inicio": "timestamptz", "fim": "timestamptz",
  "medico_id": "uuid|null",
  "medico_agenda_id": "uuid|null",
  "enfermagem_recurso_id": "uuid|null",
  "sala": "text|null",
  "tipo_atendimento": "text", "observacoes": "text|null"
}
```
- Validações por `tipo_destino`:
  - `consulta` / `procedimento_medico` → exige `medico_id` + `medico_agenda_id` de tipo `consulta`/NULL; rejeita `enfermagem_recurso_id`;
  - `exame_equipamento` (MAPA/Holter) → exige `enfermagem_recurso_id` OU `medico_agenda_id.tipo_recurso = procedimentos.tipo_recurso`; rejeita se tipos não baterem (`RECURSO_INCOMPATIVEL`);
  - `us` (ultrassom, identificado por `tipo_recurso='us'`) → exige `medico_id` E (`sala` ou `medico_agenda_id.sala`);
  - `laboratorio` → aceita destino "lab" (sem `agendamentos`): grava `status_item='agendado'` com `agendamento_id=null` e `observacoes` prefixado `[LAB]`; ou cria `agendamentos` se `medico_agenda_id` de tipo `laboratorio`;
  - `venda_balcao` → erro `NAO_AGENDAVEL`.
- `tipo_destino IS NULL` → erro `PROC_NAO_CLASSIFICADO`.
- Efeitos: `INSERT INTO agendamentos (..., orcamento_id, orcamento_item_id)`; UNIQUE já impede duplicidade; grava `status_item='agendado'`, `agendamento_id`.
- Retorno: `{ ok, agendamento_id, orcamento_status_novo, fluxo_lab: bool }`.

### 1.3 `marcar_item_nao_aplicavel(p_item_id uuid, p_motivo text)`
- Restrita a `has_role(auth.uid(),'admin')` OR `has_role(auth.uid(),'gestor')` → senão `PERMISSAO_NEGADA`.
- Exige `p_motivo` não-vazio; grava `status_item='nao_aplicavel'`, `motivo_nao_aplicavel`, autor.
- Retorno: `{ ok, orcamento_status_novo }`.

### 1.4 `cancelar_item(p_item_id uuid, p_motivo text)`
- Mesma regra de permissão. Grava `status_item='cancelado'` + motivo.
- Se item já tinha `agendamento_id`, NÃO apaga o agendamento — apenas marca; UI mostra aviso "cancele o agendamento manualmente".
- Retorno: `{ ok, orcamento_status_novo }`.

### 1.5 Função de leitura `get_orcamento_conversao(p_orcamento_id uuid)` (view server-side)
Retorna, por item:
```
item_id, procedimento_id, procedimento_nome,
tipo_destino, tipo_recurso, requer_medico, requer_sala,
quantidade, valor_unit, valor_total, desconto,
status_item, agendamento_id, fin_atendimento_id,
agenda_inicio, agenda_fim, medico_nome, recurso_nome, sala,
motivo_nao_aplicavel,
acoes_disponiveis text[]   -- ['vender','agendar','nao_aplicavel','cancelar']
```
+ cabeçalho: `orcamento_status`, `caixa_aberto bool`, `is_admin_or_gestor bool`, `total_itens`, `resolvidos`, `com_destino`.

---

## 2. UI: `ConversaoOrcamentoDialog`

Rota: mesma `app.orcamentos` — botão "Converter" no card do orçamento abre o dialog em modo full-screen (>=lg) / bottom-sheet (mobile).

### Layout
```
┌─ Orçamento #123 — Paciente X ─────────── [status: parcialmente_agendado] ─┐
│  Progresso: 2 de 4 itens resolvidos     [ Caixa: ABERTO ● / FECHADO ● ]    │
├────────────────────────────────────────────────────────────────────────────┤
│  # | Procedimento | Tipo destino | Valor | Requisitos | Status | Ação      │
│  1 | Consulta card| consulta     | 300   | Médico     | ✅ Agend| —         │
│  2 | MAPA 24h     | exame_equip. | 250   | Recurso    | ⏳ Pend | Agendar ▾ │
│  3 | US abdômen   | us           | 400   | Méd+Sala   | ⏳ Pend | Agendar ▾ │
│  4 | Vitamina B12 | venda_balcao | 90    | Caixa      | ⏳ Pend | Vender ▾  │
├────────────────────────────────────────────────────────────────────────────┤
│  [Histórico]                                        [Fechar]  [Finalizar]  │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Ação por linha** abre um `Sheet` lateral (subformulário contextual):
  - `Agendar consulta` → `SearchableSelect` médico → `medico_agendas` compatíveis → slots livres.
  - `Agendar exame` → recurso (`enfermagem_recursos` filtrado por `tipo_recurso`) → slots.
  - `Agendar US` → médico + sala + slot.
  - `Fluxo lab` → botão único "Enviar para laboratório" (sem slot).
  - `Vender` → forma de pagamento, desconto, confirma sessão de caixa.
  - `Marcar não aplicável` / `Cancelar item` → apenas admin/gestor; exige motivo.
- **Sem caixa aberta**: botão Vender desabilitado + tooltip "Abra o caixa em /app/caixa".
- **Ações disponíveis** vêm de `acoes_disponiveis` do backend — nunca calculadas só no cliente.
- **"Finalizar" não muda status** — status é recomputado pela trigger; botão só fecha o dialog e faz `invalidateQueries`.
- **Tipo_destino NULL**: linha aparece bloqueada com badge vermelho "Procedimento não classificado" e link "Classificar" → abre o gerenciamento em Procedimentos.
- **Histórico** reaproveita o dialog já existente da Fase 2 (`audit_log` filtrado por `orcamento_id`).

### Componentes novos
- `src/components/orcamentos/ConversaoOrcamentoDialog.tsx` (container + tabela)
- `src/components/orcamentos/conversao/LinhaItem.tsx`
- `src/components/orcamentos/conversao/SheetAgendarConsulta.tsx`
- `src/components/orcamentos/conversao/SheetAgendarRecurso.tsx` (MAPA/Holter/US)
- `src/components/orcamentos/conversao/SheetVender.tsx`
- `src/components/orcamentos/conversao/SheetNaoAplicavel.tsx` (também usa para Cancelar)

Servidor (client-safe): `src/lib/orcamentos-conversao.functions.ts` com 5 `createServerFn` — um por RPC + o `get_orcamento_conversao`. Todos com `.middleware([requireSupabaseAuth])`.

---

## 3. Aba "Procedimentos sem classificação"

Em `src/routes/_authenticated/app.procedimentos.tsx`:
- Novo `<Tabs>` com abas `Todos` | `Sem classificação (N)`.
- Badge vermelho com contagem em tempo real.
- Alerta no topo de `app.orcamentos.tsx`: quando existir ≥1 procedimento NULL, exibe `Alert` com CTA "Classificar N procedimento(s)" → link para a nova aba.
- Reutiliza o form de procedimento existente; adiciona campos `tipo_destino`, `requer_medico`, `requer_sala`, `tipo_recurso` (todos criados na Fase 3.a).

Nada de RPC nova aqui — usa `.update` normal via RLS existente (admin/gestor).

---

## 4. Rollback

Backend: `DROP FUNCTION` das 5 RPCs (idempotente). Nada estrutural muda; migration da Fase 3.a permanece.

Front-end: revert dos commits que adicionam
- `src/components/orcamentos/ConversaoOrcamentoDialog.tsx` + subcomponentes
- `src/lib/orcamentos-conversao.functions.ts`
- diffs em `app.orcamentos.tsx` (botão Converter, alerta) e `app.procedimentos.tsx` (aba).

O bloqueio da Fase 2 e as triggers da Fase 3.a continuam ativos — recepção não consegue editar orçamento convertido mesmo sem a UI.

---

## 5. Testes UI (padrão Fase 2 — prefixo `[TESTE-FASE3-UI]`, Playwright headless, cleanup ao final)

Setup: seed transacional cria 1 paciente teste + 1 orçamento com 4 itens (consulta, MAPA, US, produto). Cada teste roda contra `http://localhost:8080` autenticado via `LOVABLE_BROWSER_SUPABASE_*`.

1. **T1 — Render**: abre dialog, valida colunas, contadores, status inicial `aberto`.
2. **T2 — Consulta OK**: agenda a consulta, item vira `agendado`, orçamento vira `parcialmente_agendado`.
3. **T3 — MAPA em agenda de consulta**: seleciona médico sem recurso, backend rejeita, toast PT-BR, item continua `pendente`.
4. **T4 — MAPA em recurso correto**: agenda passa, orçamento continua `parcialmente_agendado`.
5. **T5 — US sem sala**: bloqueia; com sala: ok.
6. **T6 — Venda sem caixa**: botão desabilitado + tooltip.
7. **T7 — Venda com caixa aberto**: gera `fin_atendimentos` + `caixa_movimentos`; item vira `vendido`.
8. **T8 — Status final**: com todos resolvidos, orçamento vira `convertido` automaticamente; botões de ação somem.
9. **T9 — Duplicidade**: tenta agendar 2× o mesmo item em paralelo (RPC direta) → UNIQUE dispara, 1 falha.
10. **T10 — Recepção tenta "não aplicável"**: bloqueado; admin consegue com motivo.
11. **T11 — Editar convertido**: bloqueio da Fase 2 dispara, grava audit.
12. **T12 — Procedimento NULL**: alerta aparece; ação `Agendar/Vender` bloqueada com badge "não classificado".
13. **T13 — Cleanup**: apaga tudo via `observacoes LIKE '[TESTE-FASE3-UI]%'` + `motivo LIKE '[TESTE-FASE3-UI]%'`; conta rows antes/depois em `orcamentos, orcamento_itens, agendamentos, fin_atendimentos, caixa_movimentos, audit_log` → esperado igual, exceto `audit_log` (append-only).

---

## 6. Riscos por módulo

| Módulo | Risco | Mitigação |
|---|---|---|
| **Agenda** | Novo `orcamento_item_id` em `agendamentos` + trigger `fn_agendamento_valida_destino` já ativa. Risco: agendamento manual sem orçamento continuar funcionando. | Trigger só valida quando `orcamento_item_id IS NOT NULL`. T-smoke reagendando consulta comum no `/app/agenda`. |
| **Caixa** | Venda via RPC precisa da sessão aberta correta. Risco: gravar movimento em sessão de outra clínica. | RPC valida `caixa_sessoes.clinica_id = orcamento.clinica_id` + `usuario_id = auth.uid()` OU `has_role admin/gestor`. |
| **Financeiro** | `fin_atendimentos` recebe `orcamento_item_id` UNIQUE. Risco: split/comissão existente ignorar orçamento. | Splits continuam por `fin_atendimento_id`; nada muda no fluxo de repasse. Query de comissão passa a poder agrupar por orçamento (ganho, não risco). |
| **NFS-e** | Emissão hoje parte de `fin_atendimentos`. Risco: 1 orçamento misto gerar N NFS-e (uma por item). | Comportamento desejado (item = serviço distinto). Documentar em `docs/regras-negocio.md`. |
| **Relatórios** | Novo status `parcialmente_agendado`. Risco: filtros que só consideram `convertido` esconderem dados. | Grep em `src/routes/_authenticated/app.relatorios.tsx` e `financeiro.*` — ajustar filtros que assumem `status IN ('convertido')` para `IN ('convertido','parcialmente_agendado')` quando fizer sentido. Lista de arquivos afetados sai no relatório pós-implementação. |
| **Enfermagem/Recursos** | MAPA/Holter passam a chegar via orçamento. | Fluxo de `agendamentos` já suporta `enfermagem_recurso_id`; validar smoke test. |

---

## 7. Decisões que preciso confirmar

1. **Fluxo lab sem `agendamentos`** (item vira `agendado` só com flag `[LAB]` em observações) — ok ou prefere sempre gerar um `agendamentos` de tipo `laboratorio`?
2. **Venda de item `laboratorio`/`exame_equipamento`**: liberar venda no balcão (pagamento antes do agendamento) OU obrigar agendar primeiro e cobrar só depois?
3. **Cancelar item já agendado**: manter agendamento (proposta atual, com aviso) ou também cancelar o `agendamentos` via RPC?
4. **NFS-e por item vs. agrupada por orçamento**: confirmar que 1 item = 1 NFS-e é o desejado.

Aprovando o plano + as 4 decisões, sigo: criar as RPCs (nova migration) → gerar tipos → implementar UI e alerta → rodar bateria de 13 testes → relatório antes/depois.
