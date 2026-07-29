## 1. GR de atendimento externo: título único

Em `src/lib/print-gr.ts`, hoje saem duas linhas: "GUIA DE ATENDIMENTO" e, logo abaixo, o selo "*** ATENDIMENTO EXTERNO ***".

- Quando o agendamento for externo, imprimir uma única linha: **"GUIA DE ATENDIMENTO EXTERNO"** (mesmo destaque atual).
- Manter abaixo as linhas "ORIGEM: <clínica>" e "SEM COBRANCA NESTA UNIDADE".
- Guia normal segue como está ("GUIA DE ATENDIMENTO").

## 2. Repasse de R$ 55,00 no Financeiro — causa confirmada

Verifiquei o registro do atendimento da Quédima (29/07, CONSULTA (CARDIOLOGIA), origem Policlínica São Francisco de Paula):

- Em `fin_atendimentos` está gravado corretamente `valor_medico = 40,00`, `valor_total = 0`, `forma_pagamento = 'externo'` — é o valor calculado no diálogo com o convênio marcado (é o que sai na GR: PRESTADOR 40,00).
- A tela **Financeiro → Atendimentos** **descarta** esse valor gravado: para toda linha de origem "manual" ela **recalcula** o repasse (`calcRepasseFull`). Sem pagamento em caixa (valor 0) e sem a modalidade de convênio do paciente no mapa da tela, ela casa a regra de convênio por nome do serviço com repasse fixo e devolve **55,00**, sobrescrevendo os 40,00.
- Ou seja: o erro não está no cálculo do atendimento externo, e sim na tela financeira que recalcula por cima.

Correção em `src/routes/_authenticated/app.financeiro.atendimentos.tsx`:

- Nas linhas com `forma_pagamento = 'externo'`, **não recalcular**: usar exatamente `valor_medico` e `valor_total` gravados, com `valor_clinica = 0`.
- Assim o Financeiro passa a bater com a GR e com o que foi decidido na hora do registro (com ou sem convênio).

## 3. Registrar o convênio no atendimento externo (evita reincidência)

Hoje o diálogo envia `convenio_id`, mas a server function `marcarAtendimentoExterno` ignora esse dado — por isso o agendamento fica como `tipo_atendimento = 'particular'` e a GR imprime "CONV: PARTICULAR" mesmo com plano marcado.

- Gravar no agendamento o vínculo de convênio informado (tipo de atendimento / convênio) ao marcar o externo.
- Com isso a GR passa a exibir o nome do convênio e qualquer tela que dependa da modalidade enxerga o plano.

## 4. Acerto do registro existente

Após a correção, conferir a linha da Quédima no Financeiro: deve mostrar repasse **40,00** e clínica **0,00**. O registro no banco já está correto, não precisa de alteração de dados.

## Detalhes técnicos

- Arquivos: `src/lib/print-gr.ts` (título e selo), `src/routes/_authenticated/app.financeiro.atendimentos.tsx` (bypass do recálculo para `externo`), `src/lib/agenda/atendimento-externo.functions.ts` (persistir convênio).
- Sem migração de banco necessária (usa colunas já existentes de convênio/tipo de atendimento no agendamento).
