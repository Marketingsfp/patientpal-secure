## Diagnóstico (confirmado no banco)

O contrato **#20260619 (IARA BARBOSA VALENTE)** tem, na tabela `contrato_mensalidades`, exatamente **12 parcelas** (1 paga + 11 pendentes). Está correto.

O card **"Pagas 185/196"** infla porque o cálculo hoje faz:

```
totalParcelas = mensalidades do contrato (12) + TODO lançamento de receita do paciente (fin_lancamentos)
```

Consultando o banco: a paciente tem **184 lançamentos** em `fin_lancamentos` (consultas, exames, contratos antigos importados, cartão-consulta avulso etc.). Nenhum deles é "parcela" deste contrato — o contador está somando o histórico financeiro inteiro do paciente ao denominador.

Além disso, a paciente tem **2 contratos formais** na tabela `contratos_assinatura` (o atual + 1 anterior de 12/12 quitado no mesmo lote de importação), não 16.

Ou seja: **não são "parcelas de contratos antigos"** — são recebimentos avulsos históricos. E os contratos antigos formais existem, mas hoje não aparecem em lugar nenhum na tela do contrato atual.

## O que vou alterar

### 1. Corrigir o card "Pagas X/Y" no resumo do contrato
Arquivo: `src/components/pages/contratos-page.tsx`

- Remover `extraRecebido.count` do denominador e do numerador. O contador passa a mostrar **apenas as parcelas deste contrato** (ex.: `1/12`), como o negócio exige.
- O card **"Recebido"** continua somando os recebimentos avulsos (útil para BI), mas com um rótulo mais claro: `R$ X do contrato + R$ Y avulso` no drill.
- O drill "Parcelas pagas" também deixa de listar avulsos.

### 2. Nova seção "Contratos anteriores deste paciente"
No mesmo arquivo, dentro da aba **Resumo**, logo abaixo dos 3 cards.

Consulta: `contratos_assinatura` do mesmo `paciente_id`, exceto o contrato atual, com `count` e `count filter (status='pago')` de `contrato_mensalidades` por contrato.

Renderização em tabela compacta:

```text
Nº contrato   Convênio            Início      Parcelas   Pagas   Status
20260618      Cartão consulta     01/06/2025  12         12/12   Quitado
```

Cada linha clicável abre o contrato correspondente (reaproveita `setContratoAberto`). Se não houver contratos anteriores, a seção não aparece.

### 3. Nova seção "Recebimentos avulsos do paciente" (opcional, dentro do drill)
Já existe `extraRecebido`. Vou apenas:
- Manter a lista no drill "Recebido" (renomeada para "Recebimentos avulsos históricos", com aviso "não são parcelas deste contrato").
- Removê-la totalmente do drill "Pagas".

## Detalhes técnicos

- Consulta adicional no `load()`:
  ```sql
  SELECT c.id, c.numero, c.status, c.data_inicio,
         cv.nome AS convenio,
         count(m.id) AS parcelas,
         count(m.id) FILTER (WHERE m.status='pago') AS pagas
  FROM contratos_assinatura c
  LEFT JOIN contrato_mensalidades m ON m.contrato_id = c.id AND m.numero_parcela > 0
  LEFT JOIN cb_convenios cv ON cv.id = c.convenio_id
  WHERE c.paciente_id = :pid AND c.id <> :contrato_atual
  GROUP BY c.id, cv.nome
  ORDER BY c.created_at DESC;
  ```
- Filtro `numero_parcela > 0` exclui adesão (0) e taxa de inclusão (< 0), que não são parcelas mensais.
- Novo estado local `contratosAnteriores: Array<{id, numero, convenio, data_inicio, parcelas, pagas, status}>`.
- `pagasTotal` e `totalParcelas` passam a considerar apenas `mensalidades` (filtrando `numero_parcela > 0` para bater com "12/12").

## Fora do escopo
- Não vou mexer nos lançamentos financeiros históricos existentes.
- Não vou tentar "casar" retroativamente os 184 lançamentos avulsos a contratos antigos importados — não há como saber a qual contrato cada um pertencia sem regra do time.
- Não vou alterar a listagem principal `/app/cartao-beneficios/contratos`, apenas o detalhe do contrato aberto.
