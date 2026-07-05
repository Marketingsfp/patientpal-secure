
# Migração C — RPCs de conversão + NFS-e configurável

Segue estritamente a arquitetura de plataforma: toda decisão consulta `fn_regras_procedimento(procedimento_id, unidade_id)` — **zero** `if` por tipo/nome de procedimento. Status operacional, financeiro e do orçamento permanecem independentes. "Convertido" continua sendo evento (não status).

---

## 1. As 6 RPCs (todas `SECURITY INVOKER`, PT-BR, retorno `jsonb`)

| # | RPC | Papel |
|---|---|---|
| 1 | `get_orcamento_conversao(p_orcamento_id)` | Leitura: devolve por item o merge de regras + `status_operacional` + `status_financeiro` + `acoes_disponiveis` + flags (`tem_agendamento_futuro`, `tem_pagamento`, `caixa_aberto`, `regra_invalida`). Nenhuma escrita. |
| 2 | `converter_item_venda(p_item_id, p_caixa_sessao_id, p_forma_pagamento, p_desconto)` | Registra pagamento do item (cria `fin_atendimentos` + `caixa_movimentos`, seta `status_financeiro='pago'`, `pago_em=now()`). Não toca no operacional. |
| 3 | `converter_item_agendamento(p_item_id, p_payload jsonb)` | Cria `agendamentos` OU marca `status_operacional='aguardando_agendamento'` conforme a regra `agenda_obrigatoria`. Vincula 1-para-1 via `orcamento_item_id`. |
| 4 | `marcar_item_nao_aplicavel(p_item_id, p_motivo)` | Fecha o item nos dois eixos (`nao_aplicavel`/`nao_aplicavel`). Restrita a admin/gestor; motivo obrigatório. |
| 5 | `cancelar_item(p_item_id, p_motivo, p_confirmar_cascata bool)` | Cancelamento seguro com cascata + alerta de pagamento. Fluxo de 2 passos: primeira chamada retorna `requer_confirmacao`; segunda executa. |
| 6 | `emitir_nfse_orcamento(p_orcamento_id)` | Emite 1 NFS-e agrupada quando `clinicas.nfse_modo_emissao='agrupada'`, ou delega para o fluxo `por_item` existente quando `='por_item'`. |

Todas retornam `{ ok, codigo, mensagem, dados }`. Códigos de erro em `SNAKE_UPPER` (`VENDA_NAO_PERMITIDA`, `CAIXA_FECHADO`, `MEDICO_OBRIGATORIO`, `SALA_OBRIGATORIA`, `EQUIPAMENTO_OBRIGATORIO`, `AGENDAMENTO_JA_REALIZADO`, `ITEM_JA_CANCELADO`, `REGRA_INVALIDA`, `ORCAMENTO_BLOQUEADO`, `NFSE_MODO_INCOMPATIVEL`, etc.).

---

## 2. Tabelas afetadas

**Leitura:** `orcamentos`, `orcamento_itens`, `procedimentos`, `procedimento_unidade_regras`, `clinicas`, `caixa_sessoes`, `agendamentos`, `fin_atendimentos`, `nfse`, `nfse_emitentes`, `medico_agendas`, `enfermagem_recursos`.

**Escrita:** `orcamento_itens` (status duplo + timestamps), `orcamentos` (status recalculado via trigger da Migração B), `agendamentos`, `fin_atendimentos`, `caixa_movimentos`, `nfse`, `audit_log`.

**Alteração de schema nesta migração:**
- `clinicas` recebe `nfse_modo_emissao text not null default 'por_item' check (in ('por_item','agrupada'))`.
- `nfse` recebe `orcamento_id uuid null references orcamentos(id)` + índice.
- `fin_atendimentos.nfse_id` já existe — passa a poder apontar para NFS-e agrupada (N atendimentos → 1 nfse).

---

## 3. Regras consultadas em `fn_regras_procedimento`

