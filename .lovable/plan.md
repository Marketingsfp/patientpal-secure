
## Objetivo

Quando um pagamento é lançado com **data retroativa** (ex.: hoje é 16/07 e a data do pagamento é 13/07), o movimento de caixa deve pertencer ao **dia do pagamento**, e não à sessão aberta de hoje. O lançamento no Financeiro (`fin_lancamentos.data`) continua correto — o problema está apenas em `caixa_movimentos`.

## Diagnóstico (o que acontece hoje)

- O diálogo de pagamento chama a função de banco `fn_registrar_lancamento_e_caixa`.
- Ela grava `fin_lancamentos.data = 13/07` corretamente.
- Mas para `caixa_movimentos` ela pega **sempre a sessão de caixa aberta do usuário no momento** (a de hoje) e usa `created_at = now()`. Por isso o recebimento aparece em "Meus movimentos" de hoje.
- A tela "Meu caixa → Movimentos" lista por `sessao_id`, então o movimento fica atrelado ao caixa errado.

## O que vai mudar

Alterar a função `fn_registrar_lancamento_e_caixa` para decidir a sessão de destino com base na **data do lançamento** (`p_lancamento.data`):

1. Se `data = hoje` → comportamento atual (sessão aberta do usuário, cria uma se não houver).
2. Se `data < hoje` (retroativo):
   - Procurar a **sessão do próprio usuário** que cubra aquele dia (aberta naquele dia ou fechada no dia — comparando `aberto_em::date` ou `fechado_em::date` com `p_lancamento.data`).
   - Se existir sessão **aberta** desse dia: anexar o movimento nela (`created_at = data 12:00`).
   - Se existir sessão **fechada** desse dia: anexar o movimento com `created_at` no dia; **atualizar** `valor_fechamento_calculado` (somando o valor) e `diferenca = valor_fechamento_informado − novo valor_fechamento_calculado`. **Não** mexer em `valor_fechamento_informado` (foi conferido em espécie no dia) e **não** reabrir a sessão. Acrescentar em `observacoes` uma nota tipo `[Retroativo lançado em 16/07/26 por <usuário>: +R$ 110,00]`.
   - Se **não existir** nenhuma sessão do usuário naquele dia: criar uma sessão **já fechada** rotulada como "Sessão retroativa" com `aberto_em`/`fechado_em` = 13/07 12:00, `valor_abertura = 0`, `valor_fechamento_informado = valor`, `valor_fechamento_calculado = valor`, `diferenca = 0`, observação explicando a origem — e inserir o movimento nela.
   - Nunca criar uma sessão aberta em data passada (evita duas sessões abertas ao mesmo tempo).

3. `caixa_movimentos.created_at` para movimentos retroativos passa a ser preenchido explicitamente com a data do lançamento (12:00 local em UTC), para que a coluna "Data/Hora" da grade reflita 13/07 corretamente e o `ORDER BY created_at` já ordene certo.

## Efeitos na UI

- A grade "Meu caixa → Movimentos" já busca todas as sessões recentes do usuário; o lançamento passará a aparecer sob a sessão de 13/07, junto com os outros movimentos daquele dia, com data 13/07.
- O saldo/fechamento de hoje não será mais inflado por retroativos.
- Aba "Todos (Financeiro)" e relatórios continuam corretos (usam `fin_lancamentos.data`).
- Nenhuma tela precisa ser reescrita — só ajustes pontuais se algum filtro depender do dia atual.

## Áreas críticas / riscos (AGENTS.md §1.9)

- Alteração de sessão **já fechada**: apenas soma no campo calculado e recalcula diferença, preservando o valor informado. Existe risco de o relatório de fechamento do dia mostrar diferença nova; por isso a observação de auditoria é obrigatória.
- Estorno de um retroativo: já usa `lancamento_id` para localizar o movimento — continua funcionando.
- Permissões: mantém-se como está — qualquer usuário com acesso ao Financeiro pode lançar retroativo, motivo obrigatório (comportamento atual preservado).

## Passos técnicos

1. **Migration** — substituir `fn_registrar_lancamento_e_caixa` pela versão com o roteamento por data descrito acima.
2. **Front-end** (`src/components/financeiro/lancamento-dialog.tsx`) — nenhuma alteração de contrato; a função continua recebendo `p_lancamento.data`. Apenas confirmar que a data selecionada é enviada (já é).
3. **Validação pós-alteração**:
   - Lançar um pagamento com data = hoje → deve ir para a sessão aberta (comportamento antigo).
   - Lançar retroativo com o dia 13/07 (sessão fechada existente) → deve aparecer na grade sob 13/07; saldo de hoje inalterado; `valor_fechamento_calculado` da sessão de 13/07 aumentado; `diferenca` recalculada; observação de auditoria adicionada.
   - Lançar retroativo em um dia sem sessão do usuário → cria sessão retroativa fechada; movimento aparece nela.
   - Solicitar estorno do retroativo → continua funcionando.
4. Relatar **antes/depois** ao usuário com o resumo do que foi ajustado e o que foi validado.

## Fora de escopo

- Não altero perfil/permissão de quem lança retroativo.
- Não mexo em outros fluxos (repasse médico, sangria, suprimento, estorno avulso, abertura/fechamento manual).
- Não altero relatórios financeiros — eles já usam `fin_lancamentos.data`.
