## Objetivo

Permitir que um item do orçamento de Odontologia seja pago em duas etapas: **sinal** (entrada, no início do tratamento) e **saldo restante** (ao final). A cobrança acontece na Agenda, e o sistema sabe automaticamente qual etapa está sendo paga.

Tipo de pedido: regra de negócio + banco de dados + interface (orçamento e agenda).

Escopo de clínica (Regra 1.10): confirmado — vale para as **3 clínicas**, sem feature flag.

## Regras acordadas

- O sinal é informado em **valor em R$** direto no item do orçamento.
- Com o sinal pago, o item já é considerado liberado: o paciente pode ser agendado e atendido normalmente.
- Na agenda, o primeiro pagamento do item cobra o **sinal**; o segundo cobra o **saldo restante**. O valor vem preenchido, sem o usuário precisar calcular.
- Itens sem sinal continuam funcionando exatamente como hoje (pagamento único).

## Banco de dados (migração)

Na tabela `orcamento_itens`, adicionar:

- `sinal_valor` — valor da entrada em reais (vazio = item sem parcelamento, comportamento atual).
- `valor_pago` — quanto já foi recebido do item (soma dos pagamentos).
- `sinal_pago_em` e `saldo_pago_em` — datas de cada etapa, para histórico.

O campo `status_financeiro` ganha um novo estado **`parcial`** (sinal recebido, saldo em aberto), somando-se aos já existentes (pendente, pago, estornado, isento, não aplicável).

Nenhum dado existente é alterado: todos os itens atuais ficam sem sinal e seguem o fluxo de pagamento único.

## Orçamento de Odontologia

Na tela de novo orçamento odontológico e na edição de itens:

- Cada item ganha o campo opcional **"Sinal (entrada) R$"**, com validação para não ultrapassar o valor total do item.
- Ao lado, o sistema mostra automaticamente **"Saldo: R$ X"**.
- No card e no drawer do orçamento, itens com sinal exibem uma etiqueta indicando a situação: *Sinal pendente*, *Sinal pago — saldo R$ X* ou *Quitado*.
- Na impressão do orçamento, itens com sinal mostram a divisão entrada/saldo.

## Agenda

Ao cobrar um item de orçamento com sinal configurado:

- Se ainda não houve pagamento, a cobrança abre com a **etapa "Sinal"** e o valor da entrada já preenchido.
- Se o sinal já foi pago, abre com a **etapa "Saldo restante"** e o valor que falta.
- A tela mostra um resumo: valor do item, já pago e saldo.
- Depois de confirmar, o item passa para *parcial* (sinal) ou *pago* (saldo quitado), com data registrada.
- Um item apenas com sinal pago já conta como pago para liberar triagem e atendimento (regra atual de `pagamento-status`), mas continua aparecendo como pendente de saldo nas listas de orçamento.

## Fora do escopo

- Nenhuma mudança em contratos, cartão benefícios, NFS-e ou repasses.
- Nenhuma alteração no cálculo de descontos ou nas regras de convênio.
- Parcelamento em mais de duas etapas (só sinal + saldo por enquanto).

## Validação

- Criar um orçamento odontológico com um item de valor conhecido e sinal definido; conferir o saldo calculado na tela e na impressão.
- Agendar esse item, cobrar na agenda e confirmar que o valor sugerido é o do sinal e que o item fica *parcial*.
- Cobrar novamente e confirmar que aparece só o saldo e que o item fica *pago*.
- Conferir que um item sem sinal continua com o comportamento atual de pagamento único.
