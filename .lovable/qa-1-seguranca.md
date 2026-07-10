# QA-1 — Documento complementar de segurança

Complementa `.lovable/plan.md`. Responde objetivamente aos 6 pontos exigidos antes da aprovação da QA-2. Nenhuma implementação.

---

## 1. Como impedir que o usuário QA altere dados operacionais reais

Barreiras independentes (defesa em profundidade — cada uma sozinha já bloqueia):

1. **Membership única**: `clinica_memberships` do usuário QA existe **apenas** para a clínica `__QA_AGENDA_V2__`. Nenhuma linha para clínicas reais.
2. **RLS existente**: toda tabela operacional já filtra por `clinica_id ∈ memberships do auth.uid()`. Sem membership → PostgREST devolve 0 linhas em SELECT e recusa INSERT/UPDATE/DELETE. Regra do Postgres, não do front.
3. **Sem role admin**: o usuário QA nunca recebe `user_roles.role = 'admin'`. Funções `has_role(auth.uid(), 'admin')` retornam false. Bypass administrativo indisponível.
4. **Sem service role no fluxo de teste**: Playwright faz login normal (email/senha), usa `supabase` publishable + bearer. `supabaseAdmin` só é usado no bootstrap (`ensureQaUser`), protegido por `has_role('admin')` do chamador — QA nunca chama.
5. **Guarda extra em fns destrutivas de QA** (`assertQaUser`): compara `context.userId === QA_AGENDA_V2_USER_ID`. Se qualquer outro usuário acionar, `throw` antes de qualquer SQL.
6. **Filtro duplo em DELETE**: `WHERE clinica_id = :qa_clinica AND observacoes LIKE '[QA-AGENDA-V2:%'`. Nunca só por marcador, nunca só por clínica.

**Teste de sanidade** (rodado antes de todo cleanup — item 8.4 do plano): `SELECT COUNT(*) FROM agendamentos WHERE observacoes LIKE '[QA-AGENDA-V2:{runId}]%' AND clinica_id <> :qa_clinica` — precisa ser 0, senão aborta.

---

## 2. Como impedir envios reais (WhatsApp, e-mail, NFS-e, cobranças, integrações)

Bloqueio estrutural: **a clínica QA não tem as configurações que disparam nada**. Sem config, o disparo é no-op — não é uma flag que pode ser esquecida.

| Canal | Barreira estrutural | Barreira ativa |
|---|---|---|
| WhatsApp (envio) | Zero linhas em `whatsapp_configs` para clínica QA. `sendWhatsapp()` retorna no-op quando não há config. | `ensureQaSafety()` (fn de pré-teste) valida `COUNT(*)=0` e aborta se aparecer. |
| WhatsApp (webhook entrada) | Rota `/api/public/whatsapp/:clinicaId` só entrega se `clinicaId` casar com config existente. Sem config → 404. | Idem. |
| E-mail transacional | Paciente QA criado com `email = NULL` e `telefone = NULL`. Templates que dependem de e-mail pulam envio. | Verificação no seed: `pacientes.email IS NULL AND telefone IS NULL` para todo `nome LIKE 'QA_%'`. |
| SMS | Sem gateway configurado para clínica QA em `integration_secrets`. | `ensureQaSafety()` valida. |
| NFS-e | Zero linhas em `nfse_emitentes`. Fluxo de teste **não cria** `fin_atendimentos` nem fecha caixa — pré-requisitos ausentes. | `ensureQaSafety()` valida `nfse_emitentes` vazio + garantia de que Playwright não navega em `/app/nfse` nem `/app/caixa`. |
| Boletos | Sem `fin_contas`, sem gateway. `boletos.insert` exigiria `fin_atendimento_id` que não existe. | `ensureQaSafety()` valida `fin_contas` vazio. |
| Split / repasse | Sem `regras_rateio` para clínica QA. | Idem. |
| Notificação in-app / chat interno | Nenhum canal em `chat_canais` para clínica QA. | Idem. |
| Cron / automações | Se algum job de produção varrer "todas as clínicas", o nome `__QA_AGENDA_V2__` e prefixo `[QA-AGENDA-V2]` são gatilhos padronizados para exclusão em qualquer regra futura. | Regra permanente: novo job automatizado deve declarar exclusão explícita de `clinica_id IN (qa)` em revisão de código. |

