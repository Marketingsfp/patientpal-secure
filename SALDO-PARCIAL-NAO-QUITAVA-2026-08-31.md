# "Falta R$ ..." não saía da agenda depois da quitação — 31/08/2026

## O que a recepção viu

Um procedimento de R$ 400,00 (prótese da paciente ROSANGELA DAMASCENO) com
R$ 200,00 já recebidos. Na hora de receber os R$ 200,00 restantes, a agenda
continuava mostrando o selo **"Falta R$ 200,00"**, o atendimento continuava no
filtro **"Falta receber (parcial)"** e no banner de saldo devedor.

## O que estava errado (e o que NÃO estava)

A conta do saldo estava **certa**. Quem calcula é
[saldo-atendimento.ts:49](src/lib/agenda/saldo-atendimento.ts#L49), e a agenda
soma **todos** os recebimentos confirmados do atendimento, sem filtro de data
([app.agenda.tsx:2461](src/routes/_authenticated/app.agenda.tsx#L2461)) — um
pagamento de semanas atrás entra na soma normalmente.

O problema era outro: **o segundo pagamento nunca chegava a ser gravado.**

No diálogo de pagamento havia uma trava anti-cobrança-dupla, escrita antes de o
pagamento parcial existir. Ela perguntava apenas *"já existe algum lançamento
para este atendimento?"* — e, se existisse, recusava a gravação com a mensagem
"Este agendamento já possui um pagamento registrado" e fechava a tela.

```ts
// ANTES — src/components/financeiro/lancamento-dialog.tsx
supabase.from("fin_lancamentos")
  .select("id")                       // só a EXISTÊNCIA de um lançamento
  .eq("agendamento_id", agendamentoId)
  ...
if (tipo === "receita" && jaPagoRes.data) {
  toast.error("Este agendamento já possui um pagamento registrado.");
  return;                             // <— barrava a quitação do saldo
}
```

Ou seja: a quitação de um saldo devedor é, por definição, um **segundo**
lançamento no mesmo atendimento. A trava barrava exatamente isso. O dinheiro
nunca virava lançamento, a soma continuava em R$ 200,00 de R$ 400,00, e o selo
"Falta R$ 200,00" ficava eternamente na linha.

Confirmado nos dados de produção: os três atendimentos que hoje têm total
combinado (`valor_cobranca`) têm **exatamente um** lançamento cada. Nenhuma
quitação jamais passou.

## A correção

**1. A trava passou a olhar o saldo, não a existência de lançamento.**
Agora ela soma o que já foi recebido e compara com o total combinado. Bloqueia
só quando não há mais saldo em aberto. Nova regra em
[saldo-atendimento.ts](src/lib/agenda/saldo-atendimento.ts) —
`aceitaNovoRecebimento`:

- nenhum recebimento ainda → aceita;
- tem recebimento e **não** tem total combinado → recusa (atendimento comum:
  existir lançamento significa estar pago — o comportamento antigo, intacto);
- tem recebimento e tem total combinado → aceita enquanto a soma não alcançar o
  total (tolerância de meio centavo para arredondamento).

**2. A agenda avisa o diálogo quando está quitando um saldo.**
Nova propriedade `permiteSegundoPagamento`, ligada quando há saldo devedor
aberto ou quando é a etapa de saldo de um orçamento com sinal (esse caso não usa
`valor_cobranca`, então precisava do aviso explícito). Continua desligada na
cobrança agrupada, onde um segundo lançamento na origem atrapalharia o rateio.

## O que muda na tela

Ao registrar o recebimento que completa o valor:

- a soma passa a bater com o total, o atendimento vira **quitado**;
- o selo "Falta R$ ..." some e o botão de dinheiro volta de âmbar para verde;
- a linha sai do filtro "Falta receber (parcial)" e do banner de saldo devedor;
- a linha sai da tela **Financeiro › A Receber**;
- os R$ 200,00 recebidos hoje entram no caixa de **hoje**, no operador que
  registrou — o pagamento anterior continua no caixa do dia dele. Nada de caixa
  já fechado é reescrito.

## Arquivos alterados

- `src/components/financeiro/lancamento-dialog.tsx` — trava anti-cobrança-dupla
  passa a considerar o saldo; nova propriedade `permiteSegundoPagamento`.
- `src/lib/agenda/saldo-atendimento.ts` — nova função `aceitaNovoRecebimento`.
- `src/lib/agenda/saldo-atendimento.test.ts` — 5 testes novos da regra.
- `src/routes/_authenticated/app.agenda.tsx` — passa o aviso de "ainda há saldo"
  para o diálogo.

Sem alteração de banco. `bun test` 445/445, `tsc --noEmit` limpo, `eslint` sem
erros novos.

## O caso da ROSANGELA, na prática

Nos dados de produção existe **um só** recebimento desse atendimento: R$ 200,00
em dinheiro, registrados pela NICOLE hoje (31/08) às 11:35. Não há nenhum
lançamento nem movimento de caixa de R$ 200,00 dessa paciente em 13/08 — nem
nesse atendimento, nem em outro.

Então, depois de publicar, a recepção precisa registrar no sistema o pagamento
que falta. Basta clicar de novo no botão de dinheiro da linha (agora ele aceita)
e informar a data em que aquele dinheiro entrou de verdade:

- se entrou **hoje**, é só confirmar — soma no caixa de hoje;
- se entrou em **13/08**, coloque a data de 13/08: o sistema registra a
  quitação, o selo some, e a linha aparece no caixa de hoje como registro de
  R$ 0,00, sem inflar o dinheiro esperado da gaveta de hoje.