| RPC | Chaves lidas do JSONB de regras |
|---|---|
| `get_orcamento_conversao` | todas — para calcular `acoes_disponiveis` |
| `converter_item_venda` | `permite_venda_direta` (bypass quando item já `agendado`) |
| `converter_item_agendamento` | `agenda_obrigatoria`, `medico_obrigatorio`, `sala_obrigatoria`, `equipamento_obrigatorio`, `fluxo_atendimento`, `tempo_padrao_min`, `permite_encaixe` |
| `marcar_item_nao_aplicavel` | nenhuma (validação por role) |
| `cancelar_item` | nenhuma; consulta estado do agendamento vinculado |
| `emitir_nfse_orcamento` | nenhuma (lê `clinicas.nfse_modo_emissao`) |

**Nenhum literal** de nome/tipo de procedimento aparece nas RPCs.

---

## 4. Cenários independentes (Fin ⟂ Op)

**5. Pagamento antes do agendamento**
`converter_item_venda` executa se `permite_venda_direta=true`. Grava Fin=`pago` mantendo Op no valor atual (normalmente `pendente`). O item aparece no KPI "pagos aguardando agendamento". Depois, `converter_item_agendamento` move Op sem tocar em Fin.

**6. Venda sem agenda (balcão)**
Mesmo caminho de (5). Se a regra também tiver `agenda_obrigatoria=false`, um job/trigger pode marcar Op=`nao_aplicavel` automaticamente — mas nesta migração deixamos explícito: recepção clica "Marcar sem agenda" (chama `marcar_item_nao_aplicavel` com motivo padrão "Venda balcão sem atendimento"). Nada hard-coded.

**7. Agendado sem pagamento**
`converter_item_agendamento` executa livremente com Fin=`pendente`. Item aparece em "agendados aguardando pagamento". Cobrança posterior via `converter_item_venda` (permitida pelo bypass "item já agendado"), sem re-executar validação de `permite_venda_direta`.

---

## 8/9. NFS-e configurável

**Config (`clinicas.nfse_modo_emissao`)**
- `por_item` (default): 1 NFS-e por `fin_atendimento` — comportamento atual, zero mudança.
- `agrupada`: 1 NFS-e por orçamento, com N itens de serviço.

Editável em `app.configuracoes.nfse` por admin/gestor. Menino Jesus começa em `agrupada` (setar via UI após a migração; a migração não altera dados de clínica em produção).

**Emissão (`emitir_nfse_orcamento`)**
1. Lê `clinicas.nfse_modo_emissao` da clínica do orçamento.
2. Se `por_item`: itera os `fin_atendimentos` do orçamento e chama o fluxo existente 1-a-1.
3. Se `agrupada`:
   - Valida que todos os `fin_atendimentos` do orçamento estão `pago` e sem `nfse_id`.
   - Monta 1 registro em `nfse` com `orcamento_id`, `valor_total = SUM`, `itens_json = [{descricao, valor, codigo_servico}, …]` — reusa o payload `itens[]` do cliente Focus NFS-e.
   - Atualiza `fin_atendimentos.nfse_id` de todos apontando para a mesma NFS-e.
   - Comissão, repasse, produção, estatísticas e financeiro seguem por `fin_atendimento` (nada muda).

**Compatibilidade Focus NFS-e:** o cliente atual já aceita array `servicos[]`/`itens[]` por RPS. Validação real fica no ambiente sandbox durante os testes; se a Prefeitura de destino não aceitar múltiplos serviços por RPS, a Menino Jesus permanece em `por_item` e a arquitetura continua válida (config flip, sem código).

---

## 10. Evitar conversão duplicada

- `agendamentos.orcamento_item_id` continua `UNIQUE` (Fase 3.a).
- `fin_atendimentos` ganha `orcamento_item_id` `UNIQUE` (se ainda não tiver) — 1 pagamento por item de orçamento.
- `converter_item_venda` e `converter_item_agendamento` fazem `SELECT ... FOR UPDATE` no item, checam Fin/Op antes de escrever e retornam `ITEM_JA_PAGO` / `ITEM_JA_AGENDADO` idempotentes.
- Bloqueio Fase 2 continua barrando edição em orçamento `finalizado` (Migração B estendeu isso).

