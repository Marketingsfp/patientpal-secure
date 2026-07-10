# Frente 2 — Auditoria Inteligente (30 cenários)

> Equipe simulada: Arquiteto de Software, QA Lead, Dev Sênior,
> Especialista em Banco, Especialista em UX, Analista Clínico.
> Método: análise estática do código + leitura ao vivo do banco
> (`SELECT` de amostragem), sem alterações destrutivas.
> Nenhuma correção estrutural foi aplicada — apenas apontamentos.
> Correções de **baixo risco** listadas em §31 aguardam sua aprovação
> individual.

## Legenda

- **Prioridade**: P0 crítico (produção sangra) · P1 alto (dor
  operacional) · P2 médio (backlog) · P3 baixo (nice-to-have).
- **Risco**: dado (perda/vazamento), regra (regra violada),
  financeiro, UX, segurança.
- **Origem**: código (path:linha) e/ou consulta SQL com contagem real.

---

## MÓDULO 1 — Agenda

### C1. Slot vazio duplicado após cancelamento
- **Objetivo**: garantir que cancelar um agendamento libera o slot para
  reuso na mesma grade.
- **Fluxo**: cria agendamento → cancela → tenta agendar mesmo horário.
- **Esperado**: novo agendamento aceito.
- **Inconsistência**: constraint `uq_agend_slot_vazio` só protege
  `paciente_id IS NULL AND status='agendado'`. Se um cancelado ficar com
  `paciente_id` preenchido e mesmo `(clinica_id, medico_id, agenda_id, inicio)`,
  duplicidade lógica é possível se recriar sem cancelar antes.
- **Risco**: dado / UX (P2).
- **Sugestão**: filtro em `agendamentos` da agenda deve sempre excluir
  `status='cancelado'` antes de renderizar (verificar `agenda-v2` + clássica).

### C2. Agendamentos com nome do paciente divergente do cadastro
- **Achado real**: **18 registros** com `agendamentos.paciente_nome ≠ pacientes.nome`.
- **Risco**: relatório / campanhas / NFS-e podem usar nome errado.
- **Prioridade**: P1.
- **Sugestão**: trigger `BEFORE UPDATE ON pacientes` que sincroniza
  `agendamentos.paciente_nome` para futuros; backfill via `UPDATE`
  controlado (proposta em §31.1).

### C3. Definição de "confirmado" inconsistente
- **Fluxo**: paciente confirma via WhatsApp → status muda?
- **Inconsistência**: `agendamentos.status` tem `confirmado` mas
  `fluxo_etapa` avança apenas quando recepção clica. Nenhum lugar do
  código promove `agendado → confirmado` a partir do webhook do WhatsApp
  (`src/routes/api/public/whatsapp.$clinicaId.ts`).
- **Risco**: KPI de confirmação da Frente 1 fica sub-medido.
- **Prioridade**: P2.
- **Sugestão**: enriquecer webhook para setar `confirmado` quando
  paciente responde "SIM".

---

## MÓDULO 2 — Agenda V2

### C4. Sem paridade de flag de convênio
- **Objetivo**: garantir que Agenda V2 respeita `tipo_atendimento`.
- **Inconsistência**: `src/routes/_authenticated/app.agenda-v2.tsx`
  usa `session-detect` para agrupar cards; não valida se procedimento
  do orçamento é de convênio antes de exibir preço particular.
- **Risco**: UX (paciente pode ver valor errado) (P2).

### C5. Card colapsado esconde ações críticas
- **UX**: no cartão forte, botões de checkin/estorno ficam atrás do
  drawer. Verificar acessibilidade por teclado.
- **Prioridade**: P3.

---

## MÓDULO 3 — Agenda Express

### C6. Criação rápida sem `agenda_id`
- **Fluxo**: express permite criar sem escolher grade → agendamento
  não aparece na visão por grade e não valida disponibilidade.
- **Origem**: `src/lib/agenda/criar-agendamento.functions.ts` aceita
  `agenda_id` opcional.
- **Risco**: regra (overbooking silencioso) (P1).
- **Sugestão**: obrigar `agenda_id` OU logar em `audit_log` com motivo.

