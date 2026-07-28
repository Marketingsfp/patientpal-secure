## Objetivo

Hoje, ao faturar na agenda um agendamento vindo de orçamento odontológico com entrada, o sistema mostra apenas números somados (Total • Já pago • Falta pagar). Não dá para saber **qual item** tem entrada nem **quanto** é a entrada de cada um.

A mudança é só de exibição: passar a listar item a item.

## O que vai aparecer

Na janela de faturamento (lançamento no caixa), dentro do bloco "Orçamento com entrada", uma lista com uma linha por item:

```text
RESTAURACAO RESINA FOTOPOLIMERIZAVEL   [Entrada R$ 60,00]
Total R$ 120,00 · Já pago R$ 60,00 · Falta R$ 60,00

ACESSO PULPAR                          [sem entrada]
Total R$ 140,00 · Já pago R$ 0,00 · Falta R$ 140,00
```

Itens com entrada ganham um selo destacado "Entrada R$ X". Abaixo da lista permanecem os totais gerais e o campo "Pagando agora / Falta pagar" já existente.

Além disso, na janela "Escolher itens do orçamento" (usada ao agendar), cada item com entrada passa a exibir o selo "Entrada R$ X" ao lado do valor, para o atendente já saber o que será cobrado como entrada.

## Como será feito (parte técnica)

1. `src/lib/agenda/sinal-orcamento.ts`
   - `obterEtapaSinal` passa a retornar também `itens: { id, descricao, total, sinal, pago, restante }[]`, buscando `descricao` junto na consulta de `orcamento_itens`.
   - Nenhuma mudança na regra de cálculo ou de gravação de pagamento.

2. `src/routes/_authenticated/app.agenda.tsx`
   - O estado `saldoOrcResumo` passa a carregar a lista de itens vinda de `obterEtapaSinal`.

3. `src/components/financeiro/lancamento-dialog.tsx`
   - A prop `resumoSaldo` recebe o array de itens e renderiza a lista descrita acima acima dos totais.

4. `src/components/agenda/selecionar-itens-orcamento-dialog.tsx`
   - `SelectItemOrc` ganha `sinal_valor`; a agenda passa esse campo ao montar `itensRestantes`; o item exibe o selo "Entrada R$ X".

## Fora do escopo

- Nenhuma alteração em regras de cobrança, distribuição de valores, impressão (GR/orçamento) ou banco de dados.
