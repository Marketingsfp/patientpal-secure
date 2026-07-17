## Diagnóstico
O erro da foto 2 vem da função de renovação no backend: ela só aceita renovar contrato com `status = 'ativo'` e sem cancelamento. Consultei o contrato da paciente Quédima e encontrei este cenário:

- Contrato original `#20261894`: já ficou com `status = renovado` e `renovado_em` preenchido.
- Foi criado um novo contrato `#20261895`, mas ele está `cancelado`.
- Ao tentar renovar de novo o contrato original, o backend bloqueia com `Contrato nao esta ativo`.

Ou seja: o sistema já registrou uma renovação anterior e, por isso, não deve permitir uma segunda renovação pelo mesmo botão. O erro da foto 1 é a confirmação normal antes de executar; o problema é que o botão continuou disponível depois da renovação.

## Tipo do pedido
- Regra de negócio: contrato já renovado não deve renovar novamente pelo mesmo botão.
- Erro de experiência do usuário: botão ainda clicável e mensagem técnica aparecendo.
- Inconsistência operacional percebida: renovação anterior gerou contrato novo que depois foi cancelado.

## Plano de correção
1. Finalizar o ajuste no botão `RENOVAÇÃO` em `src/components/pages/contratos-page.tsx`:
   - Se houver registro em `contrato_renovacoes` para o contrato atual, o botão fica desabilitado.
   - Ao passar o mouse, mostra `Renovado em DD/MM/AAAA`.
   - Se não houver renovação e todas as mensalidades estiverem pagas, mantém o botão vermelho ativo.

2. Melhorar a proteção visual pelo status do contrato:
   - Se `contrato.status` for `renovado`, o botão também fica desabilitado mesmo que a consulta de histórico ainda esteja carregando.
   - Isso evita nova tentativa antes de terminar a leitura do histórico.

3. Melhorar o tratamento do erro no diálogo de renovação:
   - Mapear `Contrato nao esta ativo` para mensagem amigável: `Este contrato já foi renovado, cancelado ou não está ativo.`
   - Orientação: `Use o contrato vigente do paciente para novas movimentações.`
   - Isso substitui o erro genérico `RENOVACAO_ERRO_GERAL`.

4. Após uma renovação concluída:
   - Atualizar o estado local `renovadoEm` imediatamente.
   - Recarregar os dados do contrato.
   - Assim o botão fica desabilitado sem depender do usuário atualizar a página.

## Fora de escopo
- Não vou alterar dados existentes da paciente nem reativar/cancelar contratos.
- Não vou mudar a regra de negócio de cancelamento do contrato novo.
- Não vou mexer em mensalidades ou valores financeiros.

## Validação
- Conferir no código que o botão fica desabilitado para contrato já renovado.
- Conferir que o tooltip mostra a data da renovação.
- Conferir que o erro técnico `Contrato nao esta ativo` passa a aparecer com identificação mais clara para o usuário.