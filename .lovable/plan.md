## Objetivo

Criar uma nova aba **Comprovantes** ao lado da aba **Atendimentos** dentro do submenu Financeiro, listando apenas os **pagamentos de repasse já realizados** (agrupados por médico + data de pagamento), sem misturar com a listagem de atendimentos. Cada linha permite visualizar o comprovante completo (com detalhes dos pacientes) e imprimir a segunda via.

## Escopo

Dentro do escopo:
- Nova rota `/app/financeiro/comprovantes` com item no submenu "Financeiro" chamado **Comprovantes** (ao lado de Atendimentos).
- Listagem agrupada de repasses pagos.
- Modal de visualização com o comprovante detalhado (mesmo layout já existente na aba Atendimentos) e botão de imprimir/reimprimir.

Fora do escopo (não será alterado):
- Regras de cálculo de repasse, forma de pagamento, laudo, splits, permissões, RLS.
- Layout/dados do comprovante em si — será reutilizado o mesmo componente/função já usado hoje.
- A aba Atendimentos continua igual.

## Fonte de dados

Comprovantes serão derivados de `fin_atendimentos` onde `repasse_pago = true`. Um "comprovante" = um grupo de linhas com a mesma combinação de:
- `clinica_id`
- `medico_id`
- `repasse_pago_em` (data do pagamento)
- `repasse_lancamento_id` (quando existir, identifica exatamente o evento de baixa; garante que dois repasses no mesmo dia para o mesmo médico apareçam como comprovantes separados)

Nenhuma tabela nova é necessária — o histórico já está preservado nesses campos.

## Tela: /app/financeiro/comprovantes

Filtros no topo (padrão do módulo):
- Médico (dropdown, igual ao usado em Atendimentos)
- Período De / Até (default: últimos 30 dias)
- Busca por nome do médico

Tabela (uma linha por comprovante):
- Data do pagamento (`repasse_pago_em`)
- Médico
- Qtd. de pacientes (contagem do grupo)
- Valor total do repasse (soma de `valor_medico` + `valor_laudo` do grupo)
- Forma de pagamento (`repasse_forma_pagamento`)
- Ações: **Visualizar** (olho) e **Imprimir** (impressora)

Exemplo de linha: `10/07/26 — Dr. Alex Louzada — 12 pacientes — R$ 660,00 — DINHEIRO — [Visualizar] [Imprimir]`.

Ao clicar em **Visualizar**: abre o mesmo modal de comprovante já existente (função `buildComprovante` + Dialog em `app.financeiro.atendimentos.tsx`), populando com os atendimentos daquele grupo. O modal já tem botões "Imprimir resumo" e "Imprimir" que serão reutilizados.

Ao clicar em **Imprimir** direto na linha: dispara `imprimirComprovante()` (mesma função já usada hoje, com iframe A4 isolado).

## Menu

Em `src/routes/_authenticated/app.financeiro.tsx`, adicionar item entre "Atendimentos" e "Estorno":

```
{ to: "/app/financeiro/comprovantes", label: "Comprovantes", icon: ReceiptText }
```

## Arquivos

Novos:
- `src/routes/_authenticated/app.financeiro.comprovantes.tsx` — nova rota e componente da lista.

Alterados:
- `src/routes/_authenticated/app.financeiro.tsx` — inclui o novo item no submenu.
- `src/routes/_authenticated/app.financeiro.atendimentos.tsx` — extrair `buildComprovante`, o Dialog do comprovante e `imprimirComprovante` para um módulo compartilhado (ex.: `src/components/financeiro/comprovante-repasse-dialog.tsx`) para que a nova aba use exatamente o mesmo layout/impressão. A aba Atendimentos passa a importar do módulo compartilhado, mantendo o comportamento atual.

Nada muda em banco, RLS, regras de negócio, permissões ou dados existentes.

## Validação

- Abrir /app/financeiro/comprovantes e conferir que só aparecem repasses **pagos**.
- Confirmar agrupamento por médico + data.
- Clicar em Visualizar → conferir que os pacientes do dia aparecem exatamente iguais ao comprovante original gerado no momento do pagamento.
- Clicar em Imprimir → conferir que a impressão sai completa (não cortada), reaproveitando a correção recente.
- Aba Atendimentos continua funcionando normalmente.

## Pendências / suposições

- Suposição: dois repasses distintos para o mesmo médico no mesmo dia terão `repasse_lancamento_id` diferentes; caso não tenham, aparecerão como um único comprovante consolidado do dia. Se a clínica quiser tratar de outra forma, ajusto depois.
- Não haverá exclusão de comprovantes por esta aba — apenas visualização e impressão.