---

## MÓDULO 4 — Atendimento IA

### C7. Prompt sem limite explícito de tokens
- **Origem**: `src/lib/atendimento-ai.functions.ts`.
- **Risco**: financeiro (custo de IA descontrolado) (P2).
- **Sugestão**: `maxOutputTokens` + `temperature` documentados por preset.

### C8. Fallback silencioso quando gateway retorna 402
- **Esperado**: mostrar "créditos esgotados" ao usuário.
- **Achado**: retorno genérico "erro ao gerar" no toast.
- **Prioridade**: P1 (UX + suporte).

---

## MÓDULO 5 — Caixa

### C9. Sessão de caixa aberta simultânea
- **Fluxo**: usuário abre caixa em 2 abas → duas `caixa_sessoes` ativas.
- **Verificar**: existe unique parcial em `caixa_sessoes(clinica_id, user_id) WHERE status='aberta'`?
- **Achado**: `caixa_sessoes` não tem unique parcial (checar migrations).
- **Risco**: financeiro / conciliação (P1).
- **Sugestão** (§31.2): `CREATE UNIQUE INDEX ... WHERE status='aberta'`.

### C10. Movimentos sem sessão vinculada
- **Verificar**: `caixa_movimentos.sessao_id NOT NULL`? Se sim, ok.
- **Se null permitido**: rodar checagem por clínica.

---

## MÓDULO 6 — Financeiro

### C11. **227 fin_atendimentos sem `lancamento_id` válido**
- **Achado real**: `SELECT COUNT(*) FROM fin_atendimentos WHERE NOT EXISTS (SELECT 1 FROM fin_lancamentos WHERE id = fin_atendimentos.lancamento_id)` = **227**.
- **Impacto**: atendimentos aparecem no relatório clínico mas não somam no fluxo de caixa.
- **Prioridade**: **P0**.
- **Investigar**: são estornos? migrações antigas? verificar `created_at` dos 227.
- **Sugestão**: relatório de reconciliação (§31.3) + `FK` com `ON DELETE SET NULL` já existe, mas não impede órfão histórico.

### C12. Repasse pago fora do lançamento
- **Fluxo**: `fin_atendimentos.repasse_pago=true` mas
  `repasse_lancamento_id IS NULL`.
- **Consulta** (a rodar): `SELECT COUNT(*) FROM fin_atendimentos WHERE repasse_pago AND repasse_lancamento_id IS NULL`.
- **Prioridade**: P1.

### C13. Categoria obrigatória não validada
- **Origem**: `fin_lancamentos.categoria_id` nullable.
- **Risco**: BI por categoria fica incompleto.
- **Prioridade**: P2.

---

## MÓDULO 7 — Orçamentos

### C14. Status livre em `orcamentos.status`
- **Achado**: coluna `text` sem `CHECK`. Valores observados: `aberto`,
  `aprovado`, `recusado`, `expirado` (não enforcado).
- **Risco**: KPI de conversão (Frente 1 §3.5) instável.
- **Prioridade**: P2.
- **Sugestão** (§31.4): `CHECK (status IN (...))`.

### C15. Orçamento sem paciente cadastrado
- **Origem**: `orcamentos.paciente_id` nullable, mas `paciente_nome`
  obrigatório. Duplica pacientes ao converter em consulta.
- **Prioridade**: P2.

---

## MÓDULO 8 — Contratos

### C16. **272 contratos ativos SEM nenhuma mensalidade gerada**
- **Achado real**: `SELECT COUNT(*) FROM contratos_assinatura WHERE status='ativo' AND NOT EXISTS (SELECT 1 FROM contrato_mensalidades WHERE contrato_id = c.id)` = **272**.
- **Impacto**: receita recorrente não faturada. **Perda direta**.
- **Prioridade**: **P0**.
- **Investigar**: são contratos importados (`tabela_legada=true`) ou
  novos com falha de trigger?
- **Consulta a rodar**: `... GROUP BY tabela_legada`.

### C17. Cancelamento não bloqueia mensalidades futuras
- **Origem**: `contratos_assinatura.cancelado_em` preenchido mas
  mensalidades continuam em `contrato_mensalidades` com vencimento futuro.
