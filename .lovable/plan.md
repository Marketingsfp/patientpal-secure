## Objetivo

Ao alterar a **Data início** de um contrato de cartão benefício para uma data no passado, o sistema pergunta quantas mensalidades já foram pagas nesse intervalo e regenera as 12 parcelas do contrato: as **N primeiras** ficam **pagas** e as **restantes pendentes**.

## Fluxo

1. Na aba **Dados** do contrato (perfil ADM/Caixa), ao clicar em **"Atualizar contrato"**, comparar `admDataInicio` com `contrato.data_inicio`.
2. Se a nova data é **anterior** à atual e **anterior** ao mês vigente:
   - Salva os campos do contrato como já faz hoje.
   - Abre um diálogo `AlertDialog`:
     - Título: "A data de início foi movida para o passado"
     - Texto: "Já existem parcelas pagas nesse intervalo? Informe quantas para o sistema marcar como pagas e gerar apenas as restantes."
     - Campo numérico "Parcelas já pagas" (default = meses cheios entre `admDataInicio` e hoje, limitado a 12).
     - Botões: **Confirmar e regenerar** / **Cancelar** (só salva o contrato, não mexe em parcelas).
3. Ao confirmar:
   - Apaga todas as mensalidades **pendentes** do contrato.
   - Gera **12 parcelas mensais** a partir do mês de `admDataInicio`, usando `valor_mensal` e `dia_vencimento` atuais.
   - As **N primeiras** parcelas ficam com `status = 'pago'`, `pago_em = vencimento` e `valor_pago = valor`. As demais, `status = 'pendente'`.
   - Toast de sucesso.
4. Se a data mudou mas **não** é passada (mesma ou futura), fluxo atual permanece — nenhum diálogo, nenhuma regeneração automática.

Nenhum lançamento em `fin_lancamentos` é criado para as parcelas retroativas — só a mensalidade é marcada como paga.

## Detalhes técnicos

Arquivo: `src/components/pages/contratos-page.tsx` (componente `ContratoDetail`).

- Novo state: `retroDialog: { open, parcelasPagas: string } | null`.
- Refatorar `salvarContratoAdmin`:
  - Antes de gravar, capturar `dataInicioAntiga = contrato.data_inicio`.
  - Após o `update` bem-sucedido, se `admDataInicio < dataInicioAntiga` e `admDataInicio` está em mês anterior ao atual, calcular `mesesCheios = clamp(monthsBetween(admDataInicio, hoje), 0, 12)` e abrir o diálogo com `parcelasPagas = mesesCheios`.
- Nova função `regerarComPagas(n: number)`:
  - `DELETE FROM contrato_mensalidades WHERE contrato_id = X AND status = 'pendente'`.
  - Loop `i = 0..11`: monta `vencimento = addMonths(admDataInicio, i)` ajustado para `dia_vencimento` (com clamp para último dia do mês). `numero_parcela` = próximo disponível.
  - Para `i < n`: `status='pago'`, `pago_em=vencimento`, `valor_pago=valor`.
  - Para `i >= n`: `status='pendente'`.
  - `INSERT` em lote.
  - `await load()` para recarregar a tabela de mensalidades da aba Mensalidades.
- Diálogo usa componentes já disponíveis (`Dialog`, `Input type=number`, `Button`).

Observação: o botão existente **"Regerar 12 parcelas futuras com este valor e dia"** (`salvarDadosFinanceiros`) permanece intacto e continua servindo para propagar valor/dia sem alterar data de início.