**Regra transversal**: nenhuma migration/feature futura pode inserir `whatsapp_configs`, `nfse_emitentes`, `fin_contas`, `integration_secrets` ou `regras_rateio` para a clínica QA — `ensureQaSafety()` roda **antes** de cada teste e aborta se qualquer uma existir.

---

## 3. Como garantir que toda criação de dados seja rastreável

Todo dado gerado por teste carrega **três** marcadores independentes (basta um sobreviver para identificar):

1. **Estrutural**: `clinica_id = QA_AGENDA_V2_CLINICA_ID`. Garantido pela RLS — usuário QA não consegue inserir com outro `clinica_id`.
2. **Textual em observações**: prefixo `[QA-AGENDA-V2:{runId}] ` em `agendamentos.observacoes` e `pacientes.observacoes`. `runId` é UUID por execução, gerado no início do Playwright, gravado em `evidencias/{runId}/run.json`.
3. **Textual em nome**: `pacientes.nome` começa com `QA_`. Sobrevive mesmo se `observacoes` for editada.

**Verificação**:

```sql
-- Antes de cada cleanup, gera e persiste em sql-verificacao.md:
SELECT id, paciente_id, medico_id, inicio, fim, status, observacoes
FROM agendamentos
WHERE clinica_id = :qa_clinica
  AND observacoes LIKE '[QA-AGENDA-V2:' || :run_id || ']%';
```

**Auditoria permanente**: cada `cleanupQaRun` insere em `audit_log` com `runId`, contagens removidas, timestamp, `userId`. Histórico de execuções não é apagado.

---

## 4. Como garantir limpeza completa sem risco para dados reais

Ordem obrigatória de `cleanupQaRun({ runId })`:

1. **SELECT de inventário** (item 8.1 do plano) — grava em `sql-verificacao.md`.
2. **SELECT de sanidade** (item 8.4): `COUNT(*) FROM agendamentos WHERE observacoes LIKE '[QA-AGENDA-V2:{runId}]%' AND clinica_id <> :qa_clinica`. Se `> 0`, **aborta cleanup**, grava alerta, notifica.
3. **DELETE agendamentos**: `WHERE clinica_id = :qa_clinica AND observacoes LIKE '[QA-AGENDA-V2:{runId}]%'`.
4. **DELETE pacientes**: `WHERE clinica_id = :qa_clinica AND observacoes LIKE '[QA-AGENDA-V2:{runId}]%'`.
5. **Re-seed idempotente** das disponibilidades 2099 (garante slots DISPONÍVEL).
6. **INSERT audit_log** com contagens.

**Restrições absolutas**:

- `DELETE` nunca roda sem os **dois** filtros (clínica + marcador).
- `DELETE` nunca por timestamp, nunca por `created_by`, nunca por range.
- Constante `:qa_clinica` lida de env `QA_AGENDA_V2_CLINICA_ID`, nunca hardcoded, nunca vinda do request.
- Ano das disponibilidades = 2099 (sintético) — nenhum re-seed toca datas reais.
- `cleanupQaRun` protegida por `assertQaUser` — nenhum outro usuário aciona.

**Guarda-chuva** (pg_cron diário): remove marcadores `[QA-AGENDA-V2:` na clínica QA com mais de 24h. Cobre execuções interrompidas antes do `finally`. Mesmos dois filtros.

**O que nunca é deletado**: `audit_log`, `clinicas` (a QA permanece), seed (médico/procedimento/especialidade), o próprio usuário QA.

---

## 5. Como desativar imediatamente o usuário QA em caso de incidente

Três kill switches independentes, do mais leve ao mais pesado. Cada um sozinho já detém a operação:

