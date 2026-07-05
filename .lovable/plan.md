
# Fase 3.b (revisada) — Regras de procedimento + status duplo + cascata + NFS-e configurável

Escopo ampliado a partir das respostas. Tudo continua sem tocar em dados reais nos testes. Aproveito a estrutura já criada na Fase 3.a — as colunas `tipo_destino`, `requer_medico`, `requer_sala`, `tipo_recurso` viram parte do conjunto maior de regras e ganham override por unidade.

---

## 1. Regras do Procedimento (config-first, sem código)

### 1.1 Novas colunas em `procedimentos` (defaults nas atuais)
```
tipo_procedimento  text  -- consulta|exame|laboratorio|procedimento|cirurgia|equipamento|vacina|telemedicina
fluxo_atendimento  text  -- consulta_medica|exame_agendado|lab_ordem_chegada|lab_agendado
                         --   |procedimento_ambulatorial|equipamento|domiciliar|telemedicina
agenda_obrigatoria       bool default true
medico_obrigatorio       bool default false
sala_obrigatoria         bool default false
equipamento_obrigatorio  bool default false
permite_encaixe          bool default true
permite_venda_direta     bool default false
permite_orcamento        bool default true
exige_autorizacao        bool default false
exige_preparo            bool default false
exige_termo              bool default false
tempo_padrao_min         int  default 30
cor_agenda               text
-- categoria/grupo já existem
```
`tipo_destino` fica como coluna derivada (view/coluna gerada) a partir de `fluxo_atendimento` para não quebrar o que a Fase 3.a criou. Migração faz backfill: `consulta_medica→consulta`, `exame_agendado/equipamento→exame_equipamento`, `lab_*→laboratorio`, `procedimento_ambulatorial→procedimento_medico`.

### 1.2 Override por unidade — `procedimento_unidade_regras`
Nova tabela (por unidade/clínica). Mesmas colunas de regra acima, todas nullable — quando NULL herda do procedimento.
```
id, procedimento_id, unidade_id,
tipo_procedimento?, fluxo_atendimento?, agenda_obrigatoria?, ...
UNIQUE (procedimento_id, unidade_id)
```
Nova função `fn_regras_procedimento(p_procedimento_id, p_unidade_id) returns jsonb` faz o merge (override > base) e é o **único** lugar que a UI e as RPCs consultam para decidir o fluxo.

GRANTs padrão + RLS: SELECT para authenticated (por clínica); INSERT/UPDATE/DELETE só admin/gestor.

### 1.3 Aba "Regras" no cadastro de procedimento
Em `app.procedimentos`: nova aba/dialog "Regras" com todos os toggles. Aba "Overrides por unidade" lista clínicas e permite editar override específico.

Alerta em `app.orcamentos` continua: procedimentos com `fluxo_atendimento IS NULL` (ou incompatíveis) travam a conversão daquele item, com link para classificar.

---

## 2. Status duplo no item do orçamento

`orcamento_itens.status_item` (Fase 3.a) é **repurposado** como status operacional. Adiciono status financeiro separado:

```
status_operacional text  -- pendente|aguardando_agendamento|agendado|em_atendimento|concluido|cancelado|nao_aplicavel
status_financeiro  text  -- pendente|pago|estornado|isento|nao_aplicavel
```

Migration renomeia `status_item → status_operacional` (com view compat para telas que ainda leem `status_item`) e cria `status_financeiro` default `pendente`. Colunas `fin_atendimento_id` e `agendamento_id` continuam sendo as fontes-de-verdade dos vínculos.

Trigger `fn_orcamento_recalcula_status` (Fase 3.a) passa a olhar **ambos**:
- `convertido` só quando **todos** os itens têm `status_operacional IN (agendado, em_atendimento, concluido, nao_aplicavel, cancelado)` **e** `status_financeiro IN (pago, isento, nao_aplicavel)` (ou item cancelado, que ignora financeiro);
- `parcialmente_agendado` quando parte dos itens tem operacional/financeiro resolvido;
- `aberto` caso contrário.

Sem duplicação: nada muda em `fin_atendimentos` (fonte financeira) nem em `agendamentos` (fonte operacional). Vínculo é 1-para-1 no item.

---

## 3. RPCs (revisadas)

Todas SECURITY INVOKER, PT-BR, retorno JSON. Todas consultam `fn_regras_procedimento(procedimento_id, unidade_id)` no início — nenhuma lógica de "consulta/MAPA/US" hard-coded.

### 3.1 `converter_item_venda(p_item_id, p_caixa_sessao_id, p_forma_pagamento, p_desconto)`
- Regra do procedimento deve ter `permite_venda_direta=true` **OU** o item já ter `status_operacional='agendado'` (venda pós-agenda).
- Exige caixa aberto da mesma clínica/usuário.
- Grava `status_financeiro='pago'`, cria `fin_atendimentos` + `caixa_movimentos`.
- Não muda `status_operacional` (pagar não atende).
- Erro `VENDA_NAO_PERMITIDA` se regra proíbe.

