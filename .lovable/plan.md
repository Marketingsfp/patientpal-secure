# Plano — Infra de QA/IA para Agenda V2

Objetivo: permitir que a IA rode testes Playwright end-to-end (criar, reagendar, mudar status) + SELECTs de verificação, sem tocar em dados operacionais nem depender de execução manual.

## 1. Usuário e clínica de QA

- **Clínica de testes dedicada**: criar `clinicas` com nome `__QA_AGENDA_V2__` (marcador reconhecível). Nenhum dado real entra aqui.
- **Usuário QA**: `qa-agenda-v2@internal.local` criado via Auth Admin API (migration/seed via server fn admin autorizada). Senha forte guardada em secret `QA_AGENDA_V2_PASSWORD`.
- **Membership**: `clinica_memberships` com role `gestor` **apenas** na clínica QA. Sem vínculo com nenhuma outra clínica.
- **Flag**: `profiles.preferencias_ui.flags.agenda_v2 = true` já pré-setado para este usuário.
- **Guardas de segurança**:
  - Server fn `assertQaUser()` que compara `context.userId` com o UUID do usuário QA (env `QA_AGENDA_V2_USER_ID`) — usada em qualquer rotina destrutiva (seed/cleanup).
  - Constraint lógico: rotinas de cleanup filtram sempre por `clinica_id = QA_AGENDA_V2_CLINICA_ID`. Nunca por outro critério.

## 2. Isolamento dos dados de teste

- Todos os inserts do teste carregam:
  - `clinica_id` = clínica QA;
  - `observacoes` prefixado com marcador `[QA-E2E:{runId}]` onde `runId` é UUID por execução;
  - `paciente_nome` prefixado com `QA_` para pacientes criados no teste.
- Médico e recurso de enfermagem específicos da clínica QA (criados no seed, nunca reaproveitados de produção).
- Disponibilidades geradas apenas em datas futuras "sintéticas" (ex.: ano 2099) para não colidir visualmente com a agenda real caso alguém abra a clínica QA.

## 3. Seed idempotente

Migration única cria (se não existir): clínica QA, médico QA, procedimento QA, disponibilidades de 2099. Usuário QA criado por server fn admin (`ensureQaUser`) autorizada só para admin do sistema, chamada uma vez.

## 4. Execução dos testes (Playwright)

Script em `/tmp/browser/qa-agenda-v2/`:

1. Login como usuário QA (email/senha via env — nunca hardcoded).
2. Trocar para clínica QA.
3. Abrir `/app/agenda-v2` (flag já ON).
4. Cenários cobertos:
   - **S3-A** criar agendamento em slot livre.
   - **S3-B** alterar status (confirmado → realizado → cancelado).
   - **S3-C** reagendar (data, hora, médico).
   - Casos de erro: slot ocupado, horário fora da agenda, mesmo horário.
5. Screenshot em cada etapa em `/tmp/browser/qa-agenda-v2/screenshots/`.
6. Capturar `console` e `network` (falhas 4xx/5xx viram falha do teste).

## 5. Evidências

Por execução (`runId`):

- `screenshots/NN_step.png` — antes/depois de cada ação.
- `console.log` — mensagens do browser.
- `network.jsonl` — requests da rota `/api/*` e server fns.
- `sql-verificacao.md` — resultado dos SELECTs (id, inicio/fim antes/depois, medico_id antes/depois, slot antigo virou DISPONÍVEL, sem duplicidade, pacote/orçamento/paciente preservados).
- `resumo.md` — tabela verde/vermelha por cenário.

## 6. Limpeza automática

Ao final (ou em `finally`, mesmo em falha):

- Server fn `cleanupQaRun({ runId })` protegida por `assertQaUser` + `clinica_id = QA`:
  1. `DELETE FROM agendamentos WHERE clinica_id = QA AND (observacoes LIKE '[QA-E2E:{runId}]%' OR paciente_nome LIKE 'QA_%')` — restaurando slots.
  2. Recria slots DISPONÍVEL apagados via re-seed idempotente das disponibilidades 2099.
  3. Log em `audit_log` com `runId`, contagem removida, timestamp.
- Cleanup "guarda-chuva" agendável (pg_cron opcional): remove qualquer resto com prefixo `[QA-E2E:` mais velho que 24h na clínica QA.

## 7. Rollback

- **Rollback de execução**: `cleanupQaRun` roda ao fim; se falhar, cron 24h varre.
- **Rollback da infra QA**: migration reversa `drop_qa_agenda_v2.sql` remove memberships, clínica QA, médico QA, disponibilidades 2099, e o usuário QA via Auth Admin. Sem efeitos colaterais nas demais clínicas (tudo filtrado por `clinica_id`).
- **Kill switch**: env `QA_E2E_ENABLED=false` faz `assertQaUser` recusar qualquer operação destrutiva, congelando a infra sem remover.

## 8. Detalhes técnicos

- Server fns novas (todas em `src/lib/qa/*.functions.ts`):
  - `ensureQaUser` (admin-only, idempotente).
  - `assertQaUser` (helper middleware).
  - `cleanupQaRun` (autorizado só para usuário QA).
- Secrets necessárias (pedidas via `add_secret` quando aprovado):
  - `QA_AGENDA_V2_USER_ID`, `QA_AGENDA_V2_CLINICA_ID`, `QA_AGENDA_V2_PASSWORD`.
- Nenhuma alteração em `criarAgendamento`, `reagendarAgendamento`, agenda clássica ou RLS de tabelas existentes.
- Playwright: usa fluxo login/senha padrão (sem bypass de auth), respeita RLS como qualquer gestor.

## 9. O que NÃO faz parte deste plano

- Nada é implementado antes da aprovação.
- Não roda nenhum teste, DELETE, seed ou migration ainda.
- Não inicia sprint nova; S3-C segue pendente de validação até o primeiro run automatizado passar.

Aguardando aprovação para implementar.