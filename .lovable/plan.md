## O que aconteceu (causa confirmada)

Tipo do pedido: **erro de código + inconsistência de dados**.

Quando você usa **"Desmarcar paciente"** na agenda, o sistema libera o horário: apaga o paciente, o procedimento e volta o nome para "DISPONÍVEL", mantendo o status como `agendado`. Porém **o vínculo do item de orçamento com aquela ficha não é apagado**.

Depois, ao agendar o mesmo item de novo, a verificação de duplicidade procura vínculos cujo agendamento não esteja "cancelado" — e o registro desmarcado continua "agendado". Por isso apareceu o aviso, e por isso ele veio sem nome de serviço e sem ficha ("serviço", "s/ ficha"): o registro já estava vazio.

Confirmação no banco: existem hoje vínculos de itens de orçamento apontando para fichas com `paciente_id` nulo e nome "DISPONIVEL" (inclusive uma de 28/07/2026 às 11:20, exatamente a do seu alerta).

## O que será feito

1. **Desmarcar passa a limpar o vínculo** (`src/routes/_authenticated/app.agenda.tsx`, função de desmarcar/liberar horário): antes de liberar a ficha, remover as linhas de `agendamento_orcamento_itens` daquele agendamento — assim o item volta a ficar 100% livre para novo agendamento e pagamento.

2. **Blindagem na verificação de duplicidade** (mesmo arquivo): além de ignorar agendamentos cancelados, ignorar também fichas sem paciente (`paciente_id` nulo / "DISPONÍVEL"). Vale para as duas checagens que hoje filtram só por "cancelado", inclusive a de itens já consumidos. Isso evita o alerta falso mesmo em registros antigos.

3. **Limpeza dos dados órfãos já existentes**: apagar os vínculos de itens de orçamento presos a fichas sem paciente. Nenhum agendamento, pagamento ou orçamento é alterado — apenas o vínculo inválido. Antes de executar, listo quantas linhas serão removidas para sua conferência.

## Fora do escopo

- Não muda a regra de aviso quando há de fato outro agendamento ativo e não pago (esse aviso continua).
- Não altera valores, orçamentos, GR ou fluxo de pagamento.
- Não mexe em contratos/Cartão Consulta.

## Validação prevista

- Typecheck.
- Teste prático sugerido: agendar item do orçamento D-2026-00002, desmarcar e reagendar — não deve mais aparecer o aviso, e o item deve permanecer selecionável.
