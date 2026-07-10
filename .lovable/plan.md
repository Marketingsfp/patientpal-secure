## Objetivo

Ao vender um cartão (contrato de convênio), cobrar juntos **mensalidade #1 + taxa de adesão**, mas imprimir **duas GRs separadas** e gerar **dois lançamentos financeiros distintos**. A partir da parcela 2, só sai a GR da mensalidade.

## Mudanças

### 1. Marcar a taxa de adesão na parcela 1

No banco: adicionar coluna em `contrato_mensalidades`:

- `taxa_adesao NUMERIC(12,2) DEFAULT 0` — valor da taxa embutido nesta parcela (0 nas demais).

Na criação do contrato (`src/components/pages/contratos-page.tsx`, geração das parcelas na função de salvar):

- Parcela 1: `taxa_adesao = convenio.taxa_adesao` (do contrato).
- Parcelas 2..N: `taxa_adesao = 0`.
- O campo `valor` de cada parcela continua sendo só a mensalidade (não somar a taxa) — a taxa fica destacada.

### 2. Diálogo de forma de pagamento (parcela 1)

Quando `pagMens.taxa_adesao > 0`:

- Mostrar as duas linhas no cabeçalho: "Mensalidade R$ X,XX + Taxa de adesão R$ Y,YY = Total R$ Z,ZZ".
- Multa/juros por atraso continuam aplicando só sobre a mensalidade.
- O valor total exibido nos botões de forma de pagamento passa a ser `mensalidade + taxa`.

### 3. Pagamento: dois lançamentos + duas GRs

Ao confirmar o pagamento da parcela 1 com taxa de adesão:

1. **Lançamento da mensalidade** (fluxo atual, categoria `MENSALIDADE CARTAO CONSULTA`) — valor da parcela.
2. **Lançamento da taxa de adesão** — novo, categoria fixa `TAXA DE ADESAO CARTAO`, mesma forma de pagamento escolhida pelo operador.
3. Marca a parcela como paga (com `pago_em`, `valor_pago = mensalidade + taxa`).
4. Imprime **GR da mensalidade** (função existente `printGuiaMensalidade`, com valor da parcela apenas).
5. Imprime **GR da taxa de adesão** — novo tipo de guia (`printGuiaTaxaAdesao`) em `src/lib/print-gr.ts`, seguindo o mesmo layout da GR de mensalidade mas com:
   - Título "TAXA DE ADESÃO — CARTÃO DE BENEFÍCIOS"
   - Descrição "TAXA DE ADESÃO — CONTRATO #N — <PLANO>"
   - Numeração de vias própria (nova coluna `gr_impressoes.taxa_adesao_contrato_id` para controle de reimpressão).

Se o operador escolher pagamento misto, o rateio digitado se aplica ao **total**; o sistema divide proporcionalmente entre os dois lançamentos apenas para fins de registro contábil (o operador vê uma única cobrança). Simplificação: usar a mesma forma+detalhe no lançamento da mensalidade e no da taxa, cada um com seu próprio `valor`.

### 4. Categoria financeira

Migration cria (se não existir) a categoria `TAXA DE ADESAO CARTAO` em `fin_categorias` por clínica, tipo `receita`. O `LancamentoDialog` já suporta `categoriaFixaNome`.

### 5. Reimpressão

Aba "Contrato > parcelas": no botão "Imprimir GR" da parcela 1, quando `taxa_adesao > 0`, imprimir as duas guias em sequência.

## Detalhes técnicos

- **Schema** (`supabase--migration`):
  - `ALTER TABLE contrato_mensalidades ADD COLUMN taxa_adesao NUMERIC(12,2) NOT NULL DEFAULT 0`.
  - `ALTER TABLE gr_impressoes ADD COLUMN tipo TEXT` (valores: `mensalidade` | `taxa_adesao`) — para separar as vias das duas guias no mesmo mensalidade_id.
  - Backfill: `UPDATE gr_impressoes SET tipo='mensalidade' WHERE tipo IS NULL`.
  - Seed idempotente da categoria `TAXA DE ADESAO CARTAO` por clínica.

- **Front** (`src/components/pages/contratos-page.tsx`):
  - Interface `Mens` recebe `taxa_adesao`.
  - Geração de parcelas grava `taxa_adesao` só na parcela 1.
  - `pagValorFinal` para a parcela 1 passa a somar `taxa_adesao`.
  - `onSavedWithData` do `LancamentoDialog` da parcela 1: insere um segundo `fin_lancamentos` com a taxa e chama a nova `printGuiaTaxaAdesao`.

- **GR** (`src/lib/print-gr.ts`):
  - Nova função `printGuiaTaxaAdesao({ mensalidadeId, clinicaId, ..., pagamento: { valor: taxaAdesao, ... } })`.
  - Passa `tipo: 'taxa_adesao'` no insert de `gr_impressoes`.
  - `printGuiaMensalidadeCore` passa `tipo: 'mensalidade'` e usa esse filtro ao consultar vias existentes.

- **Nada muda** para contratos existentes: `taxa_adesao` fica 0 nas parcelas já criadas, então nenhum comportamento antigo altera.

## Ordem de execução

1. Migration (schema + backfill + categoria).
2. Nova função `printGuiaTaxaAdesao` + filtro por `tipo` em `printGuiaMensalidadeCore`.
3. Ajustes em `contratos-page.tsx` (criação, exibição, pagamento, reimpressão).
4. Typecheck.