### 3.2 `converter_item_agendamento(p_item_id, p_payload jsonb)`
Payload:
```
{ inicio, fim, medico_id?, medico_agenda_id?, enfermagem_recurso_id?, sala?, tipo_atendimento, observacoes? }
```
- Consulta regras da unidade do orçamento.
- Se `agenda_obrigatoria=false` (ex.: lab ordem de chegada): não exige payload de horário; grava `status_operacional='aguardando_agendamento'` com flag `[FLUXO:<fluxo>]` em observações.
- Se `agenda_obrigatoria=true`: valida `medico_obrigatorio`, `sala_obrigatoria`, `equipamento_obrigatorio`. Erros: `MEDICO_OBRIGATORIO`, `SALA_OBRIGATORIA`, `EQUIPAMENTO_OBRIGATORIO`, `RECURSO_INCOMPATIVEL`.
- Cria `agendamentos` com `orcamento_item_id` UNIQUE.
- Retorna `{ ok, agendamento_id, orcamento_status_novo, sem_agendamento_real: bool }`.

### 3.3 `marcar_item_nao_aplicavel(p_item_id, p_motivo)` — admin/gestor, motivo obrigatório.

### 3.4 `cancelar_item(p_item_id, p_motivo, p_confirmar_cascata bool default false)` — **cascata segura**
Fluxo:
1. Carrega item + `agendamentos` + `fin_atendimentos` vinculados.
2. Se agendamento vinculado tem `status IN ('realizado','em_atendimento','concluido')` → erro `AGENDAMENTO_JA_REALIZADO` (com dica de admin/gestor).
3. Se agendamento existe e `p_confirmar_cascata=false` → retorna `{ requer_confirmacao: true, agendamento_id, tem_pagamento: bool }` (UI mostra o dialog de confirmação).
4. Se `p_confirmar_cascata=true`:
   - marca item `status_operacional='cancelado'`;
   - marca agendamento como `cancelado` (libera horário);
   - se `fin_atendimento_id` existe e `status_financeiro='pago'` → **não estorna**, mas retorna `{ aviso_pagamento: true, fin_atendimento_id }` e o item mantém `status_financeiro='pago'` até estorno manual;
   - grava tudo em `audit_log`, preserva vínculos.
5. Restrita a admin/gestor **exceto** cancelamento de item ainda pendente (sem agendamento e sem pagamento) — recepção pode.

### 3.5 `get_orcamento_conversao(p_orcamento_id)`
Retorna, por item, o merge de regras + status duplo + ações disponíveis + flags (`tem_agendamento_futuro`, `tem_pagamento`).

---

## 4. NFS-e configurável por clínica

### 4.1 Config
Nova coluna em `clinicas` (ou `nfse_emitentes`):
```
nfse_modo_emissao text default 'agrupada'  -- 'agrupada' | 'por_item'
```
UI: em `app.configuracoes.nfse` uma escolha simples com explicação.

### 4.2 Emissão
- `por_item`: comportamento atual (1 NFS-e por `fin_atendimento`).
- `agrupada`: novo `emitir_nfse_orcamento(p_orcamento_id)` monta 1 NFS-e com todos os `fin_atendimentos` do orçamento como itens de serviço; `nfse.orcamento_id` referencia a origem; cada `fin_atendimento.nfse_id` aponta para a mesma nota.
- Comissão, repasse, produção, estatísticas, financeiro e auditoria continuam por `fin_atendimento` (nada muda).
- Focus NFS-e: o payload já aceita `itens[]` — reuso o mesmo cliente.

### 4.3 Compatibilidade
Nenhum relatório existente muda; queries continuam agrupando por `fin_atendimento`. NFS-e agrupada é uma linha em `nfse` a mais, referenciada por N atendimentos — impacto zero em séries históricas.

---

## 5. UI: `ConversaoOrcamentoDialog` (revisada)

Colunas por linha:
```
Procedimento | Fluxo (regra) | Valor | Op | Fin | Requisitos | Ação
```
- `Op` = status operacional (badge), `Fin` = status financeiro (badge).
- Ações vindas do backend (`acoes_disponiveis`): `agendar`, `sem_agenda`, `vender`, `cancelar`, `nao_aplicavel`.
- Sistema **não pergunta** o fluxo — só executa: se `fluxo_atendimento='lab_ordem_chegada'`, ação é `Enviar p/ fila`; se `equipamento`, abre sheet de recurso; etc.
- **Cancelar** abre confirmação com o texto exato pedido, mostrando badges `tem_agendamento`, `tem_pagamento`.
- Alerta topo do dialog quando qualquer item tem regra inválida (`fluxo_atendimento IS NULL`), com link para "Regras do procedimento".

