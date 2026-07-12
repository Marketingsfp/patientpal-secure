---
name: Testes só com dados fictícios
description: Proibido tocar registros reais de produção em qualquer simulação/teste; usar apenas dados fictícios marcados e removidos no mesmo teste
type: constraint
---
Regra absoluta para toda simulação, regressão, teste de fluxo ou validação transacional neste projeto.

**Proibido:**
- Criar, alterar, marcar como pago, cancelar, estornar ou concluir qualquer registro real em: `pacientes`, `agendamentos`, `contratos_assinatura`, `contrato_mensalidades`, `fin_atendimentos`, `fin_lancamentos` (não-simulação), `caixa_movimentos` (não-simulação), `caixa_sessoes` reais, `prontuarios`, `orcamentos`, `nfse`, `boletos`, `pagamentos`.
- Reaproveitar um ID real "só para testar" o fluxo — nem mesmo em leitura seguida de update.
- Rodar E2E pela UI clicando em botões que baixam mensalidade, concluem atendimento, geram GR, emitem NFS-e ou movimentam caixa sobre dados reais.

**Permitido:**
- Inserir registros novos com descrição/nome prefixado `SIM_*` ou `REG_E2E_*`, executar a operação e apagá-los ao final no mesmo teste.
- Chamar RPCs com payloads fictícios (clinica_id/user_id reais são OK como contexto de auth; os registros criados precisam ser fictícios e removidos).
- Reads puros (select) em dados reais para diagnóstico.

**Se o fluxo exigir estado real como pré-condição** (ex.: uma mensalidade em aberto para testar cobrança pela UI), PARE e peça ao usuário confirmação explícita, listando exatamente o registro-alvo e o impacto. Sem confirmação, não executar.

**Why:** projeto roda em produção com dados clínicos e financeiros; testar em cima altera saldo, histórico do paciente, GR emitida, auditoria, LGPD. AGENTS.md §2.6 exige rastreabilidade e reversibilidade — a única forma segura é dado fictício.

**How to apply:** antes de qualquer teste, listar exatamente o que será criado (payload) e como será removido; após o teste, verificar `SELECT` que confirma zero resíduos com o prefixo usado.
