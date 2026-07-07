# Frente 1 — Painel Executivo (CEO Dashboard)

> Status: **proposta para aprovação**. Nenhum código será escrito até esta
> lista de indicadores ser aprovada. Este documento serve como
> especificação para a implementação (server functions + view page).

## 0. Convenções, filtros globais e custo

**Filtros globais aplicados a todo o painel**

- `clinica_id`: usa `useClinica().clinicaIds` (`todas` = agregação multi-unidade).
- Período: `[data_inicio, data_fim]` — presets: hoje, 7d, 30d (default), MTD,
  YTD, 90d, período customizado.
- Médico / especialidade / unidade / convênio: filtros opcionais em drill-down.
- Comparação: período anterior de mesmo tamanho (Δ %) e YoY quando aplicável.

**Convenções de dados**

- "Consulta" = `agendamentos` com `medico_id NOT NULL`
  (procedimentos de enfermagem entram como categoria separada).
- "Realizada" = `status = 'realizado'` OU `executado_em IS NOT NULL`.
- "Faltou" = `status = 'faltou'`. "Cancelada" = `status = 'cancelado'`.
- "Confirmada" = já passou por `fluxo_etapa >= 'recepcao'` OU
  `status IN ('confirmado','realizado','faltou')` (ver detalhe em cada KPI).
- Receita **realizada** = `fin_lancamentos` com `tipo = 'receita'` e
  `status = 'confirmado'` (data efetiva = `data`).
- Receita **prevista** = `fin_lancamentos` com `tipo = 'receita'` e
  `status = 'previsto'` no período (data = `data_vencimento` ou `data`).
- Ticket = `SUM(valor_total) / COUNT(atendimentos)` em `fin_atendimentos`.
- Toda consulta respeita RLS via `requireSupabaseAuth` (as agregações
  rodam com o usuário logado — não usar `supabaseAdmin`).

**Custo de processamento — categorias**

| Categoria | Tempo alvo | Estratégia |
|-----------|-----------|-----------|
| Baixo (**L**) | < 50 ms | `count` / `sum` com índice existente |
| Médio (**M**) | 50–300 ms | join 2–3 tabelas, group by |
| Alto (**H**) | 300–1500 ms | janelas, `LAG`, coortes; **materializar view/refresh 5 min** |
| Coorte (**C**) | job | rodar em background (cron) e ler cache |

Recomendação: **materialized view** `mv_painel_kpi_dia` agregando por
`(clinica_id, dia)` com refresh a cada 5 min. KPIs "L/M" são calculados
sob demanda; "H/C" leem a MV.

---

## 1. Produção

### 1.1 Pacientes agendados
- **Finalidade**: volume de agenda ocupada no período.
- **Fórmula**: `COUNT(*) FROM agendamentos WHERE inicio BETWEEN :ini AND :fim AND paciente_id IS NOT NULL AND status <> 'cancelado' AND clinica_id = ANY(:ids)`.
- **Origem**: `agendamentos`.
- **Impacto**: base para taxa de ocupação, previsão de receita, dimensionamento de equipe.
- **Custo**: **L** (índice `idx_agendamentos_clinica_inicio`).

### 1.2 Confirmados
- **Finalidade**: comprometimento efetivo do paciente antes do dia.
- **Fórmula**: `COUNT(*) ... WHERE status IN ('confirmado','realizado','faltou') OR fluxo_etapa >= 'recepcao'`.
- **Origem**: `agendamentos.status`, `agendamentos.fluxo_etapa`.
- **Impacto**: mede eficácia da régua de confirmação (WhatsApp / SMS).
- **Custo**: **L**.

### 1.3 Compareceram
- **Finalidade**: produção clínica realizada.
- **Fórmula**: `COUNT(*) ... WHERE status = 'realizado' OR executado_em IS NOT NULL`.
- **Impacto**: numerador do no-show e da receita realizada por consulta.
- **Custo**: **L**.

### 1.4 Faltaram (no-show absoluto)
- **Fórmula**: `COUNT(*) ... WHERE status = 'faltou'`.
- **Impacto**: perda de receita e slot ocioso; alimenta régua de overbooking.
- **Custo**: **L**.

### 1.5 Cancelaram
- **Fórmula**: `COUNT(*) ... WHERE status = 'cancelado'`.
- **Impacto**: mede fricção do cancelamento; separar cancelamento < 24 h.
- **Custo**: **L**.

