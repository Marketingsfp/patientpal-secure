## Antes / Depois

**Antes:**
- Na aba **Meu caixa → Movimentos**, o atendente enxerga apenas os movimentos da **sessão de caixa aberta no momento**. Quando fecha a sessão de um dia e abre outra no dia seguinte, tudo o que foi lançado em dias anteriores desaparece da tela dele.
- Sem sessão aberta, aparece só a mensagem "Abra um caixa para visualizar os movimentos" — nem o histórico do próprio usuário é exibido.
- O filtro de "Período" (Hoje / Semana / Quinzena / Mês / Todos / intervalo) hoje só aparece para **gestor/admin**. O atendente vê apenas "Movimentos de hoje", sem seletor.
- Confirmado no banco: o recebimento da paciente **ROSENETE COSTA DA SILVA** (R$ 10, misto) foi lançado por **SUELLEN ALEXANDRE BATISTA** em 14/07/2026 dentro da sessão dela daquele dia, que já foi fechada. Por isso não aparece hoje na tela dela.

**Depois:**
- A aba **Meu caixa → Movimentos** passa a mostrar os movimentos do próprio usuário **em todas as sessões recentes dele** (sessão aberta atual + últimas sessões fechadas — as mesmas 20 que o "Meu histórico" já carrega hoje).
- O filtro de **Período** fica disponível também para o atendente, com "Hoje" como padrão (mesmo comportamento visual atual), mas com a opção de escolher Semana, Quinzena, Mês, intervalo ou "Todos".
- Se o usuário não tiver sessão aberta, a aba **Movimentos** deixa de bloquear a visualização: mostra o histórico dele mesmo assim (a mensagem "Abra um caixa…" fica apenas para as ações que exigem sessão aberta, como novo lançamento).
- O botão **Solicitar estorno** continua aparecendo para todo movimento do tipo "Recebimento" (regra atual), inclusive nos retroativos — a solicitação vai para o financeiro como já vai hoje. Se já existe uma solicitação em aberto para aquele lançamento, aparece "Aguardando aprovação"; se já foi estornado, aparece "Estornado".

## Escopo

- **Dentro do escopo:** apenas a aba "Meu caixa → Movimentos" da tela `/app/caixa`.
- **Fora do escopo (não vou tocar):**
  - Aba "Saldo": continua somando **apenas a sessão aberta atual** (mudar isso quebraria o saldo do caixa).
  - Aba "Aguardando" (fila de cobrança).
  - Aba "Histórico".
  - Aba "Todos (Financeiro)" e "Repasse médico".
  - Fluxo de aprovação de estorno pelo financeiro (`estorno_solicitacoes`) — nenhuma mudança de regra.
  - Regras de permissão (`podeEscrever`) e RLS.
  - Estrutura de tabelas.

## Áreas críticas

Módulo Caixa / Financeiro. Mudança é apenas de **exibição**: não altera saldo, fechamento, dados salvos, cálculo de repasse, nem cria/edita/exclui movimento algum. O botão "Solicitar estorno" reaproveita o dialog que já existe (`SolicitarEstornoDialog`) — só passa a estar disponível para linhas retroativas.

## Riscos e mitigação

- Risco 1: contaminar o **Saldo** e os **totais por tipo** (que hoje somam `minhasMovs`) com movimentos de dias anteriores → **mitigação:** manter `minhasMovs` como está (só sessão aberta) e criar uma lista separada `minhasMovsHist` só para a tabela da aba Movimentos.
- Risco 2: o filtro padrão "Hoje" continua vigente, então a tela abre visualmente igual ao que o atendente já conhece — a diferença é a possibilidade de mudar o período.
- Risco 3: performance — a consulta extra é pelas mesmas ~20 sessões já carregadas em `histRes`, então é um único `IN (sessao_id, …)` a mais; enriquecimento (paciente/serviço/médico) reaproveita a função `enrichMovsList` já existente.

## Detalhes técnicos (para revisão)

Arquivo único: `src/routes/_authenticated/app.caixa.tsx`.

1. Em `load()` (~linhas 554–714):
   - Manter o fetch atual de `minhasMovs` (movimentos da sessão aberta) para não afetar Saldo/Totais.
   - Adicionar um novo estado `minhasMovsHist: Mov[]` populado com o UNION de movimentos das sessões em `histRes` (inclui a aberta se existir) — usa `IN (sessao_id, …)` limitado às 20 sessões que já carregamos.
   - Rodar `enrichMovsList` sobre `minhasMovsHist` e usar o resultado no `enrichPorLanc` (a tabela Movimentos já consulta esse mapa).
2. `minhasMovsFiltrados` (~linha 366) passa a se basear em `minhasMovsHist` em vez de `minhasMovs`. `medicosDisponiveis` idem.
3. Aba "Movimentos" (~linha 2126–2374):
   - Remover o gate `!minhaSessao` que hoje esconde a tabela — o card passa a renderizar mesmo sem sessão aberta.
   - Mover o seletor de **Período** para fora do bloco `isManager` (fica visível para todos). Título passa a "Meus movimentos" com contagem de período.
   - Não mexer no botão de Solicitar estorno / Aguardando / Estornado (já funciona por `lancamento_id`).
4. `mistoObs` (linhas ~1110–1132) continua alimentado só por `minhasMovs` — a coluna "Forma" da linha retroativa vai exibir "misto" sem o detalhamento entre parênteses, o que é o comportamento atual quando o detalhe do misto não está em cache. (Se depois quiserem detalhar misto retroativo, é uma segunda pequena entrega.)

## Validação depois de aplicar

1. Logar como **Suellen** e abrir Caixa → Meu caixa → Movimentos.
2. Confirmar que o recebimento de **ROSENETE COSTA DA SILVA** de 14/07/2026 (R$ 10, misto, Dr. Diogo Del Cima) aparece ao mudar o Período para "Última semana" ou "Todos".
3. Conferir que o botão "Solicitar estorno" aparece na linha do Rosenete e abre o mesmo diálogo já existente.
4. Confirmar que o **Saldo** e os totais por tipo continuam iguais aos de antes (só somando a sessão aberta atual).
5. Conferir que gestor/admin continuam com o mesmo comportamento de antes na aba Movimentos.

## Pendências / dúvidas

- Se a clínica quiser **restringir** o estorno retroativo a um limite (ex.: só dos últimos 30 dias), preciso dessa regra antes — hoje o botão fica disponível para qualquer recebimento visível, sem limite de tempo, seguindo a regra atual.
- Se preferirem carregar mais que as últimas 20 sessões do usuário (ex.: 60 dias), me avisem — hoje o `histRes` já limita em 20 e vou seguir o mesmo limite.