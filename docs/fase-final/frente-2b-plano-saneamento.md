# Frente 2B — Plano de Saneamento (read-only, aguarda aprovação)

> **Regra de ouro**: nenhum `UPDATE`, `DELETE` ou migration foi executado.
> Todas as queries são **read-only** ou marcadas *"não executar ainda"*.
> Cada correção só sai do papel após aprovação explícita, por grupo.

---

## § 0. Diagnóstico executado — os dois P0 mudaram de grupo

Rodei os SELECTs de diagnóstico antes de propor qualquer correção.
**Ambos os P0 foram reclassificados para o Grupo D (comportamento esperado)**.

### P0-01 — 227 `fin_atendimentos` sem `lancamento_id`

| Dimensão | Resultado real |
|----------|----------------|
| Total | 227 |
| `lancamento_id` | **100% NULL** (não é FK morta) |
| Status | **100% `realizado`** |
| Período (`created_at`) | **100% em 2026-06-11** — batch único |
| Clínica | 1 única (`7570ddde-…`) |
| Procedimentos | `CARTAO CONSULTA` (110), `CARTAO CONSULTA+ SEGURO` (114), `CARTAO TERAPEUTICO` (3) |
| `valor_total` somado | **R$ 0,00** |
| `valor_medico` somado | **R$ 0,00** |
| `valor_clinica` somado | **R$ 0,00** |

**Interpretação**: são 227 consultas do cartão-benefício cobertas pelo
plano do paciente. Custo zero para o titular = **não geram lançamento
financeiro por design**. O `lancamento_id NULL` é o comportamento
correto do módulo cartão-benefício, não um órfão.

**Reclassificação: C → D (não corrigir)**.
Recomendação separada em §8: criar view `v_fin_atend_sem_lancamento`
apenas para monitoramento futuro (detectar se um atendimento *com valor*
ficar sem lançamento — aí sim seria bug).

### P0-02 — 272 contratos ativos sem mensalidade

| Dimensão | Resultado real |
|----------|----------------|
| Total | 272 |
| `tabela_legada = true` | **269** (99%) |
| `tabela_legada = false` | 3 |
| `plano_id NULL` | 268 |
| `valor_mensal` somado | **R$ 0,00** |
| Período (`created_at`) | **100% em 2026-06-13** — batch de importação |
| Clínica | 1 única (mesma do P0-01) |

**Interpretação**: 269 são contratos legados (cartão-benefício importado
de sistema anterior) com `valor_mensal = 0` — a cobrança recorrente já
era feita fora ou não existe. Os 3 novos (`tabela_legada=false`) merecem
inspeção pontual, mas o total representa **zero receita recorrente
pendente**, não R$ perdido.

**Reclassificação: C → D (269 casos) + investigação pontual dos 3 novos**.

### Consequência para a Frente 2

Os dois "achados P0" da Frente 2 eram **falsos positivos** — a auditoria
detectou padrões estatisticamente estranhos, mas o diagnóstico mostra
comportamento esperado do domínio (cartão-benefício sem valor, contratos
legados). **Nenhuma correção destrutiva será proposta para eles.**

---

## § 1. Formato padrão por auditoria

| Campo | Descrição |
|-------|-----------|
| Qtd afetada | resultado do SELECT de verificação |
| Impacto operacional | recepção / médico / financeiro / gestão |
| Impacto financeiro | R$ ou "nenhum" |
| Impacto clínico | risco assistencial |
| Risco da correção | Baixo / Médio / Alto |
| Automatizável? | Sim / Sim c/ revisão / Não |
| Rollback | descrição objetiva |
| SQL verificação | read-only |
| SQL correção | **não executar** |
| SQL validação | read-only pós-correção |

### Classificação (após diagnóstico dos P0)

