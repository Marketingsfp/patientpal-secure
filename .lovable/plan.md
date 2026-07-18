# Auditoria do módulo Cartão Benefícios — relatório e plano

Análise read-only completa do fluxo (venda → renovação → mensalidades → uso na Agenda/Caixa → histórico → RLS). Nada foi alterado. Abaixo estão os achados por severidade e, no fim, o plano priorizado de correções para você aprovar.

## 🔴 Críticos

**C1. Contratos ativos duplicados para o mesmo titular (170 pares na base)**
A checagem de duplicidade é feita em 2 etapas não-atômicas: no front (`contratos-page.tsx:1080-1096`) e dentro da RPC `criar_contrato_assinatura`. Não existe unique index nem lock. Dois cliques simultâneos passam. Exemplo real: paciente `410411b5-…`, contratos `#20261554` e `#20261555`, mesmo `created_at` até o milissegundo.
_Correção:_ `UNIQUE INDEX` parcial `(clinica_id, paciente_id) WHERE status='ativo'`, botão desabilitado no clique, e reconciliação dos 170 pares.

## 🟠 Altos / Médios

**M1. Contratos com contagem de parcelas anômala (13, 14, 24, 36, 144)**
Vários contratos têm `numero_parcela > 0` muito acima de 12 sem `numero_renovacoes` correspondente (ex.: `#20261029` com 144 parcelas mensais, `numero_renovacoes=0`). O `regerarComPagas` (`contratos-page.tsx:2302`) **apagaria todas** essas parcelas legítimas e recriaria só 12 — risco de perda de histórico se acionado nesses contratos.
_Correção:_ auditar caso a caso; `regerarComPagas` deve avisar/abortar quando encontrar >12 parcelas.

**M2. 133 mensalidades pagas sem `lancamento_id`**
Baixa manual na grade (edição de "Pago em"/"Status") grava direto em `contrato_mensalidades` sem gerar `fin_lancamentos`. Relatórios de caixa ficam subestimados.
_Correção:_ tornar a baixa transacional (RPC única que grava mensalidade **e** lançamento), e conciliar as 133 linhas existentes.

**M3. Isenção de carência (`sem_carencia`) protegida só no front**
`podeEditarCarencia` (admin/gestor + motivo obrigatório) existe apenas no frontend. A RLS de `contratos_assinatura` permite qualquer usuário membro da clínica setar `sem_carencia=true` via API direta.
_Correção:_ trigger `BEFORE UPDATE` no banco exigindo role admin/gestor e motivo não vazio quando `sem_carencia` for alterado.

**M4. Renovação retroativa (`_data_renovacao`) nasce “atrasada”**
`renovar_contrato_extensao` calcula os novos vencimentos a partir da data retroativa sem oferecer a opção de já marcar parcelas passadas como pagas (diferente do fluxo de criação retroativa).
_Correção:_ replicar no diálogo de renovação a opção "marcar N parcelas como pagas".

**M5. `criar_contrato_assinatura` sem `is_member` explícito**
Depende 100% da RLS de INSERT das 3 tabelas envolvidas. Diferente das RPCs de renovação, que validam explicitamente. Qualquer mudança futura de policy reabre a brecha em silêncio.
_Correção:_ `RAISE EXCEPTION IF NOT is_member(...)` no início da função.

## 🟡 Baixos

- **B1.** 1 contrato com `numero_renovacoes>0` sem linha em `contrato_renovacoes` (dado legado). Aba Histórico deveria sempre contar linhas reais, não o contador.
- **B2.** Drift pontual de dia de vencimento entre parcelas de mesmo contrato (`#20260945` — parcela 1 dia 17, parcela 2 dia 18). Investigar se é edição manual ou bug de geração.
- **B3.** Policies de `cb_convenios`, `cb_convenio_faixas`, `cb_beneficios` usam role `{public}` em vez de `{authenticated}`. Efetivamente bloqueado por `is_member`, mas destoa do padrão do resto do módulo.
- **B4.** 302 dependentes ativos sem `parentesco`. Qualidade de dado.
- **B5.** `contrato_renovacoes` não tem trigger que impeça UPDATE/DELETE — imutabilidade hoje depende só da ausência de policy.
- **B6.** Alteração de faixa em `salvarContratoAdmin` recalcula parcelas em aberto para `boleto`, mas não avisa quando há carnê já impresso divergente.

## ✅ Pontos OK confirmados

- Renovação **nunca** cobra taxa de adesão (0 casos com `contrato_origem_id` + `taxa_adesao>0`).
- 0 casos com `sem_carencia=true` e motivo vazio.
- 0 lançamentos órfãos apontando para `fin_lancamentos` inexistente.
- 0 dependentes com `incluido_em` no futuro.
- Agenda usa `cb_convenio_regras` como fonte única e respeita `sem_carencia`/renovação corretamente (`app.agenda.tsx:451-507`).
- Aba Histórico: RPC `contrato_historico` é `SECURITY DEFINER` com `is_member`, e a UI filtra eventos "sem alterações relevantes" (correção recente já aplicada).
- Todas as tabelas do módulo têm RLS habilitada com policies válidas.

## Não verificado a fundo (recomenda-se rodada específica)

- Se `caixa-v2` importa e aplica a **mesma** função `carenciaCumprida`/`findRegra` da Agenda (risco de lógica duplicada divergente).
- Cobertura efetiva do trigger de `audit_log` em `contratos_assinatura` / `contrato_mensalidades` / `contrato_dependentes` — se algum UPDATE não dispara, a aba Histórico fica silenciosamente incompleta.

## Plano de correção priorizado (a executar em turnos separados)

**Sprint 1 — segurança e integridade (crítico + médio)**
1. `UNIQUE INDEX` parcial para bloquear contrato ativo duplicado + desabilitar botão no clique + script de reconciliação dos 170 pares.
2. Trigger de banco exigindo role e motivo para alterar `sem_carencia`.
3. Adicionar `is_member` explícito em `criar_contrato_assinatura`.

**Sprint 2 — financeiro**
4. RPC única para baixa de mensalidade (mensalidade + `fin_lancamentos` na mesma transação); backfill/limpeza das 133 mensalidades pagas sem lançamento.
5. Blindar `regerarComPagas` contra contratos com >12 parcelas.
6. Renovação retroativa: opção "marcar N parcelas como pagas".

**Sprint 3 — qualidade / padronização (baixo)**
7. Padronizar roles de RLS `{public}` → `{authenticated}` em `cb_*`.
8. Trigger de imutabilidade em `contrato_renovacoes`.
9. Campanha para preencher `parentesco` nos 302 dependentes.
10. Validar cobertura do trigger de `audit_log` e uniformizar Caixa/Agenda.

**Melhoria opcional**
11. Coluna `ciclo` explícita em `contrato_mensalidades` para eliminar heurística de "12 parcelas por ciclo" na UI.

## O que preciso de você para seguir

- Aprovação deste plano.
- Se quiser priorizar diferente ou dividir em rodadas menores, me diga a ordem.
- Autorização para eu preparar as migrações da **Sprint 1** primeiro (com script de reconciliação dos 170 pares apresentado para revisão antes de rodar).