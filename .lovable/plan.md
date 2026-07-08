## Análise — Auditoria dos orçamentos de `jeanpsfp@gmail.com`

Encontrei **3 orçamentos** criados por esse usuário. Todos estão com status **"aberto"** (nenhum foi convertido em agendamento, nenhum vínculo em `agendamento_orcamento_itens`).

| Nº | Status | Valor | Data | Paciente |
|----|--------|-------|------|----------|
| 202600044 | aberto | R$ 110,00 | 05/07/2026 | — (sem paciente vinculado) |
| 202600043 | aberto | R$ 40,00 | 02/07/2026 | — (sem paciente vinculado) |
| 202600015 | aberto | R$ 40,00 | 02/07/2026 | — (sem paciente vinculado) |

Total: **3 orçamentos + 3 itens de orçamento**. Sem impacto em agendamentos, financeiro, caixa ou NFS-e.

## Análise dos 4 eixos (governança)

- 💰 **Financeiro**: nenhum. Orçamentos "aberto" não geram lançamento, guia ou receita — são apenas propostas.
- ⏱️ **Operacional**: limpa 3 propostas antigas da lista.
- 😊 **Experiência**: nenhum paciente afetado (nenhum vinculado).
- 🛡️ **Auditoria**: a exclusão será registrada em `audit_log` via trigger. Ação permanece rastreável mesmo após o delete.

## Plano de execução

1. **Excluir os 3 orçamentos** (`orcamentos` + `orcamento_itens` em cascata) via `supabase--insert` com um único `DELETE` filtrando pelos 3 IDs listados acima.
2. Não mexer em nenhum outro registro (agendamentos, pagamentos, caixa, NFS-e — inalterados por não haver vínculo).

## Confirmação necessária

Por serem dados financeiros (mesmo que ainda em fase de proposta), preciso da sua confirmação explícita antes de executar. **Confirma a exclusão desses 3 orçamentos?**

Se preferir preservar algum, me diga os números a manter.
