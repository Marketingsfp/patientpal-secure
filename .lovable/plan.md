## Objetivo
Permitir marcar mensalidades como "já pagas anteriormente" **em contratos já criados**, sem precisar cancelar e refazer a venda, e sem gerar lançamento no caixa (é histórico, o dinheiro não entrou agora).

Hoje esse campo só existe na tela de criação. Já existe um `retroDialog` interno, mas ele só dispara quando o usuário move a data de início para o passado — não há entrada manual.

## Onde mexer
Arquivo único: `src/components/pages/contratos-page.tsx`.

### 1. Botão global no cabeçalho de "Mensalidades"
Ao lado de "Adicionar parcela", incluir botão **"Ajustar mensalidades já pagas"** (só visível se `podeEscrever` e contrato ativo).

- Abre o `retroDialog` existente, pré-preenchido com `dataInicio = contrato.data_inicio` e uma sugestão baseada em meses decorridos.
- Reaproveita `regerarComPagas(n)` que já apaga as 12 parcelas e regera com as N primeiras como `status=pago`, `pago_em`, `valor_pago` — **sem criar lançamento financeiro** (mesmo comportamento atual do fluxo de data retroativa).
- Ajustar o texto do diálogo para deixar claro: "Marca as N primeiras parcelas como pagas historicamente. Não gera movimento no caixa."

### 2. Ação por linha (opcional, mais cirúrgico)
Na tabela de mensalidades, em cada parcela `pendente`, adicionar item no menu de ações: **"Marcar como paga (histórica)"**.

- Atualiza a linha: `status='pago'`, `pago_em = vencimento`, `valor_pago = valor`, sem tocar em `contrato_mensalidades.lancamento_id` nem em `fin_lancamentos` / `caixa_movimentos`.
- Confirmação: "Esta parcela será marcada como paga historicamente e **não** aparecerá no caixa. Use apenas para regularizar pagamentos feitos fora do sistema."
- Espelhar botão **"Reverter para pendente"** só quando `pago_em` existe **e** não há `lancamento_id` (para não conflitar com o fluxo de estorno existente, que já cuida de pagamentos com lançamento no caixa).

### 3. Nada de mudança no schema, nada de RLS
As colunas `status`, `pago_em`, `valor_pago` já existem em `contrato_mensalidades`. Regras de escrita já passam pelo `podeEscrever` do módulo.

## Validação
- Typecheck.
- Testar em contrato ativo: abrir "Ajustar mensalidades já pagas" → informar 2 → confirmar que parcelas 1–2 ficam `pago` sem aparecer no caixa e 3–12 seguem pendentes.
- Testar ação por linha: marcar parcela 5 como paga histórica; conferir que não gerou movimento em `/app/caixa`.
- Confirmar que o botão de estorno existente **não aparece** em parcelas históricas (não têm `lancamento_id`), e que o botão "Reverter para pendente" limpa `status/pago_em/valor_pago`.

## Fora do escopo
- Não altero o fluxo de pagamento normal (GR, lançamento, caixa).
- Não mexo em contratos cancelados nem no cancelamento em si.
- Não altero cálculo de `Pagas`, `Recebido`, `A receber` — eles já leem `status`/`valor_pago`, então passam a refletir sozinho.