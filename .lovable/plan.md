
# Fase 3 — Conversão de Orçamento

Objetivo: transformar um orçamento em **venda direta (balcão)** ou em **agendamento**, marcando `status='convertido'`, sem duplicar cobrança e sem quebrar Agenda/Caixa/Financeiro/NFS-e/Relatórios.

---

## Análise dos 4 eixos

**💰 Financeiro**
- Evita perda: bloqueio de conversão duplicada, exigência de caixa aberto para venda balcão, validação de valores > 0 e desconto ≤ subtotal (regra da Fase 1 herdada).
- Ganho: registra a venda direto no `fin_atendimentos` (já é o caminho que gera repasse, comissão e alimenta relatórios), sem o operador digitar tudo de novo.

**⏱️ Operacional**
- Recepção deixa de: abrir novo atendimento → digitar paciente → digitar procedimento → digitar valor → digitar forma de pagamento. Passa a: clicar "Registrar venda" no orçamento e confirmar.
- Estimativa: economia de ~40 s por venda balcão; ~15 s por agendamento a partir de orçamento (fluxo já existe parcialmente hoje via `/app/orcamentos-agenda`, será só reaproveitado).

**😊 Experiência do paciente**
- Menos espera na recepção; menos "pode confirmar seu nome de novo?"; recibo/NFS-e podem ser emitidos direto do atendimento criado (fluxo já existente do módulo Financeiro).

**🛡️ Segurança e Auditoria**
- Toda conversão passa por RPC/`createServerFn` (não por SQL solto no cliente) → validação server-side.
- `status='convertido'` fica protegido pelo trigger da Fase 2 (só admin/gestor edita).
- Histórico de conversão fica em `audit_log` (UPDATE do orçamento + INSERT em `fin_atendimentos`/`agendamentos`) e visível na aba Histórico.

---

## O que fazer (por tópico do usuário)

### 1. Converter orçamento em venda (balcão)
- Novo botão "Registrar venda" no card/linha do orçamento (recepção + admin/gestor).
- RPC `converter_orcamento_venda(p_orcamento_id, p_caixa_sessao_id)`:
  - checa `status IN ('aberto','aprovado')` (senão bloqueia);
  - checa `caixa_sessao_id` pertence à clínica, ao usuário, e está `status='aberta'`;
  - insere 1 registro em `fin_atendimentos` por item do orçamento (ou 1 consolidado, ver decisão abaixo);
  - insere movimento em `caixa_movimentos` (mesma forma que uma venda comum já faz);
  - atualiza `orcamentos.status='convertido'` na mesma transação;
  - retorna `atendimento_ids[]` para o cliente decidir se abre a tela de recibo/NFS-e.
- Decisão a confirmar: **1 atendimento por item** (o padrão do módulo, permite comissões diferentes por procedimento) **ou 1 atendimento consolidado**. Proposta: 1 por item (alinhado ao Financeiro; a UX no orçamento já mostra o item, e é assim que Comissões/Repasse esperam).

### 2. Converter orçamento em agendamento
- Já existe fluxo via `/app/orcamentos-agenda` + `agendamento_orcamento_itens`. Vou apenas reaproveitar e:
  - marcar `orcamentos.status='convertido'` **somente quando todos os itens tiverem sido agendados** (evitar marcar convertido em conversão parcial — hoje o "usados/total" no card já monitora isso).
  - Alternativa: manter `status='aberto'` até o último item ser agendado, então trigger `AFTER INSERT` em `agendamento_orcamento_itens` fecha o orçamento.
- Nada muda no fluxo do lado da Agenda; só adiciona o gatilho de fechamento.

### 3. Exigir caixa aberto para venda
- Antes de mostrar o botão "Registrar venda", front consulta hook `useCaixaAtivo(clinicaId, userId)` (já existente ou a criar) que busca `caixa_sessoes WHERE status='aberta' AND user_id=auth.uid()`.
- Sem sessão → botão desabilitado com tooltip "Abra o caixa em Financeiro → Caixa antes de registrar vendas".
- Redundância server-side na RPC (validação dupla — nunca confiar só no front).