### 1.6 Taxa de ocupação
- **Finalidade**: % da capacidade agendada.
- **Fórmula**:
  - `capacidade_min = SUM(duracao_slot_min)` sobre `medico_disponibilidades` do período;
  - `agendado_min = SUM(EXTRACT(EPOCH FROM (fim - inicio))/60)` sobre agendamentos não-cancelados;
  - `ocupacao = agendado_min / capacidade_min`.
- **Origem**: `medico_disponibilidades`, `agendamentos`, `medico_expediente_encerramento`.
- **Impacto**: KPI executivo por excelência — grade sub-ocupada = perda estrutural.
- **Custo**: **M** (recomendo materializar por `(clinica_id, medico_id, dia)`).

### 1.7 Tempo médio por consulta
- **Fórmula**: `AVG(fim - inicio) FILTER (WHERE status='realizado')`.
- **Impacto**: aderência à `medicos.duracao_consulta_min`; recalibra a grade.
- **Custo**: **L**.

### 1.8 Tempo médio de espera
- **Fórmula**: `AVG(atendimento_inicio - checkin_em)` onde:
  - `checkin_em` = primeiro `updated_at` com `fluxo_etapa='recepcao'` (via `audit_log` ou coluna a criar);
  - `atendimento_inicio` = primeiro `updated_at` com `fluxo_etapa='atendimento'`.
- **Origem**: `audit_log` (existe) — filtrar `entidade='agendamentos'`.
- **Custo**: **M** (usa `audit_log` grande — considerar snapshot na MV).
- **Gap identificado**: não há coluna dedicada para checkpoints de fluxo; **recomendo** adicionar `fluxo_checkpoints jsonb` em `agendamentos` (rollback trivial) para eliminar dependência de `audit_log`. **Não faço agora** (requer migration; aguardo aprovação).

### 1.9 Consultas por médico
- **Fórmula**: `GROUP BY medico_id, COUNT(*)` filtrando realizados.
- **Impacto**: ranking de produtividade; base do repasse.
- **Custo**: **L**.

### 1.10 Consultas por especialidade
- **Fórmula**: join `agendamentos → medicos → medico_especialidades → especialidades`.
- **Cuidado**: médico pode ter N especialidades; usar `especialidade_id` principal do `medicos` para evitar dupla contagem (documentar critério).
- **Custo**: **M**.

### 1.11 Consultas por unidade
- **Fórmula**: `GROUP BY clinica_id` (unidade = clínica). Se houver `unidades` internas, join extra em `unidades`.
- **Custo**: **L**.

---

## 2. Financeiro

### 2.1 Receita prevista
- **Fórmula**: `SUM(valor) FROM fin_lancamentos WHERE tipo='receita' AND status='previsto' AND COALESCE(data_vencimento,data) BETWEEN :ini AND :fim`.
- **Impacto**: pipeline de caixa; base de meta.
- **Custo**: **L** (`idx_fin_lanc_clinica_venc`).

### 2.2 Receita realizada
- **Fórmula**: idem, com `status='confirmado'` e `data BETWEEN ...`.
- **Custo**: **L** (`idx_fin_lanc_clinica_tipo_status_data`).

### 2.3 Ticket médio
- **Fórmula**: `SUM(valor_total)/NULLIF(COUNT(*),0) FROM fin_atendimentos WHERE data BETWEEN :ini AND :fim AND status='realizado'`.
- **Impacto**: composição do preço + mix de procedimentos.
- **Custo**: **L**.

### 2.4 Receita por médico
- **Fórmula**: `GROUP BY medico_id, SUM(valor_total)` em `fin_atendimentos`.
- **Impacto**: base para repasse e negociação de agenda.
- **Custo**: **L**.

### 2.5 Receita por especialidade
- **Fórmula**: `fin_atendimentos JOIN medicos JOIN medico_especialidades` (mesma regra da 1.10).
- **Custo**: **M**.

### 2.6 Receita por convênio
- **Fórmula**:
  - Convênio corporativo: `fin_lancamentos.empresa_id → fin_empresas` filtrado por tipo empresa.
  - Cartão-benefício: join `fin_atendimentos → agendamentos.orcamento_item_id → orcamento_itens → cb_convenios`.
  - "Particular" = complementar (2.7).
- **Custo**: **M**.

### 2.7 Receita particular
- **Fórmula**: `SUM(valor_total)` de `fin_atendimentos` cujo `agendamento.tipo_atendimento='particular'` OU sem vínculo com convênio/cartão-benefício.
- **Custo**: **M**.

