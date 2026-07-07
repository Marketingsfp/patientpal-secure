# Fase QA-1 — Plano técnico e validação de segurança

Sem migration, sem usuário Auth, sem secret, sem server function. Apenas o desenho detalhado para sua aprovação.

---

## 1. Qual clínica será usada

**Clínica nova, exclusiva de teste.** Nada de reaproveitar clínica real.

- Nome: `__QA_AGENDA_V2__` (dois underscores em cada ponta — inconfundível na UI).
- Marcada com um campo próprio de sinalização (ex.: `clinicas.observacoes = '[QA-AGENDA-V2] Clínica de testes automatizados. NÃO USAR.'`).
- Nenhum paciente real, nenhum médico real, nenhum orçamento real jamais entra nela.
- Não aparece no seletor de clínica de nenhum usuário operacional (só o usuário QA tem membership).

**Motivo:** clínica real com "dados isolados" é uma promessa frágil — basta um bug de filtro por `clinica_id` para vazar. Clínica nova elimina o risco na raiz.

---

## 2. Permissões do usuário QA

- Role: `gestor` **somente** na clínica QA. Nenhuma outra `clinica_memberships`.
- Sem role `admin` em lugar nenhum.
- Flag `preferencias_ui.flags.agenda_v2 = true` pré-setada.
- Sem vínculo em `medicos`, `prestadores`, `funcionarios` reais.
- Sem acesso a `integration_secrets`, `nfse_emitentes`, `whatsapp_configs` (garantido por não ter membership em clínica real — RLS já bloqueia).

---

## 3. Como garantir que ele não altera dados reais

Três camadas independentes:

1. **RLS existente**: todas as tabelas operacionais filtram por `clinica_id` via membership. Como o usuário QA só é membro da clínica QA, o Postgres recusa qualquer SELECT/UPDATE/DELETE fora dela — mesmo que o front tente.
2. **Guarda em server fns destrutivas de QA** (`assertQaUser`): compara `context.userId` com `QA_AGENDA_V2_USER_ID`. Se não bater, `throw`. Usada em `cleanupQaRun` e `ensureQaUser`.
3. **Filtro duplo em cleanup**: `DELETE ... WHERE clinica_id = QA_AGENDA_V2_CLINICA_ID AND observacoes LIKE '[QA-AGENDA-V2:%'`. Nunca por outro critério. Constante lida de env, não hardcoded.

Nenhuma alteração em RLS de tabelas existentes. Nenhum uso de `supabaseAdmin` em rotinas de teste (só no bootstrap `ensureQaUser`, autorizado a admin).

---

## 4. Tabelas tocadas

**Escrita (só na clínica QA):**
- `clinicas` — 1 linha (seed).
- `clinica_memberships` — 1 linha (usuário QA ↔ clínica QA, role gestor).
- `profiles` — 1 linha (perfil do usuário QA, com flag agenda_v2).
- `medicos` — 1 linha (médico fictício QA).
- `especialidades`, `procedimentos` — 1 linha cada (QA).
- `medico_agendas`, `medico_disponibilidades` — slots sintéticos em 2099.
- `pacientes` — criados durante os testes, prefixo `QA_`.
- `agendamentos` — criados/reagendados/cancelados durante os testes, marcador em `observacoes`.

**Leitura (apenas para SELECTs de verificação):**
- `agendamentos`, `medico_disponibilidades`, `audit_log`.

**Não tocadas em nenhuma hipótese:** `boletos`, `nfse`, `nfse_emitentes`, `contratos_assinatura`, `fin_lancamentos`, `fin_atendimentos`, `pagamentos`, `caixa_movimentos`, `whatsapp_*`, `atend_*`, tabelas `hr_*`, `lms_*`, `mkt_*`, `audit_log` (só leitura).

---

## 5. Registros criados

Por execução (`runId` = UUID):