| # | Ação | Efeito | Tempo |
|---|---|---|---|
| 1 | Setar secret `QA_E2E_ENABLED=false` | `assertQaUser` passa a rejeitar toda fn destrutiva. Testes param. Login continua, dados intactos. | segundos |
| 2 | `DELETE FROM clinica_memberships WHERE user_id = :qa_user` | Usuário perde acesso à clínica QA. RLS bloqueia SELECT/INSERT/UPDATE/DELETE em toda tabela operacional. | segundos |
| 3 | Banir no Auth via `disableQaUser` (server fn admin) → `supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: '876000h' })` | Login recusado. Sessões vigentes expiram no próximo refresh. | 1 min |

**Playbook de incidente**:

1. Executar #1 imediatamente (mais rápido, reversível).
2. Se persistir dúvida, #2.
3. Se comprometimento suspeito, #3.
4. Investigar via `audit_log` filtrando `user_id = :qa_user`.

**Reversão**: `QA_E2E_ENABLED=true` + reinserir membership + `ban_duration: 'none'`. Nada é destrutivo.

---

## 6. Como impedir que o usuário QA acesse módulos fora da Agenda V2

Três camadas:

1. **RLS estrutural** (já existente): módulos que dependem de outras tabelas (financeiro, NFS-e, RH, LMS, marketing, chat) filtram por `clinica_id`. Como o usuário QA só tem membership na clínica QA — e a clínica QA não tem linhas em `fin_*`, `nfse_*`, `hr_*`, `lms_*`, `mkt_*`, `whatsapp_*`, `atend_*`, `caixa_*`, `boletos`, `contratos_assinatura` — todos esses módulos aparecem **vazios**. O usuário pode navegar; não há o que ver, criar ou alterar.
2. **Perfil de permissões restrito** (preset custom): criar perfil `qa_agenda_v2` em `perfis_acesso` com acesso `write` **apenas** em `agenda` e `perfil-proprio`. Todos os demais módulos = `none`. Aplicado via `perfil_permissoes`. `usePermissoes` esconde os itens do menu.
3. **Fluxo do Playwright restrito**: o script navega **apenas** para `/app/agenda-v2`. Não visita `/app/caixa`, `/app/financeiro`, `/app/nfse`, `/app/boletos`, `/app/orcamentos`, `/app/chat`. Rotas fora do escopo, mesmo que tecnicamente acessíveis, não são exercidas.

**Verificação**: `ensureQaSafety()` valida antes de cada execução:

```sql
-- Preset de permissões do QA está intacto
SELECT modulo, acesso FROM perfil_permissoes pp
JOIN perfis_acesso pa ON pa.id = pp.perfil_id
WHERE pa.chave = 'qa_agenda_v2' AND pp.acesso != 'none';
-- Precisa retornar exatamente: agenda=write, perfil-proprio=write. Qualquer outro → aborta.
```

---

## Matriz consolidada

| Risco | Barreira primária | Barreira redundante | Detecção |
|---|---|---|---|
| Alteração de dado real | RLS por membership | `assertQaUser` + filtro duplo | Sanidade 8.4 + audit_log |
| WhatsApp/E-mail/SMS reais | Sem config na clínica QA | `ensureQaSafety` pré-teste | audit_log de disparos |
| NFS-e / boleto / cobrança | Sem emitente, sem `fin_*` | Playwright não navega nesses módulos | Contagem em `nfse`/`boletos` para clínica QA = 0 |
| Rastro perdido | `clinica_id` + `observacoes[runId]` + `nome QA_` | 3 marcadores redundantes | SELECT 8.1 por `runId` |
| DELETE varrer real | Filtro duplo obrigatório | `assertQaUser` | Sanidade 8.4 aborta antes |
| Acesso a outros módulos | RLS (dados vazios) | Preset `qa_agenda_v2` | `ensureQaSafety` valida preset |
| Comprometimento do usuário | Kill switch env | Revogar membership | Banir no Auth |

---

## Aguardando

Aprovação explícita para iniciar **QA-2** (migration de seed + reversa). Nenhum código será escrito até "aprovado, pode implementar QA-2".