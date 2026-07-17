## Problema

Ao clicar em "Incluir dependente" no contrato, o campo **Valor (R$)** aparece em R$ 0,00 mesmo com o convênio tendo `taxa_inclusao_dependente` configurado (ex.: CARTÃO CONSULTA = R$ 30,00).

## Causa

A inicialização dos campos do diálogo (`incCobrarTaxa`, `incTaxaValor`, `incTaxaVenc`) está dentro do callback `onOpenChange` do `<Dialog>` (contratos-page.tsx linhas 3914–3928). Como o diálogo é aberto programaticamente pelo botão (`setIncOpen(true)` na linha 3512), o Radix **não dispara** `onOpenChange` nesse caso — ele só dispara para interações iniciadas pelo próprio Dialog (ESC, overlay, botão close). Resultado: o bloco de inicialização nunca roda e o campo Valor fica em 0.

## Correção

Extrair a inicialização para uma função `inicializarIncluirDependente()` e chamá-la no `onClick` do botão "Incluir dependente" (linha 3512), antes de `setIncOpen(true)`. Manter também a chamada dentro de `onOpenChange` como redundância inofensiva (caso o diálogo passe a ser reaberto por outro caminho).

Nenhuma outra alteração de escopo — apenas garantir que o valor padrão da taxa (vindo de `cb_convenios.taxa_inclusao_dependente`) seja aplicado toda vez que o diálogo abre.

## Validação

- Abrir contrato de convênio com taxa configurada → clicar Incluir dependente → campo Valor deve exibir o valor do convênio (ex.: R$ 30,00) já preenchido e travado.
- Abrir em contrato com data_início = hoje → checkbox "Cobrar taxa" deve vir desmarcado (regra mesmo-dia preservada).
- Convênios sem taxa (0) → mantém R$ 0,00 (comportamento atual correto).

## Fora de escopo

Nenhuma mudança em regra de cobrança, banco, ou no fluxo de salvar.
