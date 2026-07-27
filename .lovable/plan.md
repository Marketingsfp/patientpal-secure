## Escopo

Clínica-alvo: POLICLINICA MENINO JESUS (contratos de teste identificados nela). Item 2 (UI do pagamento avulso) — confirmar se aplico nas 3 clínicas ou só Menino Jesus; por padrão aplico nas 3, pois é correção de comportamento (data de início sempre dia 1).

## 1. Excluir contratos de teste

Verificado no banco:
- 20261930 — QUEDIMA SUELEN, R$ 175,00, já **cancelado**
- 20261931 — JEAN XAVIER, R$ 120,00, já **cancelado**
- 20261933 — QUEDIMA SUELEN, R$ 120,00, ainda **ativo**

Ação: excluir definitivamente os 3 contratos, suas mensalidades, dependentes e cancelar/remover lançamentos financeiros e recebimentos de caixa vinculados (para não somarem no fechamento). Antes de apagar, listo o que será removido e reporto o resultado.

## 2. Data de início no pagamento avulso de mensalidade

Hoje, no diálogo de pagamento avulso, ao escolher o mês de referência o contrato é criado sempre com **dia 1** (`data_inicio` fixo no dia 1 do mês calculado, e `data_fim` um ano depois na mesma regra).

Mudança:
- Novo campo **"Data de início do contrato"**, exibido logo após o mês de referência.
- Pré-preenchido com o 1º dia do mês de referência (ajustado pelas parcelas já pagas), mas editável.
- Passa a ser a data base: `data_inicio` = data informada; `data_fim` = data informada + 1 ano.
- O dia de vencimento das mensalidades continua vindo do campo "Dia de vencimento" (comportamento atual preservado).
- Campo obrigatório; valida que a data é coerente com o mês/parcelas informados (aviso, não bloqueio rígido).

### Detalhes técnicos
- Arquivo: `src/components/cartao-beneficios/pagamento-avulso-dialog.tsx`
- Substituir `vencimentoDe(refMes, -pagasNum, 1)` por estado `dataInicio` e derivar `data_fim` com +12 meses sobre essa data.
- Sem alteração de regras de valor, carência, juros ou repasse.
