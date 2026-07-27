## Objetivo

Remover o botão de conversão (o ícone de setas no card, que abre a tela "Conversão do orçamento" com as ações de venda/pagamento) da aba **Odontologia → Orçamento**. Essa tela passa a servir apenas para criar e consultar o orçamento; o pagamento será feito exclusivamente pela Agenda.

Tipo de pedido: ajuste de interface com efeito em regra de uso (caminho de pagamento).

Escopo de clínica (Regra 1.10): a aba de Odontologia é a mesma nas 3 clínicas, então a remoção vale para todas. Se quiser restringir a uma clínica, me avise que faço com feature flag por `clinica_id`.

## O que muda

Em `src/components/odontologia/orcamento-tab.tsx`:

- O card do orçamento deixa de exibir o botão de conversão (ícone de setas). Continuam disponíveis abrir o orçamento (drawer) e imprimir.
- No drawer lateral do orçamento, o botão **Converter** também é removido; ficam **Imprimir** e o restante das informações.
- A tela de conversão (`ConversaoOrcamentoDialog`) deixa de ser aberta a partir de Odontologia — o componente continua existindo e funcionando no menu **Orçamentos**, que não é alterado.

Para isso, os componentes compartilhados `OrcamentoCard` e `OrcamentoDrawer` ganham uma propriedade opcional para ocultar a ação de conversão; o menu Orçamentos segue exatamente como está hoje.

## Fora do escopo

- Nenhuma mudança no menu Orçamentos, na Agenda, no financeiro ou no banco de dados.
- Nenhuma função do banco é removida (apenas deixa de ser chamada por esta tela).

## Validação

- Abrir Odontologia → Orçamento com um paciente que tenha orçamento e confirmar que o botão de conversão sumiu do card e do drawer, e que imprimir e visualizar continuam funcionando.
- Abrir o menu Orçamentos e confirmar que o botão de conversão continua lá, inalterado.
