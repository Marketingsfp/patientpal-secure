## Regra de precedência (confirmada com você)

Tipo do pedido: **regra de negócio + erro de código**.

Como o sistema deve escolher a regra de preço, do mais específico para o mais genérico:

```text
1. Regra do serviço específico (procedimento)     ← vence tudo
2. Regra da especialidade + tipo                  ← ex.: Odontologia + procedimento
3. Regra só da especialidade                      ← vale para toda a Odontologia
4. Regra só do tipo
5. Regra genérica do convênio
```

Se o tipo estiver preenchido, ele **filtra de verdade**: uma regra "Odontologia + procedimento" nunca se aplica a um serviço de outro tipo. Existindo as duas (com tipo e sem tipo), a com tipo vence. Isso já é o comportamento atual do código e será **preservado sem alterações** — a proposta anterior de afrouxar esse casamento está descartada.

Empate de especificidade continua com as regras atuais: gratuidade vence desconto, e a prioridade cadastrada só desempata entre regras do mesmo tipo.

## Diretriz do orçamento

O orçamento permanece **sempre no valor particular**. O desconto do convênio é decidido só no momento do pagamento, porque a situação do contrato pode mudar entre o orçamento e a cobrança (mensalidade em atraso, contrato cancelado) — e um orçamento com desconto já embutido não teria como ser ajustado.

Com isso, a causa do caso do JEAN XAVIER é uma só: **a agenda não reavalia o convênio quando o valor vem de um orçamento**. Ela usa exclusivamente os valores gravados (particular), e por isso saiu R$ 190,00 sem os 5%.

## O que será feito

**1. Orçamento continua 100% particular**
Nada muda no valor gravado: nenhum campo de convênio, nenhuma pré-seleção de preço, nenhum desconto salvo. Único acréscimo, apenas informativo: quando o paciente tem convênio ativo, uma nota discreta "Paciente possui CARTÃO CONSULTA + SEGUROS — desconto será aplicado no pagamento".

**2. Desconto calculado no faturamento da agenda**
Quando o pagamento vem de um orçamento, a agenda passa a rodar a mesma avaliação de benefício dos atendimentos comuns, no momento da cobrança:
- busca o contrato ativo do paciente na clínica;
- valida elegibilidade naquele instante (carência, situação da mensalidade, tolerância de 5 dias já existentes);
- aplica a regra vencedora pela precedência acima sobre o valor particular do item;
- sem contrato válido, sem regra aplicável ou mensalidade em atraso além da tolerância → cobra particular.

O desconto respeita a forma de pagamento (dinheiro x cartão/PIX), como no resto do sistema.

**3. Transparência no modal de pagamento**
Havendo benefício: valor do orçamento (particular), desconto aplicado, valor a cobrar e nome do convênio. Havendo convênio mas **sem** benefício aplicado: motivo em destaque — "mensalidade em atraso", "dentro da carência", "serviço sem regra cadastrada" — para o caixa conferir antes de receber.

**4. Compatibilidade com sinal/saldo e seleção parcial**
O desconto incide só sobre os itens efetivamente selecionados no agendamento. Em cobranças por etapas, o desconto é aplicado sobre o item e as parcelas de sinal/saldo são recalculadas proporcionalmente, sem alterar o total do orçamento original.

**5. Aviso de cadastro na aba Regras de Preço (sem afetar cobrança)**
Selo de alerta na regra cuja combinação especialidade + tipo não corresponde a nenhum serviço ativo — ex.: regra "Odontologia + exame" quando não existe serviço de Odontologia com esse tipo. Puramente informativo, para a equipe corrigir no cadastro antes de virar preço errado no caixa. Nenhuma regra é desativada nem alterada automaticamente.

## Fora do escopo

- Não altero, recalculo nem reaplico valores de Cartão Consulta / + Seguros por script ou migração (regra 1.10 do AGENTS.md). Relato apenas: dos 180 serviços de Odontologia da clínica, os 180 têm valor no CARTÃO CONSULTA, mas só 27 no CARTÃO CONSULTA + SEGUROS. A reaplicação é manual, pela tela do convênio.
- Não altero a lógica de precedência/casamento de regras (`findRegra`) — fica como está.
- Não reprocesso o pagamento de R$ 190,00 já feito; seria estorno/refaturamento manual, posso orientar o passo a passo.
- Nenhuma alteração de banco.

## Detalhes técnicos

- Sem migração. `orcamentos` / `orcamento_itens` inalterados.
- `src/routes/_authenticated/app.agenda.tsx` (`opcoesPagamentoDeOrcamento`): após somar os itens vinculados ao agendamento, avaliar o benefício por item via `cb-regras` (`procedimento_id`, especialidade, tipo, contrato ativo, forma de pagamento) e devolver `valorParticular`, `valorComBeneficio`, `convenioNome`, `motivoNaoAplicado`.
- `src/lib/agenda/sinal-orcamento.ts`: aplicar o fator de desconto por item antes de dividir em sinal/saldo.
- `src/components/financeiro/lancamento-dialog.tsx`: bloco "Convênio aplicado / não aplicado" com os três valores.
- `src/lib/cb-regras.ts`: **sem mudanças** na função de casamento.
- `src/components/odontologia/add-to-orcamento-dialog.tsx`: apenas a nota informativa; `salvar` inalterado.
- `src/components/cartao-beneficios/regras-tab.tsx`: selo "sem serviço correspondente".
- Validação: typecheck + teste prático — faturar um item odontológico do JEAN XAVIER (contrato 20261933) e conferir os 5% na cobrança, com o orçamento permanecendo em valor cheio.
