# S3-C — Reagendar (plano técnico)

## 1. Assinatura da server function

Arquivo **novo**: `src/lib/agenda/reagendar-agendamento.functions.ts`
(caminho client-safe — mesmo padrão de `status-agendamento.functions.ts`).

```ts
export type ReagendarAgendamentoInput = {
  clinica_id: string;
  agendamento_id: string;          // id da sessão a mover — PRESERVADO
  novo_inicio: string;             // ISO
  novo_fim: string;                // ISO
  novo_medico_id?: string | null;  // opcional; null/undefined = manter médico
};

export type ReagendarAgendamentoResult =
  | { ok: true; id: string }                                     // sempre o mesmo id de entrada
  | { ok: false; validation_error: { message: string; toast_duration?: number } }
  | { ok: false; pg_error: { message: string; details?: string|null; hint?: string|null; code?: string|null } };

export const reagendarAgendamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: ReagendarAgendamentoInput) => d)
  .handler(async ({ data, context }): Promise<ReagendarAgendamentoResult> => { ... });
```

**Invariantes obrigatórios do handler:**
- Nunca altera `paciente_id`, `paciente_nome`, `pacote_id`, `orcamento_id`, `procedimento`, `enfermagem_recurso_id`, `status`, `data_pagamento`, `observacoes` de origem, `fluxo_etapa`, `fluxo_atualizado_em`.
- Só altera `inicio`, `fim` e (se informado) `medico_id` do agendamento identificado por `agendamento_id`.
- **Não move irmãos do pacote.** Recebe 1 id, muda 1 linha. Cascata de pacote fica fora do escopo (é UPDATE atômico, único id).
- Guard de status: recusa se `status ∈ {realizado, cancelado, faltou}` — mesma trava do reagendar clássico (`app.agenda.tsx:820`).
- Guard de mesmo id + mesmo horário: se `novo_inicio == inicio` e `novo_medico_id ∈ {null, medico_id_atual}`, retorna `validation_error` "Esse já é o horário atual" (paridade com clássica linha 831).
- Não usa `supabaseAdmin`. Roda como usuário autenticado; RLS já cobre `agendamentos` (4 policies).

## 2. Regras reaproveitadas (espelhadas, NÃO importadas)

Como `criarAgendamento` está congelado, **duplico** aqui exatamente 3 validações lidas de `src/lib/agenda/criar-agendamento.functions.ts` (linhas 134–172, cópia literal, sem alteração de regra):

| # | Regra | Fonte |
|---|-------|-------|
| A | Se `novo_medico_id` informado → precisa existir slot desse médico no dia (`select` linhas 139–146). Mensagem "Este médico não tem agenda aberta nessa data. Gere os horários em Disponibilidades…" | criar-agendamento.functions.ts:149–155 |
| B | Precisa existir slot `DISPONÍVEL` do médico-destino cobrindo `[novo_inicio, novo_fim]` — mesmo predicado `isSlotLivre` + `sIni ≤ inicioMs && sFim ≥ fimMs` | criar-agendamento.functions.ts:157–172 |
| C | Excluir o próprio `agendamento_id` do conjunto avaliado (equivalente ao `excludingEditing` linha 148) — o próprio slot de origem, se médico for o mesmo, aparece como ocupado e deve ser ignorado | criar-agendamento.functions.ts:148 |

**Não reaproveito** (fora do escopo do reagendar):
- Validação de paciente completo (telefone/nascimento) — paciente já foi validado no agendamento original.
- Inadimplência de cartão benefícios — não estamos criando obrigação financeira nova.
- Vínculos com `agendamento_orcamento_itens` — já existem e são preservados.

## 3. Estratégia de UPDATE preservando o id

Modelo do banco: em Agenda clássica, `agendamentos` funciona como grade de slots pré-gerados (paciente_nome="DISPONÍVEL") que viram consulta ao serem ocupados. O reagendar clássico **troca o id** (libera origem, ocupa slot destino, migra `fin_lancamentos`).

A regra do usuário exige **manter o mesmo `agendamento.id`**. Estratégia:

```text
Passo 1  SELECT slot destino DISPONÍVEL cobrindo [novo_inicio, novo_fim] do médico-destino  → dest_slot
Passo 2  SELECT origem (por id)                                                             → origem
Passo 3  UPDATE dest_slot: paciente_nome='DISPONÍVEL_REAGENDADO_TMP', inicio=origem.inicio,
         fim=origem.fim, medico_id=origem.medico_id     ← "recicla" o slot destino para
         cobrir o buraco que a origem vai deixar. Mantém a grade íntegra.
Passo 4  UPDATE origem: inicio=novo_inicio, fim=novo_fim, medico_id=novo_medico_id (se dado),
         observacoes = observacoes || '\n[Reagendado …]'  ← trilha idêntica à clássica (:838)
Passo 5  UPDATE dest_slot novamente: paciente_nome='DISPONÍVEL' (limpa o TMP)
```

Resultado: `origem.id` inalterado; grade de slots do dia continua consistente (o slot destino "muda de lugar" para o horário antigo da origem, virando o novo DISPONÍVEL naquele horário). **Nenhum id de referência externa quebra** (`pagamentos`, `agendamento_orcamento_itens`, `prontuarios`, `pacote_id`, `orcamento_id`).