### 2.8 Receita por procedimento
- **Fórmula**: `GROUP BY fin_atendimentos.procedimento` (texto) — quando `orcamento_item_id` presente, resolver `procedimento_id` para agrupamento estável.
- **Impacto**: identifica top-line de receita.
- **Custo**: **M**.
- **Nota**: campo `procedimento` é texto livre — normalização recomendada em backlog.

### 2.9 Procedimentos mais lucrativos
- **Fórmula**: por procedimento, `receita = SUM(valor_total)`; `custo = SUM(valor_medico + valor_laudo)`;
  `margem_bruta = receita - custo`; ordenar `margem_bruta DESC`.
- **Impacto**: guia comercial (o que empurrar em pacotes / campanhas).
- **Custo**: **M**.

---

## 3. Comercial

### 3.1 Novos pacientes
- **Fórmula**: `COUNT(*) FROM pacientes WHERE created_at BETWEEN :ini AND :fim AND clinica_id = ANY(:ids)`.
- **Impacto**: aquisição bruta.
- **Custo**: **L**.

### 3.2 Pacientes recorrentes
- **Fórmula**: pacientes com `>= 2` consultas realizadas no período OU já com histórico anterior E consulta no período.
  - `SELECT COUNT(DISTINCT paciente_id) FROM agendamentos WHERE status='realizado' AND inicio BETWEEN :ini AND :fim AND paciente_id IN (SELECT paciente_id FROM agendamentos WHERE inicio < :ini AND status='realizado')`.
- **Custo**: **M**.

### 3.3 Retenção
- **Fórmula**: `retencao = pacientes_com_2plus_consultas_12m / pacientes_ativos_12m`.
- **Custo**: **H** — materializar coorte mensal.

### 3.4 Retorno em 30 / 60 / 90 dias
- **Fórmula** (para janela X):
  `retornaram = COUNT(DISTINCT p) tal que existe consulta em [t0, t0+X]` onde `t0 = primeira consulta do paciente no período`.
  `taxa = retornaram / novos_pacientes_periodo`.
- **Impacto**: proxy de aderência ao plano terapêutico.
- **Custo**: **H** (janela por paciente — usar `LAG`/`LEAD`; materializar).

### 3.5 Conversão orçamento → consulta
- **Fórmula**: `orcamentos.status='aprovado' com agendamento gerado / orcamentos criados no período`.
  - "com agendamento" = `EXISTS (SELECT 1 FROM agendamentos WHERE orcamento_id = o.id)`.
- **Custo**: **M** (`idx_agendamentos_orcamento_id`).

### 3.6 Conversão consulta → tratamento
- **Fórmula**: `agendamentos realizados que geraram orcamento posterior aprovado / agendamentos realizados`.
  - "posterior" = `orcamentos.created_at > agendamento.executado_em` e mesmo `paciente_id` em ≤ 30 dias.
- **Impacto**: eficácia clínica-comercial.
- **Custo**: **M**.

---

## 4. Qualidade

### 4.1 No-show %
- **Fórmula**: `faltas / (realizados + faltas)` no período.
- **Custo**: **L**.

### 4.2 Tempo para atendimento
- **Fórmula**: `AVG(inicio_atendimento - inicio_agendado) FILTER (WHERE status='realizado' AND inicio_atendimento >= inicio_agendado)`.
- **Origem**: `agendamentos.executado_em` (proxy) — idealmente `fluxo_checkpoints` (gap 1.8).
- **Custo**: **M**.

### 4.3 Tempo para encaixe
- **Finalidade**: tempo entre solicitação (criação do agendamento) e horário atendido, para casos marcados como encaixe.
- **Fórmula**: `AVG(inicio - created_at) FILTER (WHERE prioridade='alta')` (proxy) — considerar novo enum `origem='encaixe'` se quiser rigor.
- **Custo**: **L**.

### 4.4 Tempo médio de permanência
- **Fórmula**: `AVG(fluxo_checkpoints[finalizado] - fluxo_checkpoints[recepcao])`.
- **Custo**: **M**.
- **Depende** do gap 1.8 (checkpoints).

### 4.5 Tempo entre consulta e retorno
- **Fórmula**: por paciente, `LEAD(inicio) OVER (PARTITION BY paciente_id ORDER BY inicio) - inicio` filtrando `status='realizado'`; agregar `AVG`, `MEDIAN` no período.
- **Impacto**: leitura clínica de aderência.
- **Custo**: **H** — materializar.

