## Diagnóstico do caso "Quédima"

Os agendamentos da Quédima de 22/05/2026 já estão na etapa **`triagem`** no banco — ou seja, o check-in já foi feito (ou ela foi avançada manualmente). Por isso ela não aparece na tela, que hoje só lista pacientes nas etapas `aguardando_recepcao` / `recepcao`.

Além disso, a tela atual exige **dois filtros simultâneos**:
1. etapa = `aguardando_recepcao` ou `recepcao`
2. existe lançamento financeiro (`fin_lancamentos`) vinculado ao agendamento

Se o pagamento não foi registrado no sistema (mesmo que a paciente tenha pago de fato), ela some da lista.

## O que será alterado em `src/routes/_authenticated/app.checkin.tsx`

1. **Botão "Buscar"** ao lado do campo de busca (ícone de lupa + texto).
2. **Comportamento padrão (ao abrir a tela ou trocar a data)**: continua igual — lista apenas pacientes do dia, em etapa de recepção, **já pagos**. Esse é o caso normal usado pela atendente.
3. **Ao clicar em "Buscar"** (com ou sem texto):
   - Passa para um modo "busca ampla" daquela data.
   - Mostra **todos os agendamentos do dia** cujo `fluxo_etapa` ainda é `aguardando_recepcao` ou `recepcao` (ou seja, que ainda não fizeram check-in), **independentemente de ter pagamento registrado**.
   - Se o campo de busca tiver texto, filtra por nome ou CPF dentro desse conjunto.
   - Se estiver vazio, mostra todos.
4. **Indicação visual de pagamento**: no modo ampliado, cada card mostra um Badge:
   - verde "PAGO" — quando há `fin_lancamentos` confirmado
   - âmbar "PAGAMENTO PENDENTE" — quando não há lançamento (atendente decide se confirma assim mesmo)
5. **Botão "Limpar"** para voltar ao modo padrão (somente pagos).
6. O Enter no input dispara o mesmo "Buscar".

## Detalhes técnicos

- A busca por texto continua sendo case/acento-insensível (já temos `normalizar()`) e aceita CPF com/sem máscara.
- A query de `fin_lancamentos` permanece, mas no modo ampliado ela passa a ser usada **apenas para marcar o badge** — não mais para filtrar a lista.
- Mantemos a confirmação de presença (botão "Confirmar presença") igual, que avança o `fluxo_etapa` para `triagem`.
- Nada muda no banco de dados nem em outras telas.

## Sobre a Quédima especificamente

Ela já está em `triagem` nesta data, então mesmo com o botão "Buscar" novo ela não apareceria na lista de check-in (porque a etapa dela é posterior). Se você quer que pacientes já avançados também apareçam para um eventual "desfazer", me avise — posso incluir um filtro extra "Mostrar também já check-inados", mas isso não estava no pedido inicial.