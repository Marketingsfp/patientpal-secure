# Relatório de bugs — 03/07/2026 (.xlsx)

Gerar uma planilha em `/mnt/documents/relatorio-bugs-2026-07-03.xlsx` consolidando os achados de hoje, com status de correção.

## Fontes já coletadas

- **Backend (Auth / Postgres / Edge Functions)**: consultei os logs do dia — sem erros, apenas logins bem-sucedidos.
- **Console/preview**: sem entradas registradas.
- **Chat de hoje**: contém os achados relevantes (contratos, atendimento-ia, fluxo, orçamentos, cartão-benefícios).

## Conteúdo da planilha

Aba única **Bugs 2026-07-03** com colunas:
`ID | Área | Título | Descrição | Severidade | Origem | Status | Arquivo/Ref`

Formatação: cabeçalho em negrito com fundo cinza, colunas com largura adequada, linhas com quebra de texto, filtro automático. Sem fórmulas (dataset estático).

### Linhas a incluir

**Contratos (Cartão de Benefícios) — varredura 50 simulações**
1. Dependentes não persistidos (insert silencioso em `contrato_dependentes`) — 🔴 Alta — **Corrigido**
2. Sem checagem de titular duplicado — 🟠 Média — **Corrigido**
3. Sanitização ausente (XSS em campos texto) — 🟠 Média — **Corrigido**
4. Faixas `vidas_ate` forçadas a `vidas_de` — 🟡 Baixa — **Corrigido**
5. Double-submit permitido — 🟡 Baixa — **Corrigido**

**Orçamentos — varredura 53 cenários**
6. `<` / `>` aceitos em nome/telefone — 🟠 Média — **Corrigido**
7. Descrição de item não obrigatória — 🟡 Baixa — **Corrigido**
8. Quantidade zero/negativa aceita — 🟠 Média — **Corrigido**
9. Desconto maior que subtotal aceito — 🟠 Média — **Corrigido**

**Atendimento médico ↔ Fluxo do paciente (sincronização)**
10. Fila mostra pacientes sem passar por caixa/triagem — 🟠 Média — **Aberto**
11. Auto-promoção pula triagem (`recepcao` → `atendimento` quando pago) — 🔴 Alta — **Aberto**
12. Promoção sobrescreve etapa `exame` para `atendimento` — 🟠 Média — **Aberto**
13. Editor sem realtime (badge de pagamento/triagem só com F5) — 🟠 Média — **Corrigido** (`useRealtimeRefresh` adicionado)
14. Fila sem realtime para `fin_lancamentos`/`pagamentos` — 🟡 Baixa — **Aberto**
15. Exames abertos via URL como atendimento médico — 🟡 Baixa — **Aberto**

**Erros de tipo (TypeScript) do dia**
16. `app.fluxo.tsx:93` comparação de enum sem overlap com `"exame"` — 🟠 Média — **Corrigido**
17. `app.fluxo.tsx:412` chamada com 1 argumento esperando 2 — 🟠 Média — **Corrigido**

**Backend**
18. Sem erros observados em Auth/DB/Edge Functions no dia — ℹ️ Info — **N/A**

## Técnico

- Script Python (`openpyxl`) em `/tmp/gen_report.py`.
- Sem fórmulas (checklist do skill xlsx exige formulas quando há cálculo; aqui é lista estática).
- Após gerar, converter cada aba em imagem e inspecionar antes de entregar.
- Entrega via `<presentation-artifact path="relatorio-bugs-2026-07-03.xlsx" mime_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></presentation-artifact>`.

## Fora de escopo

- Corrigir os itens ainda "Aberto" (itens 10, 11, 12, 14, 15 do plano anterior de sincronização).
- Bugs de dias anteriores.
