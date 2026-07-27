## Objetivo

Orçamentos de Odontologia passam a ter numeração própria, no formato **D-2026-00001**, independente da numeração dos demais orçamentos. Vale para as 3 clínicas.

## Como é hoje (verificado)

- A tabela de orçamentos tem um campo `numero` inteiro preenchido por um gatilho no banco.
- O formato atual é ano + 5 dígitos por clínica (ex.: `202600086`), compartilhado por todos os orçamentos, inclusive os de Odontologia.
- A tela "Orçamento" de Odontologia não mostra o número hoje; a impressão mostra "ORÇAMENTO Nº".

## O que muda

1. **Série de numeração**
   - Novo campo de "série" no orçamento: vazio para os orçamentos normais e `D` para os de Odontologia.
   - Nova contagem: o primeiro orçamento odontológico de cada clínica em 2026 será `D-2026-00001`, o seguinte `00002`, e assim por diante — sem interferir na contagem atual.
   - Quando a faixa de 5 dígitos de um ano se esgotar (99999), a contagem continua de onde parou no ano seguinte, em vez de reiniciar.
   - Trava de concorrência e índice único por clínica + série + número, para nunca sair número repetido.
   - Orçamentos odontológicos já existentes mantêm o número antigo (nada é renumerado).

2. **Tela de Odontologia > aba Orçamento**
   - Nova coluna **Nº** como primeira coluna da tabela, exibindo `D-2026-00001`.
   - A busca por número passa a aceitar tanto `D-2026-00001` quanto só os dígitos.

3. **Detalhe e impressão**
   - O painel lateral do orçamento e a 2ª via impressa passam a mostrar o número formatado com a série (`D-2026-00001`) quando for odontológico; nos demais, segue como hoje.

## Detalhes técnicos

- Migração: coluna `serie text` em `orcamentos` (default vazio), backfill deixando os existentes na série atual, índice único `(clinica_id, serie, numero)` e ajuste da função `orcamentos_set_numero` para numerar por `(clinica_id, serie, ano)` com carry-over ao estourar a faixa.
- `novo-orcamento-odonto-dialog.tsx`: envia `serie: 'D'` no insert.
- Helper de formatação compartilhado (`formatNumeroOrcamento(serie, numero)`) usado em `orcamento-tab.tsx`, `orcamento-drawer.tsx`, `orcamento-card.tsx` e `print-orcamento.ts`.

## Fora do escopo

- Renumerar orçamentos antigos.
- Alterar a numeração dos orçamentos não odontológicos.