---

## 5. Campanhas

### 5.1 Elegíveis
- **Fórmula**: `COUNT(*)` do segmento SQL de `mkt_segmentos` (cada segmento tem `criterios jsonb` que resolve em query dinâmica) — expor via server fn dedicada por segmento.
- **Custo**: **M/H** (depende do segmento — cachear por campanha, 5 min).

### 5.2 Já chamados
- **Fórmula**: `COUNT(*) FROM mkt_envios WHERE campanha_id = :c AND status IN ('enviado','entregue')`.
- **Custo**: **L** (`idx_mkt_envios_clinica`).

### 5.3 Responderam
- **Fórmula**: `COUNT(*) ... WHERE status = 'respondido'`. Requer captura de reply no webhook do WhatsApp (já existe `whatsapp.$clinicaId.ts`).
- **Custo**: **L**.
- **Gap**: `mkt_envios.status` não tem enum — usar `CHECK` de valores permitidos em migration futura para consistência.

### 5.4 Converteram
- **Fórmula**: paciente `mkt_envios.paciente_id` gerou consulta realizada em ≤ 30 dias após `enviado_em` E dentro do período da campanha.
- **Custo**: **M**.

---

## 6. Cortes obrigatórios (drill-down)

Todo KPI deve responder aos cortes: **clínica**, **médico**, **especialidade**,
**convênio**, **origem** (particular / convênio / cartão-benefício / contrato),
**período**. UI: painel com 4 abas (Produção / Financeiro / Comercial /
Qualidade) + rail lateral de campanhas.

---

## 7. Arquitetura proposta (para aprovação, ainda sem código)

1. **Server functions** em `src/lib/painel/*.functions.ts` (com
   `requireSupabaseAuth`), uma por bloco (produção, financeiro, comercial,
   qualidade, campanhas). Input = `{ clinicaIds, ini, fim, filtros? }`.
2. **Query keys** estáveis por bloco (`['painel','producao',hash(filtros)]`)
   com `staleTime` 60 s.
3. **Materialized view** `mv_painel_kpi_dia` (produção + financeiro por
   `(clinica_id, dia)`) + `mv_painel_coorte_paciente` (retenção / retorno).
   Refresh: `pg_cron` a cada 5 min. **Migration proposta em item separado
   para aprovação** (rollback: `DROP MATERIALIZED VIEW`).
4. **Sem alterações** na Agenda clássica, atendimento ou financeiro
   operacional — o painel é 100 % leitura.
5. **Auditoria de acesso**: log em `audit_log` (`entidade='painel'`) a cada
   consulta pesada — permite rastrear quem abriu o quê.

---

## 8. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Queries pesadas (retenção / coorte) | Materialized view + cron |
| Definição de "confirmado" divergente entre times | Documentar critério nesta página e no tooltip do KPI |
| Procedimento como texto livre → group by inconsistente | Normalizar via `orcamento_item_id.procedimento_id` quando existir; backlog: campo `procedimento_id` em `fin_atendimentos` |
| RLS travando queries do painel | Todas as fns usam `requireSupabaseAuth` + `is_member`; testar com usuário `visualizador` |
| Falta de checkpoints de fluxo | Proposta separada de coluna `fluxo_checkpoints jsonb` (rollback trivial); enquanto isso, proxy via `audit_log` |

---

## 9. Validações previstas na entrega

- [ ] Cada server fn testada com clínica `demo` (São Francisco de Paula) e
  clínica sem dados (Consulta Hoje) — sem erro, sem NaN.
- [ ] Comparativo manual de "receita realizada" vs Financeiro > Movimento.
- [ ] Comparativo "consultas realizadas" vs Agenda clássica no mesmo dia.
- [ ] Verificação RLS com perfil `recepcao` (não vê financeiro).
- [ ] Tempo p95 < 800 ms por painel completo (via `performance.mark`).

---

## 10. O que preciso da sua aprovação

1. Lista de KPIs acima está completa? Falta algo (ex.: DRE resumido,
   inadimplência, glosas de convênio)?
2. Posso propor a **migration** da materialized view + coluna
   `fluxo_checkpoints` em item separado antes da implementação?
3. Público-alvo do painel: só perfil `admin`/`gestor`, ou também
   `financeiro`?
4. Alguma unidade tem regra própria que muda a definição de "realizado"
   (ex.: só conta se `caixa` fechou)?

Assim que aprovar, avanço para **Frente 2 — Auditoria** (30 cenários).