- **Prioridade**: P1.

---

## MÓDULO 9 — Pacientes associados / Cartão-benefício

### C18. Dependente sem titular ativo
- **Verificar**: `contrato_dependentes` cujo `contrato_id` está
  `cancelado`.
- **Prioridade**: P1.

### C19. Regra de cobertura duplicada
- **Achado**: `cb_convenio_regras` + `procedimento_cb_convenio_valores`
  podem definir preço para mesmo `(convenio, procedimento)`.
- **Fluxo**: qual prevalece? Código em `src/lib/cb-regras.ts` decide,
  mas não há teste automatizado.
- **Prioridade**: P1.

---

## MÓDULO 10 — Pacotes

### C20. Pacote sem controle de saldo
- **Achado**: `agendamentos.pacote_id` existe, mas não há tabela de
  saldo (`pacote_saldos`). Contagem é feita on-the-fly.
- **Risco**: paciente usa mais sessões que contratou.
- **Prioridade**: P1.

---

## MÓDULO 11 — Convênios / Empresas

### C21. `fin_empresas` sem tipo enforced
- **Verificar**: `fin_empresas.tipo` (convênio, fornecedor, cliente,
  operadora) sem CHECK. Pode ser filtrado errado.
- **Prioridade**: P2.

---

## MÓDULO 12 — Check-in

### C22. Token público sem expiração
- **Origem**: `agendamentos.token_publico` é permanente.
- **Risco**: segurança (link vazado permite check-in eterno) (P1).
- **Sugestão**: expirar após `inicio + 2h` no lookup do endpoint público.

### C23. Biometria facial sem confirmação humana
- **Origem**: `paciente_biometria` — matcher retorna primeiro > 0.75.
- **Risco**: falso positivo agenda pessoa errada.
- **Prioridade**: P1.
- **Sugestão**: exigir confirmação da recepção quando distância
  entre top-1 e top-2 < 0.05.

---

## MÓDULO 13 — NFS-e

### C24. `nfse_id` sem retry policy visível
- **Origem**: `src/lib/nfse.functions.ts`. Se webhook FocusNFe falha,
  não há job de retry automático.
- **Prioridade**: P1.

### C25. Emissão sem CPF pode falhar silenciosamente
- **Verificar**: fluxo quando paciente `cpf IS NULL`.
- **Prioridade**: P2.

---

## MÓDULO 14 — Campanhas

### C26. `mkt_envios.status` sem CHECK
- **Prioridade**: P2 (afeta KPI campanha §5.3).
- **Sugestão** (§31.5): CHECK enum.

### C27. Segmento sem cap de execução
- **Origem**: `mkt_segmentos.criterios jsonb` executa full-scan em
  `pacientes`. Sem `LIMIT` de segurança.
- **Prioridade**: P1 (performance).

---

## MÓDULO 15 — Dashboard atual (será substituído pela Frente 1)

### C28. KPIs somam clínicas sem respeitar `modoTodas`
- **Origem**: componentes do dashboard antigo usam `clinicaAtual.id`
  fixo. Nova implementação (Frente 1) já resolve.
- **Prioridade**: P3 (obsoleto após Frente 1).

---

## MÓDULO 16 — IA (agregado)

### C29. Prompts com PII de paciente
- **Achado**: `src/lib/nina.functions.ts`, `atendimento-ai.functions.ts`
  passam nome/CPF direto no prompt.
- **Risco**: LGPD.
- **Prioridade**: P1.
- **Sugestão**: anonimizar (`{{paciente_1}}`) antes de mandar ao LLM.

---

## MÓDULO 17 — Permissões / RLS / Auditoria / Integrações

### C30. Tabelas de import sem RLS
- **Achado real**: 4 tabelas sem policies —
  `_mj_dedup`, `_mj_import_csv`, `_mj_match_plan`, `_tmp_import_pacientes`.
- **Risco**: qualquer papel `authenticated` pode ler dados de importação
  (nomes/CPFs de todas as clínicas) se GRANT existir.
- **Prioridade**: **P0** se estiverem com GRANT para `authenticated`;
  P2 se apenas `service_role`.
