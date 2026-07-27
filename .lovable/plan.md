## Objetivo

Remover, nas 3 clínicas, o botão **"Reaplicar a todos os serviços"** da aba Regras de Preço (Cartão Benefícios > Convênio) e também a rotina que ele executa, que regrava em massa a tabela de valores por serviço e sobrescreve valores digitados manualmente.

## Por que é seguro

Verifiquei no código:
- A **Agenda** e o **Caixa** calculam o valor do convênio lendo a **regra viva** (`cb_convenio_regras`), não a tabela de cache.
- A **grade de Serviços** também já calcula pela regra viva — há inclusive um comentário no código dizendo que o cache "nunca é lido aqui".
- A tabela de cache `procedimento_cb_convenio_valores` continua existindo e continua sendo gravada quando um serviço é cadastrado/editado individualmente (fluxo manual, que permanece intacto).

Ou seja: sem o botão, nenhum preço deixa de funcionar — apenas nada mais sobrescreve valores em massa.

## O que muda na tela

**Antes:** existia o botão "Reaplicar a todos os serviços", e o "Salvar" das regras chamava essa mesma rotina pedindo confirmação.

**Depois:**
- O botão some da barra da aba Regras de Preço.
- O "Salvar" apenas grava as regras e recarrega a lista — sem confirmação extra e sem tocar em valores de serviços.
- O cadastro/edição de valores por serviço continua igual, feito manualmente.

## Detalhes técnicos

Arquivo único: `src/components/cartao-beneficios/regras-tab.tsx`
1. Remover o `<Button ... onClick={() => reaplicar()}>` do cabeçalho da aba.
2. Remover a chamada `await reaplicar()` ao final da função de salvar.
3. Remover a função `reaplicar()` inteira e os estados/auxiliares que só ela usa (`reapplying`, `progress` e imports que ficarem órfãos).
4. Sem migração de banco, sem alteração de schema, sem alteração de dados.

## Fora do escopo

- Não altero nenhum valor de Cartão Consulta ou de qualquer convênio (regra 1.11 do AGENTS.md).
- Não mexo na tabela de cache nem em dados já gravados.
- Não mexo em outros botões de "reaplicar" do sistema (ex.: "Reaplicar juros e multa" em Contratos).

## Validação

- Abrir Cartão Benefícios > Convênio > Regras de Preço e confirmar que o botão sumiu e que "Salvar" grava normalmente.
- Conferir na Agenda que o valor de um serviço com regra continua sendo aplicado corretamente.
