## O que está acontecendo (causa confirmada no banco)

No orçamento D-2026-00002 (JEAN XAVIER FERREIRA PINHO) o item **IMPLANTE — R$ 2.200,00** tem entrada de R$ 340,00 já paga:

- `valor_pago = 340`, `status_financeiro = 'parcial'`, saldo de R$ 1.860,00
- está vinculado a um agendamento com status `agendado` que tem 1 lançamento de receita confirmado (a entrada)

O seletor "Escolher itens do orçamento" (na Agenda) marca um item como **consumido** quando o agendamento vinculado tem qualquer lançamento de receita confirmado. Como a entrada gerou um lançamento confirmado, o item foi tratado como quitado e sumiu da lista — restando só os dois itens sem entrada (foto 1).

Classificação: **erro de código / regra de consumo de item**, não erro de dados.

## O que será alterado

Um único ponto de regra, em `src/routes/_authenticated/app.agenda.tsx` (bloco que monta `itensRestantes`):

1. Um item só é considerado consumido quando estiver **realmente quitado**:
   - `status_financeiro = 'pago'`, **ou**
   - `valor_pago >= valor_total` (com tolerância de centavos).
2. O "pago via agendamento vinculado" (lançamento confirmado) deixa de consumir sozinho itens que tenham entrada/pagamento parcial: se `sinal_valor > 0` ou `valor_pago > 0` e ainda houver saldo, o item continua disponível para novo agendamento.
3. A consulta de itens passa a trazer também `valor_pago`, necessário para essa checagem.
4. Ajuste do texto/contagem: itens parciais entram como disponíveis, e o rótulo do item no seletor mostrará o saldo (ex.: "Entrada paga R$ 340,00 · Falta R$ 1.860,00") para o caixa saber que aquela seleção cobrará o saldo — ajuste em `src/components/agenda/selecionar-itens-orcamento-dialog.tsx`, usando os campos já disponíveis.

Nada muda no cálculo financeiro em si: ao selecionar o item parcial, `obterEtapaSinal` já retorna a etapa "saldo" com o valor restante correto (R$ 1.860,00), tanto no "Salvar e pagar" quanto no "Agendar > Pagar".

## Fora do escopo

- Nenhuma alteração em valores, lançamentos ou registros existentes do orçamento D-2026-00002 (não vou "corrigir" dados).
- Nenhuma mudança em GR, NFS-e, caixa ou nas regras de sinal/saldo.

## Validação

- Reabrir o orçamento D-2026-00002 na Agenda e confirmar que os 3 itens aparecem, com o IMPLANTE marcado como parcial e saldo R$ 1.860,00.
- Selecionar apenas o IMPLANTE e verificar que o pagamento sugerido é R$ 1.860,00 (etapa saldo).
- Confirmar que um item 100% pago continua sumindo da lista.