Erros em qualquer passo → early return com `pg_error`. Sem transação explícita porque Supabase JS não expõe BEGIN/COMMIT; o TMP marker (Passo 3) só existe entre os UPDATEs sequenciais dentro da mesma requisição — se Passo 4 falhar, Passo 5 executa mesmo assim num `try/finally` para limpar o TMP.

## 4. Arquivos alterados

| Arquivo | Δ | O quê |
|---|---|---|
| `src/lib/agenda/reagendar-agendamento.functions.ts` | **novo** | server fn dedicada acima |
| `src/components/agenda-v2/reagendar-modal.tsx` | **novo** | modal compacto: data (input date), hora (select 07:00–20:00 step 30min), médico (SearchableSelect opcional, default = atual). Sem passos, sem paciente/serviço. Botão "Confirmar reagendamento" chama `reagendarAgendamento` via `useServerFn` |
| `src/components/agenda-v2/agenda-v2-shell.tsx` | edit | novo state `reagendarSessao`, wiring do modal, invalidate `["agenda-v2","ags"]` on success |
| `src/components/agenda-v2/session-card.tsx` | edit | QuickAction "Reagendar" já existe no hover (S3-A stub) — conectar `onReagendar` prop ao handler do shell |
| `src/components/agenda-v2/patient-drawer.tsx` | edit | QuickAction "Reagendar" já existe — mesma conexão |

**Zero migration. Zero alteração em `criarAgendamento.functions.ts`. Zero alteração em `app.agenda.tsx`.**

## 5. Rollback

```bash
rm src/lib/agenda/reagendar-agendamento.functions.ts \
   src/components/agenda-v2/reagendar-modal.tsx
git checkout src/components/agenda-v2/agenda-v2-shell.tsx \
             src/components/agenda-v2/session-card.tsx \
             src/components/agenda-v2/patient-drawer.tsx
```

Sem migration, sem alteração de schema, sem função de servidor removida (só duas novas). Comportamento pré-S3-C restaurado imediatamente.

## 6. Testes Playwright (obrigatórios antes de fechar S3-C)

Script único em `/tmp/browser/s3c-reagendar/` executando 3 cenários:

1. **Reagendar mesmo médico, novo horário** — abre `/app/agenda-v2`, liga flag, abre card → "Reagendar" → escolhe novo horário livre → confirma → verifica: mesma linha do card no novo horário, mesmo paciente, mesmo procedimento, KPIs recalculam sozinhos, zero erro de console.
2. **Reagendar com troca de médico** — mesmo fluxo mas escolhe outro médico com slot livre. Screenshot antes/depois.
3. **Sessão em pacote** — abrir card cujo `pacote_id` tem irmãos, reagendar. Verifica no drawer que os IRMÃOS permanecem no horário original (não foram movidos).
4. **Regressão**: abrir `/app/agenda` clássica, criar 1 agendamento novo (fluxo antigo), mudar status. Prova que a rota clássica ficou intacta.

## 7. SELECTs de verificação (rodar via supabase--read_query após cada cenário)

```sql
-- Cenário 1: id preservado, horário mudou, resto intacto
select id, paciente_id, paciente_nome, medico_id, inicio, fim,
       pacote_id, orcamento_id, procedimento, status, observacoes
from agendamentos
where id = '<AG_ID>';

-- Cenário 3: irmãos do pacote permanecem no horário original
select id, inicio, fim, medico_id
from agendamentos
where pacote_id = '<PACOTE_ID>'
order by inicio;

-- Slot antigo virou DISPONÍVEL corretamente
select id, paciente_nome, inicio, fim, medico_id
from agendamentos
where clinica_id = '<CLINICA_ID>'
  and inicio = '<HORARIO_ANTIGO>'
  and medico_id = '<MEDICO_ANTIGO_ID>';

-- Zero linhas com marker TMP residual (caso Passo 5 do handler falhe)
select id from agendamentos where paciente_nome = 'DISPONÍVEL_REAGENDADO_TMP';

-- Vínculos financeiros e de orçamento continuam ligados ao MESMO id
select id, agendamento_id, valor from fin_lancamentos where agendamento_id = '<AG_ID>';
select agendamento_id, orcamento_item_id from agendamento_orcamento_itens where agendamento_id = '<AG_ID>';

-- audit_log capturou o UPDATE (trigger fn_audit_trigger já cobre agendamentos)
select operation, changed_at, changed_by from audit_log
where table_name = 'agendamentos' and record_id = '<AG_ID>'
order by changed_at desc limit 5;
```

## 8. Invariantes reafirmados

- ✅ `criarAgendamento` intocado (diff = vazio).
- ✅ `src/routes/_authenticated/app.agenda.tsx` intocado.
- ✅ Zero migration.
- ✅ Zero alteração de regra de negócio (as 3 regras copiadas são literais).
- ✅ `agenda_v2` OFF por padrão.
- ✅ Só move ESTA sessão (função recebe 1 id, muda 1 linha).
- ✅ Paciente, pacote_id, orçamento, histórico, fluxo, pagamentos preservados.
- ✅ `agendamento.id` estável.

**Nada será codado sem sua aprovação deste plano.**
