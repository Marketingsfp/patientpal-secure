## Análise — Mensalidades de contratos criados por `jeanpsfp@gmail.com`

A tabela `contrato_mensalidades` não tem coluna de criador — herdo via `contratos_assinatura.criado_por`.

**Resultado:**
- **42 contratos** criados por esse usuário
- **504 mensalidades** (12 parcelas × 42 contratos)
- **0 pagas**, **0 com lançamento financeiro**, **0 com pagamento registrado**
- Todos os contratos estão com status `ativo` e as mensalidades sem `pago_em`, sem `lancamento_id`, sem `valor_pago`

## Análise dos 4 eixos

- 💰 **Financeiro**: nenhum impacto. Nenhuma mensalidade foi paga nem virou lançamento no financeiro.
- ⏱️ **Operacional**: remove 504 parcelas futuras que estão poluindo a agenda de recebimentos.
- 😊 **Experiência**: nenhum paciente foi cobrado por essas parcelas.
- 🛡️ **Auditoria**: exclusão registrada em `audit_log`.

## Ponto importante — o que o usuário pediu

Você pediu para excluir "todos os `contratos_mensalidades` criados por jeanpsfp". Os **contratos em si (42 registros em `contratos_assinatura`) permanecem intactos** — só as parcelas serão apagadas. Isso deixará os contratos "ativos" mas **sem parcelas geradas**.

Duas opções — preciso que você confirme qual:

**Opção A (literal ao pedido):** Excluir apenas as 504 mensalidades. Contratos ficam ativos sem parcelas.

**Opção B (mais provável):** Excluir as 504 mensalidades **E** os 42 contratos junto (limpeza completa dos contratos criados por ele).

## Plano de execução

Após sua escolha entre A ou B:

1. `DELETE FROM contrato_mensalidades WHERE contrato_id IN (SELECT id FROM contratos_assinatura c JOIN auth.users u ON u.id=c.criado_por WHERE u.email='jeanpsfp@gmail.com')`
2. **(Só se opção B)** `DELETE FROM contratos_assinatura WHERE criado_por = (uuid do jeanpsfp)` — também remove `contrato_dependentes` em cascata.

Nenhum lançamento em `fin_lancamentos` será afetado (não há nenhum vinculado).

**Qual opção — A ou B?**