---

## 11. Cancelamento com agendamento (cascata segura)

Fluxo em 2 passos dentro da mesma RPC:

1. Chamada com `p_confirmar_cascata=false`:
   - Carrega item, agendamento vinculado, fin_atendimento vinculado.
   - Se agendamento tem `status IN ('realizado','em_atendimento','concluido')` → `AGENDAMENTO_JA_REALIZADO` (bloqueia).
   - Retorna `{ requer_confirmacao: true, tem_agendamento: bool, tem_pagamento: bool }`.
2. Chamada com `p_confirmar_cascata=true`:
   - `orcamento_itens`: `status_operacional='cancelado'`, `cancelado_em=now()`, motivo.
   - `agendamentos`: `status='cancelado'` (libera horário) — só se ainda não realizado.
   - **Pagamento não é estornado**. Se Fin=`pago`, retorna `{ aviso_pagamento: true, fin_atendimento_id }` e a UI orienta abrir estorno manual.
   - Tudo gravado em `audit_log`.

Recepção pode cancelar item ainda pendente (sem agendamento e sem pagamento). Cancelamentos com vínculo exigem admin/gestor.

---

## 12. Auditoria

Toda RPC grava em `audit_log` via `log_action(entidade, entidade_id, acao, payload_antes, payload_depois, motivo)`:
- `entidade='orcamento_item'` em conversões e cancelamentos.
- `entidade='nfse'` em emissão.
- Payload inclui merge de regras usado, para rastrear "qual regra estava vigente no momento".

---

## 13. Impacto por módulo

| Módulo | Impacto | Risco |
|---|---|---|
| Agenda | Nova origem `orcamento_item_id` já suportada; cancelamento em cascata libera slot | 🟢 |
| Agenda Express | Continua criando `fin_atendimentos` diretos; se vier de orçamento, usa as novas RPCs | 🟢 |
| Caixa | `converter_item_venda` reusa `caixa_movimentos` existente; exige caixa aberto | 🟢 |
| Financeiro | Nenhuma coluna nova em `fin_atendimentos`; leitura de `status_financeiro` do item é opcional | 🟢 |
| NFS-e | Novo modo `agrupada`; modo `por_item` permanece default e imutável para outras clínicas | 🟡 validar Focus sandbox |
| Comissões / Repasse | Continuam 1-1 com `fin_atendimento` — zero mudança | 🟢 |
| Relatórios | Nada muda; novos KPIs (Migração B) são consultas adicionais | 🟢 |

---

## 14. Rollback

```sql
DROP FUNCTION IF EXISTS emitir_nfse_orcamento(uuid);
DROP FUNCTION IF EXISTS cancelar_item(uuid, text, bool);
DROP FUNCTION IF EXISTS marcar_item_nao_aplicavel(uuid, text);
DROP FUNCTION IF EXISTS converter_item_agendamento(uuid, jsonb);
DROP FUNCTION IF EXISTS converter_item_venda(uuid, uuid, text, numeric);
DROP FUNCTION IF EXISTS get_orcamento_conversao(uuid);
ALTER TABLE nfse DROP COLUMN IF EXISTS orcamento_id;
ALTER TABLE clinicas DROP COLUMN IF EXISTS nfse_modo_emissao;
-- UNIQUE em fin_atendimentos.orcamento_item_id é dropada se foi criada aqui
```
Migrations A e B permanecem. Nenhum dado real destruído (colunas novas são aditivas).

---

## 15. Testes transacionais `[TESTE-MIGRACAO-C]`

Todos rodam em `BEGIN … ROLLBACK` via `psql`, com prefixo `[TESTE-MIGRACAO-C]` em `orcamentos.observacoes`, nomes de paciente e `motivo` para cleanup garantido.