### 4. Marcar status como CONVERTIDO
- Somente pela RPC (venda) ou pela trigger de fechamento (agendamento total). Nunca por UPDATE direto.
- Trigger de bloqueio da Fase 2 já protege alteração posterior.

### 5. Impedir conversão duplicada
- Na RPC: `SELECT ... FOR UPDATE` do orçamento + `RAISE EXCEPTION` se `status='convertido'` ou se já existe `fin_atendimentos` vinculado.
- Nova coluna opcional `fin_atendimentos.orcamento_item_id uuid REFERENCES orcamento_itens(id)` com `UNIQUE` para garantir 1:1 por item.

### 6. Preservar histórico
- Nada extra: a Fase 2 já grava tudo. A RPC roda como o usuário logado, então `audit_log` recebe UPDATE do orçamento (dados_antes com status aberto, dados_depois com convertido) e INSERT de cada atendimento.
- Aba "Histórico" (Admin/Gestor) mostra a conversão como um evento normal.

### 7. Tratar orçamento vencido
- `vencido = created_at + validade_dias*'1 day' < now()`.
- Comportamento: **permitido converter, mas exige confirmação**: modal "Este orçamento está vencido há X dias. Deseja atualizar valores e converter?" com opção "Reajustar preços agora" ou "Manter valores originais". Não bloquear — bloquear perde venda.

### 8. Tratar orçamento com cadastro incompleto
- Se `paciente_id IS NULL` (paciente digitado só como texto): antes de converter, obriga vinculação a paciente real (abre `PatientSearchInput` + "Criar novo paciente"). Sem paciente real, `fin_atendimentos.paciente_id` fica NULL, o que quebra relatórios por paciente e emissão de NFS-e.
- Se `medico_id IS NULL`: aceita apenas para venda balcão de itens que não exigem médico (ex.: laboratório sem médico solicitante já é permitido). Para agendamento, exige médico.

### 9. Valores, descontos e formas de pagamento
- Snapshot: a RPC copia `valor_total`, `desconto`, `forma_pagamento`, `valores_pagamento` do orçamento para o atendimento e para o movimento de caixa **no momento da conversão**. Alterações posteriores no orçamento (bloqueadas para não-admin pela Fase 2) não retro-afetam a venda.
- Se houver múltiplas formas: gera 1 `caixa_movimentos` por forma (mesma regra já usada em vendas normais).
- Recalcula `valor_medico`/`valor_clinica` via `procedimento_split_regras` no momento da conversão (mesma função que o módulo Financeiro já usa; **não** copia split "congelado" do orçamento, que não existe).

### 10. Impacto por módulo

| Módulo | Impacto | Risco |
|---|---|---|
| **Agenda** | Nenhum quebra; trigger nova em `agendamento_orcamento_itens` só marca orçamento como convertido quando 100% dos itens forem agendados | 🟢 Baixo |
| **Caixa** | Passa a receber movimentos originados de conversão; mesmo formato dos movimentos manuais | 🟢 Baixo |
| **Financeiro** | Recebe novos `fin_atendimentos` — mesmos campos que o fluxo manual, nada muda para relatórios/repasse/comissão | 🟢 Baixo |
| **NFS-e** | Nenhum acoplamento novo — segue emitindo a partir de `fin_atendimentos`, como já faz | 🟢 Baixo |
| **Relatórios / BI** | Ganha volume (venda balcão que hoje não é registrada) → gráficos podem subir; comunicar antes | 🟡 Médio (métrica, não bug) |
| **Orçamentos** | Trigger nova de fechamento automático + coluna `fin_atendimentos.orcamento_item_id` | 🟢 Baixo |

---

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Conversão duplicada por double-click | `SELECT ... FOR UPDATE` + UNIQUE em `fin_atendimentos.orcamento_item_id` |
| Perda financeira: converter sem caixa aberto | Validação dupla (front + RPC) |
| Venda balcão sem paciente cadastrado quebra NFS-e | Obriga vinculação antes de converter |
| Orçamento vencido convertido com preço defasado | Modal de confirmação + opção de reajustar |
| `atualizado_por` da Fase 2 gravado como `auth.uid()` da RPC parece "conversão automática" | RPC SECURITY INVOKER (roda como usuário real); auditoria mostra o operador correto |
| Alteração de fluxo pode quebrar Financeiro | Não altera nenhum código do módulo Financeiro — apenas insere nas tabelas dele com o mesmo shape do fluxo manual |