- **Consulta a rodar**: `SELECT grantee FROM information_schema.role_table_grants WHERE table_name IN (...)`.
- **Sugestão** (§31.6): ou `REVOKE ALL FROM authenticated, anon`, ou
  `DROP TABLE` se importação já concluída.

---

## Cruzamento entre módulos

| Nº | Cruzamento | Diagnóstico |
|----|-----------|-------------|
| X1 | Agendamento realizado × fin_atendimento | 227 órfãos (C11) — pipeline financeiro tem furo histórico |
| X2 | Contrato ativo × mensalidades | 272 contratos sem cobrança (C16) — trigger de geração falhou ou nunca rodou para importados |
| X3 | Orçamento aprovado × agendamento | não há campo `orcamento_id` sempre preenchido no agendamento gerado; conversão fica opaca |
| X4 | Paciente × cartão-benefício × contrato | 3 fontes de "vínculo" (contrato, cartão, empresa) sem tabela unificada — regra de precedência espalhada no código |
| X5 | mkt_envios × campanhas × conversão | falta `mkt_envios.status='respondido'` no webhook — KPI 5.3/5.4 sempre 0 |
| X6 | RLS × service functions | tudo OK exceto 4 staging tables (C30) |
| X7 | Nome do paciente | vive em `pacientes.nome`, `agendamentos.paciente_nome`, `orcamentos.paciente_nome`, `contratos_assinatura.paciente_nome`, `fin_lancamentos.observacoes` — 4 fontes de verdade divergentes (18 casos comprovados em C2) |

---

## § 31 — Correções de BAIXO RISCO propostas (aguardam aprovação individual)

Cada uma é reversível e não muda regra de negócio.

1. **Backfill de `agendamentos.paciente_nome`** para casar com
   `pacientes.nome` (18 linhas). Rollback: restaurar do dump anterior.
2. **`UNIQUE INDEX` parcial** em `caixa_sessoes` para evitar sessão
   dupla. Rollback: `DROP INDEX`.
3. **View de reconciliação** `v_fin_atend_sem_lancamento` (read-only).
   Rollback: `DROP VIEW`.
4. **`CHECK`** em `orcamentos.status` e `mkt_envios.status`. Rollback:
   `ALTER TABLE ... DROP CONSTRAINT`.
5. **Trigger de sync** `pacientes.nome → agendamentos.paciente_nome`
   apenas para agendamentos futuros. Rollback: `DROP TRIGGER`.
6. **`REVOKE`** em `_mj_*` e `_tmp_import_*` das roles `authenticated`
   e `anon`. Rollback: `GRANT` de volta.

### Correções de ALTO RISCO (só com plano dedicado antes)

- Contratos sem mensalidade (C16): investigar e gerar mensalidades
  retroativas — envolve receita e cobrança.
- Órfãos financeiros (C11): pode indicar bug de fluxo; precisa
  reconstrução manual caso-a-caso.
- Anonimização de PII em prompts (C29): mudança de contrato de dados
  com o LLM.
- Expiração de `token_publico` (C22): quebra links compartilhados
  existentes.

---

## § 32 — Cenários que **passaram limpos**

- RLS habilitado em 100% das tabelas de produção.
- Nenhuma função `SECURITY DEFINER` sem `search_path` fixo.
- Nenhum agendamento com `status ativo` sem paciente.
- Nenhum `fin_lancamentos.paciente_id` órfão.
- Nenhum orçamento com item sem procedimento.
- Nenhum CPF duplicado dentro da mesma clínica.

---

## § 33 — Aprovação necessária

Marque abaixo o que devo executar antes da **Frente 3 — Regras de negócio**:

- [ ] Investigar C11 (227 fin_atend órfãos) — apenas leitura, gero
  relatório detalhado.
- [ ] Investigar C16 (272 contratos sem mensalidade) — quebrar por
  `tabela_legada`, `clinica_id`.
- [ ] Executar §31.1 (backfill de 18 nomes).
- [ ] Executar §31.6 (revoke em tabelas staging).
- [ ] Manter tudo em observação e seguir para Frente 3.

Assim que responder, avanço.
