## Alterações na tabela de Contratos (aba Vendas)

Arquivo: `src/components/pages/contratos-page.tsx`

### Colunas
Remover: **Pagamento** e **Assinado**.
Adicionar 3 novas colunas:

| Coluna | Fonte |
|---|---|
| **Término** | `contratos_assinatura.data_fim` (formatado dd/mm/aaaa) |
| **Parcelas pagas** | agregado de `contrato_mensalidades` — `pagas / total` (ex.: `4 / 12`) |
| **Situação** | derivada das mensalidades: **Em dia** (nenhuma parcela vencida sem pagamento) ou **Pendente** (pelo menos 1 parcela com `status != 'pago'` e `vencimento < hoje`). Contratos cancelados exibem badge "Cancelado". |

Ordem final da tabela: Nº · PACIENTE · Início · Término · Mensal · Parcelas · Situação · Vendedor · Status · ›

### Busca de dados
Uma query agregada em `contrato_mensalidades` filtrada pelos IDs dos contratos carregados:
```
select contrato_id, status, vencimento from contrato_mensalidades where contrato_id in (...)
```
Redução no cliente → mapa `{ contratoId: { pagas, total, temAtrasada } }`.
Executada em paralelo com o load atual de contratos e vendedores.

### Filtros
Barra de filtros ao lado do campo de busca (Selects já existentes no projeto):

1. **Situação** — Todas · Em dia · Pendente
2. **Término** — Todos · Vencidos · Vencem em 30 dias · Vencem em 90 dias · Sem data
3. **Progresso** — Todas · Sem pagamentos · Em andamento · Quitadas

Filtros aplicados no `useMemo filtered` já existente, combinados com a busca por número/paciente e o sort de paciente.

### Notas técnicas
- Sem alteração de schema — todos os dados já existem.
- A agregação usa apenas as colunas `status` e `vencimento`, sem trazer valores/PII extra.
- Loading: enquanto a agregação não chega, células mostram `—` (não bloqueia a lista).
- Nenhuma outra aba/tabela é afetada.