---

## Testes (mesmo padrão da Fase 2)

Bloco `DO` transacional com dados prefixados `[TESTE-FASE3]` e cleanup no final. Comparação de contagens antes/depois — falha ⇒ rollback.

1. Criar orçamento de teste + item.
2. Tentar converter sem caixa aberto → deve bloquear.
3. Abrir sessão de caixa de teste.
4. Converter → verificar: `orcamentos.status='convertido'`, `fin_atendimentos` novo, `caixa_movimentos` novo, `audit_log` com UPDATE.
5. Tentar converter de novo o mesmo orçamento → deve bloquear (status + UNIQUE).
6. Criar 2º orçamento de teste, converter em agendamento (via fluxo existente).
7. Verificar trigger de fechamento: só marca convertido quando último item é agendado.
8. Testar orçamento vencido: RPC aceita, retorna aviso.
9. Testar orçamento sem `paciente_id`: RPC rejeita com mensagem clara.
10. Cleanup: deleta `fin_atendimentos`, `caixa_movimentos`, `caixa_sessoes`, `agendamento_orcamento_itens`, `agendamentos`, `orcamentos` e `audit_log` de teste; compara contagens.

**Nenhum orçamento real, atendimento real ou movimento de caixa real será tocado** — todos os inserts são prefixados/tageados e o cleanup é validado por contagem antes de commitar.

---

## Rollback

Migration única e reversível:

```sql
-- Rollback
DROP FUNCTION IF EXISTS public.converter_orcamento_venda(uuid, uuid);
DROP TRIGGER IF EXISTS trg_orcamento_fechamento_por_agendamento ON public.agendamento_orcamento_itens;
DROP FUNCTION IF EXISTS public.fn_orcamento_fechamento_por_agendamento();
ALTER TABLE public.fin_atendimentos DROP COLUMN IF EXISTS orcamento_item_id;
```

Front-end: rollback via revert do commit (botões novos + hooks; sem mudança em código existente).

---

## Detalhes técnicos (referência)

- **Migration:**
  - `ALTER TABLE fin_atendimentos ADD COLUMN orcamento_item_id uuid REFERENCES orcamento_itens(id) ON DELETE SET NULL`
  - `CREATE UNIQUE INDEX ... ON fin_atendimentos(orcamento_item_id) WHERE orcamento_item_id IS NOT NULL`
  - `CREATE FUNCTION converter_orcamento_venda(p_orcamento_id uuid, p_caixa_sessao_id uuid) RETURNS TABLE(atendimento_id uuid) SECURITY INVOKER`
  - `CREATE FUNCTION fn_orcamento_fechamento_por_agendamento() + trigger AFTER INSERT em agendamento_orcamento_itens`
- **Server function:** `src/lib/orcamento-conversao.functions.ts` com `createServerFn` chamando a RPC via `requireSupabaseAuth` (respeita RLS do usuário).
- **UI:**
  - Botão "Registrar venda" na linha do orçamento (Recepção+); desabilitado sem caixa aberto.
  - Modal com resumo: paciente, itens, forma de pagamento, valor final, sessão de caixa que receberá.
  - Após sucesso: toast + navegação opcional para `/app/financeiro/atendimentos?ids=...`.
- **Hook:** `useCaixaAtivo` já é reaproveitado (verificar; senão, criar em `src/hooks/`).
- **Sem mudança** em: `app.caixa.tsx`, `app.financeiro.*`, `app.agenda.express.tsx`, NFS-e, comissões, splits.

---

## Decisões que preciso confirmar antes de codar

1. **1 `fin_atendimentos` por item do orçamento** (proposto) ou 1 consolidado? Proposta: 1 por item (alinhado a Financeiro/Comissões).
2. **Orçamento vencido:** permitir conversão com confirmação (proposto) ou bloquear?
3. **Conversão parcial em agendamento:** marcar convertido só quando 100% dos itens estiverem agendados (proposto)?

Aprovando estas 3 decisões + o plano, abro a migration e sigo o mesmo protocolo da Fase 2 (mostrar SQL → aprovação → teste transacional → relatório antes/depois).