Cenários:
1. `get_orcamento_conversao` devolve status duplo + ações corretas por item.
2. Venda antecipada (regra `permite_venda_direta=true`) → Fin=`pago`, Op=`pendente`.
3. Venda antecipada bloqueada quando `permite_venda_direta=false` e sem agendamento → `VENDA_NAO_PERMITIDA`.
4. Venda pós-agenda (bypass) → aceita mesmo com `permite_venda_direta=false`.
5. Venda sem caixa aberto → `CAIXA_FECHADO`.
6. `converter_item_agendamento` com `agenda_obrigatoria=false` → cria só `aguardando_agendamento`, sem row em `agendamentos`.
7. `agenda_obrigatoria=true` + faltando `medico_id` quando `medico_obrigatorio=true` → `MEDICO_OBRIGATORIO`.
8. `equipamento_obrigatorio=true` sem `enfermagem_recurso_id` → `EQUIPAMENTO_OBRIGATORIO`.
9. `sala_obrigatoria=true` sem `sala` → `SALA_OBRIGATORIA`.
10. Override por unidade: mesmo procedimento com `agenda_obrigatoria=true` na unidade B → RPC exige agenda; unidade A segue livre.
11. Reconversão idempotente: chamar `converter_item_agendamento` 2× → segunda retorna `ITEM_JA_AGENDADO`.
12. `cancelar_item` sem confirmar → `requer_confirmacao=true` com flags.
13. `cancelar_item` confirmado → agendamento cancelado, slot liberado.
14. `cancelar_item` de agendamento já realizado → `AGENDAMENTO_JA_REALIZADO`.
15. `cancelar_item` pago → retorna `aviso_pagamento`, Fin permanece `pago`.
16. Trigger dual-status: orçamento só vira `finalizado` quando **todos** os itens têm Op e Fin resolvidos.
17. NFS-e `por_item`: 3 itens pagos → 3 rows em `nfse`.
18. NFS-e `agrupada`: 3 itens pagos → 1 row em `nfse` com `orcamento_id`, 3 `fin_atendimentos.nfse_id` iguais.
19. NFS-e `agrupada` com item não pago → `NFSE_ITENS_PENDENTES`.
20. `audit_log` com row para cada operação acima e payload contendo merge de regras.

Cleanup final:
```sql
DELETE FROM audit_log WHERE payload->>'tag' = '[TESTE-MIGRACAO-C]';
DELETE FROM nfse WHERE observacoes LIKE '%[TESTE-MIGRACAO-C]%';
DELETE FROM fin_atendimentos WHERE observacoes LIKE '%[TESTE-MIGRACAO-C]%';
DELETE FROM agendamentos WHERE observacoes LIKE '%[TESTE-MIGRACAO-C]%';
DELETE FROM orcamento_itens WHERE orcamento_id IN (SELECT id FROM orcamentos WHERE observacoes LIKE '%[TESTE-MIGRACAO-C]%');
DELETE FROM orcamentos WHERE observacoes LIKE '%[TESTE-MIGRACAO-C]%';
DELETE FROM pacientes WHERE nome LIKE '%[TESTE-MIGRACAO-C]%';
```
Contagem antes/depois de cada tabela para provar zero resíduo.

---

## Ordem de execução

1. Alterações de schema (`clinicas.nfse_modo_emissao`, `nfse.orcamento_id`, UNIQUE em `fin_atendimentos.orcamento_item_id`).
2. `get_orcamento_conversao`.
3. `converter_item_venda`, `converter_item_agendamento`, `marcar_item_nao_aplicavel`, `cancelar_item`.
4. `emitir_nfse_orcamento`.
5. GRANTs (`EXECUTE ... TO authenticated`).
6. Bateria de 20 testes + relatório antes/depois.

Aprovando, aplico a Migração C com esse escopo exato.