Componentes:
- `src/components/orcamentos/ConversaoOrcamentoDialog.tsx`
- `src/components/orcamentos/conversao/LinhaItem.tsx`
- `src/components/orcamentos/conversao/Sheet{Agendar,SemAgenda,Vender,Cancelar,NaoAplicavel}.tsx`
- Server: `src/lib/orcamentos-conversao.functions.ts` (6 fns: get + 5 RPCs), todas com `requireSupabaseAuth`.

---

## 6. Testes UI + backend (`[TESTE-FASE3-UI]`)

Setup: seed transacional com 6 itens cobrindo consulta, hemograma (ordem_chegada), curva glicêmica (lab_agendado), MAPA (equipamento), US (equipamento+sala), venda balcão.

1. Render + status duplo (Op/Fin) por linha.
2. Consulta agendada → Op=`agendado`, Fin=`pendente`.
3. Hemograma ordem de chegada → sem agenda real, Op=`aguardando_agendamento`.
4. MAPA em agenda errada → RPC recusa (regra `equipamento_obrigatorio`).
5. US sem sala → recusa; com sala → ok.
6. Venda sem caixa → botão desabilitado.
7. Venda balcão com caixa → Fin=`pago`.
8. Venda de item já agendado (`permite_venda_direta=false`, mas agenda existe) → permite; Fin=`pago`, Op mantém `agendado`.
9. Cancelar item pendente (recepção) → ok.
10. Cancelar item agendado sem confirmar → retorna `requer_confirmacao`; UI abre dialog.
11. Confirmar cascata → agendamento cancelado, horário liberado, audit gravado.
12. Cancelar item com agendamento realizado → bloqueia.
13. Cancelar item pago → cascata + `aviso_pagamento`.
14. Trigger recalcula: só vira `convertido` quando Op resolvido **e** Fin resolvido em todos.
15. Override por unidade: mesmo hemograma vira `lab_agendado` em outra clínica → RPC pede agenda.
16. NFS-e por_item vs agrupada: emitir orçamento com 3 itens em cada modo; verificar 3 vs 1 registros em `nfse` e vínculos corretos em `fin_atendimentos.nfse_id`.
17. Cleanup por `[TESTE-FASE3-UI]` + contagens antes/depois.

Tudo Playwright headless para UI + `psql SELECT` para asserções de linha.

---

## 7. Rollback

Backend: `DROP FUNCTION` das 6 fns + `emitir_nfse_orcamento`; `DROP TABLE procedimento_unidade_regras`; `ALTER TABLE clinicas DROP COLUMN nfse_modo_emissao`; colunas de regra em `procedimentos` ficam (não quebram nada); `status_financeiro` cai; `status_operacional` renomeia para `status_item`. Migration idempotente.

Front: revert dos arquivos novos + diffs em `app.orcamentos.tsx`, `app.procedimentos.tsx`, `app.configuracoes.nfse.tsx`.

Bloqueio Fase 2 e triggers Fase 3.a permanecem intactos.

---

## 8. Impacto por módulo

| Módulo | Impacto | Risco |
|---|---|---|
| Agenda | Novo fluxo "sem agenda real" (fila); agendamento com cascata de cancelamento | 🟡 validar liberação de horário |
| Caixa | Venda passa a checar `permite_venda_direta` + venda pós-agenda | 🟢 |
| Financeiro | Nova coluna `status_financeiro` no item; nada muda em `fin_atendimentos` | 🟢 |
| Comissão/Repasse | Continuam por `fin_atendimento` — zero mudança | 🟢 |
| NFS-e (Focus) | Novo modo agrupado usa `itens[]`; compat total | 🟡 testar sandbox Focus |
| Relatórios | Status novo `status_operacional`; view compat evita quebra | 🟡 grep + ajuste |
| Enfermagem | Sem mudança direta; MAPA/Holter continuam via recurso | 🟢 |

---

## 9. Ordem de execução (peço confirmação para começar)

1. Migration A: colunas de regra em `procedimentos` + tabela de override + `fn_regras_procedimento` + backfill de `fluxo_atendimento`.
2. Migration B: `status_operacional`/`status_financeiro` + timestamps de transição (pago/agendado/concluído/cancelado) + gatilho bidirecional `status_item` ↔ `status_operacional` + novo vocabulário do orçamento (`aberto|em_andamento|finalizado|cancelado`) + trigger dual-status + bloqueio de edição estendido a `finalizado`. **✅ APLICADA**
3. Migration C: 6 RPCs + `emitir_nfse_orcamento` + `nfse_modo_emissao` em clínicas.
4. Frontend: `ConversaoOrcamentoDialog` + sheets + aba Regras em procedimentos + toggle NFS-e nas config.
5. Bateria de 17 testes + relatório antes/depois.

Aprovando, começo pela Migration A na próxima mensagem.