| ID | Cenário | Grupo | Justificativa |
|----|---------|-------|---------------|
| C1 | Slot duplicado após cancelar | C | caso-a-caso |
| C2 | 18 nomes divergentes agend×paciente | **A** | backfill + trigger, reversível |
| C3 | "confirmado" divergente | C | mudança de contrato |
| C4 | Agenda V2 sem paridade convênio | C | UI/regra |
| C5 | Card colapsado | C | UX |
| C6 | Express sem `agenda_id` | B | validação nova |
| C7 | Prompt sem `maxOutputTokens` | **A** | só código |
| C8 | Fallback silencioso 402 | **A** | só mensagem |
| C9 | Caixa sessão dupla | B | índice único após limpar |
| C10 | Movimentos sem sessão | C | investigar |
| **C11** | **227 fin_atend "órfãos"** | **D** | **cartão-benefício R$ 0 — esperado** |
| C12 | Repasse pago sem lançamento | C | contábil |
| C13 | `fin_lancamentos.categoria_id` null | D | opcional por design |
| C14 | `orcamentos.status` livre | **A** | CHECK |
| C15 | Orçamento sem paciente | B | revisão |
| **C16** | **272 contratos sem mensalidade** | **D (269) + investigar 3** | **cartão-benefício legado** |
| C17 | Mensalidade futura em cancelado | B | regra de negócio |
| C18 | Dependente sem titular ativo | B | revisão comercial |
| C19 | Regra de cobertura duplicada | C | política |
| C20 | Pacote sem saldo | C | estrutural |
| C21 | `fin_empresas.tipo` sem CHECK | **A** | CHECK |
| C22 | Token público sem expiração | C | quebra link |
| C23 | Biometria facial | C | UX + segurança |
| C24 | NFS-e sem retry | B | job novo |
| C25 | NFS-e sem CPF | B | validação |
| C26 | `mkt_envios.status` sem CHECK | **A** | CHECK |
| C27 | Segmento sem cap | **A** | LIMIT |
| C28 | Dashboard antigo | D | substituído |
| C29 | PII em prompts | C | contrato LLM |
| C30 | Tabelas `_mj_*` sem RLS | **A** | REVOKE |

### Grupos

- **A — Automática segura**: C2, C7, C8, C14, C21, C26, C27, C30.
- **B — Automática com revisão**: C6, C9, C15, C17, C18, C24, C25.
- **C — Manual / caso-a-caso**: C1, C3, C4, C5, C10, C12, C19, C20, C22, C23, C29.
- **D — Não corrigir**: **C11**, C13, **C16 (269 legados)**, C28.
- **Investigação pontual (não é grupo)**: os **3 contratos novos** do C16 com `tabela_legada=false`.

---

## § 2. Detalhamento do Grupo A (aguardando aprovação individual)

### A.1 — C2: sincronizar `agendamentos.paciente_nome` (18 linhas)
- Impacto operacional: relatórios / campanhas / NFS-e passam a usar nome atual.
- Impacto financeiro: nenhum.
- Impacto clínico: nenhum.
- Risco: **baixo**.
- Rollback: restaurar valor anterior a partir de dump prévio (armazenar em tabela `_bkp_agend_nome`).

```sql
-- verificação (read-only)
SELECT a.id, a.paciente_nome AS agendamento, p.nome AS cadastro
FROM agendamentos a JOIN pacientes p ON p.id = a.paciente_id
WHERE a.paciente_nome IS DISTINCT FROM p.nome;

-- backup antes da correção (executar junto)
CREATE TABLE _bkp_agend_nome_2026_07 AS
SELECT id, paciente_nome, now() AS bkp_em FROM agendamentos
WHERE paciente_nome IS DISTINCT FROM (SELECT nome FROM pacientes WHERE id = agendamentos.paciente_id);

-- correção (NÃO executar até aprovação)
UPDATE agendamentos a SET paciente_nome = p.nome
FROM pacientes p WHERE p.id = a.paciente_id
  AND a.paciente_nome IS DISTINCT FROM p.nome;

-- validação (deve retornar 0)
SELECT COUNT(*) FROM agendamentos a JOIN pacientes p ON p.id = a.paciente_id
WHERE a.paciente_nome IS DISTINCT FROM p.nome;

-- rollback
UPDATE agendamentos a SET paciente_nome = b.paciente_nome
FROM _bkp_agend_nome_2026_07 b WHERE b.id = a.id;
```