- 1 a 3 pacientes `QA_<runId-curto>` (se cenário exigir novo paciente).
- 1 a 5 agendamentos com `observacoes LIKE '[QA-AGENDA-V2:{runId}]%'`.
- Nenhum orçamento, nenhum pagamento, nenhuma NFS-e, nenhum contrato, nenhum boleto.

Seed permanente (uma vez só): clínica QA, médico QA, especialidade QA, procedimento QA, disponibilidades 2099.

---

## 6. Prefixo e rastreio

Todo dado gerado por teste carrega **dois** marcadores independentes:

- `clinica_id = QA_AGENDA_V2_CLINICA_ID` (garantia estrutural).
- Campo textual com marcador legível:
  - `agendamentos.observacoes` → começa com `[QA-AGENDA-V2:{runId}] `
  - `pacientes.nome` → começa com `QA_`
  - `pacientes.observacoes` → `[QA-AGENDA-V2:{runId}]`

`runId` permite localizar exatamente o que uma execução criou, sem depender de timestamp.

---

## 7. Limpeza automática

Fluxo em `finally` do Playwright (roda mesmo se o teste falhar):

1. Chama `cleanupQaRun({ runId })` — server fn protegida por `assertQaUser`.
2. A fn faz, nesta ordem:
   - SELECT de verificação (item 8) e grava em `sql-verificacao.md`.
   - `DELETE FROM agendamentos WHERE clinica_id = QA AND observacoes LIKE '[QA-AGENDA-V2:{runId}]%'`.
   - `DELETE FROM pacientes WHERE clinica_id = QA AND observacoes LIKE '[QA-AGENDA-V2:{runId}]%'`.
   - Re-seed idempotente das disponibilidades 2099 (garante que slots voltam ao estado DISPONÍVEL).
   - INSERT em `audit_log` com `runId`, contagens, timestamp.
3. **Guarda-chuva** (pg_cron diário): remove qualquer resto com marcador `[QA-AGENDA-V2:` na clínica QA com mais de 24h. Cobre execuções interrompidas antes do `finally`.

---

## 8. SELECTs executados ANTES do DELETE

Para cada `runId`, antes de qualquer DELETE, roda e persiste em `sql-verificacao.md`:

```sql
-- 8.1 Todos os agendamentos criados neste run
SELECT id, paciente_id, medico_id, inicio, fim, status, observacoes
FROM agendamentos
WHERE clinica_id = :qa_clinica
  AND observacoes LIKE '[QA-AGENDA-V2:' || :run_id || ']%'
ORDER BY inicio;

-- 8.2 Todos os pacientes criados neste run
SELECT id, nome, observacoes, created_at
FROM pacientes
WHERE clinica_id = :qa_clinica
  AND observacoes LIKE '[QA-AGENDA-V2:' || :run_id || ']%';

-- 8.3 Contagem por status (para o resumo verde/vermelho)
SELECT status, COUNT(*) FROM agendamentos
WHERE clinica_id = :qa_clinica
  AND observacoes LIKE '[QA-AGENDA-V2:' || :run_id || ']%'
GROUP BY status;

-- 8.4 Sanidade: nada fora da clínica QA carrega marcador do run
SELECT COUNT(*) FROM agendamentos
WHERE observacoes LIKE '[QA-AGENDA-V2:' || :run_id || ']%'
  AND clinica_id <> :qa_clinica;
-- Precisa retornar 0. Se retornar >0, aborta cleanup e alerta.

-- 8.5 Slots que serão liberados
SELECT id, medico_id, data, hora_inicio, status
FROM medico_disponibilidades
WHERE clinica_id = :qa_clinica
  AND EXTRACT(YEAR FROM data) = 2099;
```

DELETE só roda se **8.4 = 0**. Caso contrário, aborta e alerta o usuário — sinal de vazamento de marcador para fora da clínica QA.

---

## 9. Como impedir disparos reais

Riscos identificados e mitigação:

| Canal | Como é bloqueado |
|---|---|
| WhatsApp | Clínica QA não tem linha em `whatsapp_configs`. Sem config, o disparo é no-op. Nada a mais a fazer. |
| NFS-e | Fluxo de teste não cria orçamento, não cria atendimento financeiro, não fecha caixa. `nfse_emitentes` sem linha para clínica QA. |
| Boletos/cobrança | Sem `fin_atendimentos`, sem `boletos`, sem integração de gateway configurada para clínica QA. |
| E-mail/SMS de agendamento | O usuário QA usa e-mail `qa-agenda-v2@internal.local` (domínio inválido de propósito). Paciente QA sem e-mail/telefone reais (campos vazios ou `+000000000000`). |
| Chat interno | Sem membros em `chat_canais` da clínica QA (não é criado). |
| Cron/automação | Nenhum job de produção tem regra específica para clínica QA. Se algum job varre "todas as clínicas", o marcador `__QA_` no nome + prefixo `[QA-AGENDA-V2]` no paciente é o gatilho para excluí-la em qualquer regra futura de automação. |

Regra adicional: **antes de cada execução**, a server fn `ensureQaSafety()` (parte da fase QA-2) valida que a clínica QA continua sem `whatsapp_configs`, sem `nfse_emitentes`, sem `fin_contas`. Se alguma dessas existir, aborta o teste.

---

## 10. Como desativar o usuário QA se algo der errado

Três kill switches independentes, do mais leve ao mais pesado:

1. **Env `QA_E2E_ENABLED=false`**: `assertQaUser` passa a rejeitar. Testes param, infra fica.
2. **Revogar membership**: `DELETE FROM clinica_memberships WHERE user_id = QA_AGENDA_V2_USER_ID`. Usuário perde acesso à clínica QA. RLS bloqueia tudo.
3. **Desabilitar no Auth**: via server fn admin `disableQaUser` — chama `supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: '876000h' })`. Login recusado.

Qualquer um dos três, isolado, já detém a operação.

---

## 11. Rollback completo

Migration reversa `drop_qa_agenda_v2.sql` (a ser escrita na fase QA-2, roda só com sua autorização):

```sql
-- ordem importa (FKs)
DELETE FROM agendamentos WHERE clinica_id = :qa_clinica;
DELETE FROM pacientes WHERE clinica_id = :qa_clinica;
DELETE FROM medico_disponibilidades WHERE clinica_id = :qa_clinica;
DELETE FROM medico_agendas WHERE clinica_id = :qa_clinica;
DELETE FROM medico_procedimentos WHERE medico_id IN (SELECT id FROM medicos WHERE clinica_id = :qa_clinica);
DELETE FROM medicos WHERE clinica_id = :qa_clinica;
DELETE FROM procedimentos WHERE clinica_id = :qa_clinica;
DELETE FROM especialidades WHERE clinica_id = :qa_clinica;
DELETE FROM clinica_memberships WHERE clinica_id = :qa_clinica;
DELETE FROM clinicas WHERE id = :qa_clinica;
-- Auth
SELECT auth_admin_delete_user(:qa_user_id);  -- via server fn admin
-- Secrets
-- QA_AGENDA_V2_USER_ID, QA_AGENDA_V2_CLINICA_ID, QA_AGENDA_V2_PASSWORD removidas manualmente.
```

Nada em `audit_log` é apagado — histórico preservado.

Nenhuma alteração em RLS, triggers, funções, políticas ou dados de qualquer outra clínica. Zero efeito colateral.

---

## Próximos passos

Se aprovado, seguimos para:

- **Fase QA-2**: migration de seed (clínica + médico + procedimento + disponibilidades 2099) + reversa. Só schema/seed, ainda sem usuário Auth.
- **Fase QA-3**: `ensureQaUser` (server fn admin), secrets, `assertQaUser`.
- **Fase QA-4**: `cleanupQaRun`, `disableQaUser`, `ensureQaSafety`.
- **Fase QA-5**: Playwright dos cenários S3-A/B/C + evidências.
- **Fase QA-6**: guarda-chuva pg_cron.

Cada fase pede aprovação separada. Nada roda ainda.