### A.2 — C7 + C8: limites de token e mensagem 402
- Arquivos: `src/lib/atendimento-ai.functions.ts`, `src/lib/nina.functions.ts`.
- Sem SQL. Rollback: revert.

### A.3 — C14: CHECK em `orcamentos.status`
```sql
-- verificação
SELECT status, COUNT(*) FROM orcamentos GROUP BY status;
-- correção (NÃO executar)
ALTER TABLE orcamentos ADD CONSTRAINT orcamentos_status_check
  CHECK (status IN ('aberto','aprovado','recusado','expirado','convertido'));
-- rollback
ALTER TABLE orcamentos DROP CONSTRAINT orcamentos_status_check;
```

### A.4 — C21: CHECK em `fin_empresas.tipo` (mesmo padrão de A.3).
### A.5 — C26: CHECK em `mkt_envios.status` (mesmo padrão de A.3).
### A.6 — C27: LIMIT de segurança em `mkt_segmentos` builder — só código.

### A.7 — C30: revogar acesso às tabelas `_mj_*` / `_tmp_import_*`
```sql
-- verificação
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name IN ('_mj_dedup','_mj_import_csv','_mj_match_plan','_tmp_import_pacientes')
  AND grantee IN ('anon','authenticated');

-- correção (NÃO executar)
REVOKE ALL ON _mj_dedup, _mj_import_csv, _mj_match_plan, _tmp_import_pacientes
  FROM authenticated, anon;

-- rollback
GRANT SELECT ON <tabela> TO authenticated;  -- só se auditoria mostrar necessidade
```

---

## § 3. Grupo B — revisão antes de aplicar

Cada item terá SQL de diagnóstico específico após aprovação da fase A.
Nada a executar agora.

## § 4. Grupo C — caso-a-caso

Aguarda plano dedicado por item. Nada a executar agora.

## § 5. Grupo D — não corrigir

- **C11**: 227 atendimentos do cartão-benefício com valor R$ 0 — esperado.
- **C13**: `categoria_id` opcional por design.
- **C16 (269 legados)**: contratos importados sem valor recorrente.
- **C28**: dashboard antigo será substituído pela Frente 1.

---

## § 6. Investigação pontual — 3 contratos do C16 (`tabela_legada=false`)

```sql
-- read-only
SELECT id, paciente_id, plano_id, valor_mensal, data_inicio, data_fim,
       cancelado_em, created_at, criado_por
FROM contratos_assinatura c
WHERE status='ativo' AND tabela_legada = false
  AND NOT EXISTS (SELECT 1 FROM contrato_mensalidades WHERE contrato_id=c.id);
```

Depois de olhar os 3 registros, decidimos: bug de trigger, cadastro
incompleto ou também comportamento esperado.

---

## § 7. Fluxo de aprovação

1. Você revisa este documento.
2. Aprova o **Grupo A** (todos ou item a item).
3. Cada item vira uma migration individual com rollback.
4. Grupo B só depois de Grupo A validado.
5. Grupo C com plano dedicado por item.
6. **Frente 3 (Regras de Negócio)** pode iniciar em paralelo — não depende de B/C.

---

## § 8. Recomendação adicional (opcional, Grupo A)

Criar view read-only `v_fin_atend_sem_lancamento_valor_positivo` para
detectar futuros casos onde um atendimento **com valor > 0** fique sem
lançamento — esses sim seriam bugs. O batch atual (R$ 0) fica fora.

```sql
CREATE OR REPLACE VIEW v_fin_atend_sem_lancamento_valor_positivo AS
SELECT * FROM fin_atendimentos fa
WHERE fa.lancamento_id IS NULL AND fa.valor_total > 0;
```

Rollback: `DROP VIEW`.

---

## § 9. Garantias

- Nenhum `UPDATE`, `DELETE`, `DROP` ou migration executado.
- Dados imutáveis (prontuário, histórico financeiro emitido, `audit_log`,
  NFS-e emitidas) fora de qualquer correção proposta, conforme
  `mem://constraints/governanca-dados-imutaveis`.
- Cada item do Grupo A tem rollback simples e escopo mínimo.
