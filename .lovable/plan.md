## Objetivo

Permitir que perfis **admin** e **financeiro** (também **gestor**, mesmo grupo já existente na tela) **desfaçam o fechamento de um caixa** direto pela aba "Todos (Financeiro)". A ação fica auditada no próprio caixa do operador (aba Movimentos) e no relatório impresso.

## UX

Na tabela da aba "Todos (Financeiro)" (`src/routes/_authenticated/app.caixa.tsx`, coluna de ações — hoje mostra o olho de detalhe e o cadeado para fechar caixas abertos):

- Para linhas com `statusDia = "fechado"`, adicionar um novo ícone **Desfazer fechamento** (`Unlock`/`RotateCcw`), visível apenas para admin/gestor/financeiro (`podeLancarRecebDespesa`, já existe).
- Ao clicar: abrir um pequeno diálogo de confirmação exigindo **motivo obrigatório** (textarea) e mostrando: operador, dia, valor calculado e informado do fechamento em questão. Botão "Reabrir caixa" (destructive) + Cancelar.

## Regras

1. Localiza a `caixa_sessoes` do dia/operador com `status = 'fechado'` (a linha da tabela já tem `sessoes[]`; usar a sessão que tem `fechado_em` naquele dia).
2. Atualiza a sessão:
   - `status = 'aberto'`
   - `fechado_em = null`
   - `valor_fechamento_informado = null`, `valor_fechamento_calculado = null`, `diferenca = null`
   - Anexa em `observacoes` uma linha `[Fechamento desfeito por FULANO em DATA/HORA — motivo]` (preserva histórico anterior com ` | `).
3. Insere um **novo movimento de auditoria** em `caixa_movimentos` com:
   - `tipo = 'reabertura'` (novo tipo — coluna é texto livre, sem CHECK/enum, já confirmado no banco).
   - `valor = 0` (não afeta saldo).
   - `descricao = "Fechamento desfeito por FULANO — motivo: ..."`
   - `forma_pagamento = null`, sessão/clínica/user do executor.
4. Não altera nem apaga a linha original de `caixa_movimentos.tipo = 'fechamento'` — ela **permanece visível** no histórico, seguida da nova linha de reabertura. Isso preserva a trilha completa (foi fechado, depois reaberto).

## Suporte ao novo tipo "reabertura"

Em `src/routes/_authenticated/app.caixa.tsx`:

- Ampliar o tipo `MovTipo` para incluir `"reabertura"`.
- `TIPO_LABEL.reabertura = "Reabertura"`.
- `TIPO_SINAL.reabertura = 0` (não soma nem subtrai).
- `TIPO_CLASS.reabertura` = classe própria (azul/violeta) para destaque no badge.
- Filtro `pacienteFromDescricao` já ignora prefixos administrativos — adicionar `reabertura` no regex de exclusão (linha ~232) para não tentar extrair paciente.
- **Relatório impresso** (`imprimirRelatorioMovs`, linha 1704): incluir `reabertura` na lista de tipos ignorados no agrupamento por categoria/forma (assim como `abertura` e `fechamento`), mas **mantê-la visível** na tabela detalhada de movimentos ("Movimentos da sessão") do operador — que já lista todos os movimentos brutos ordenados por data.
- **Contagem de sangria/estorno** (`calcSangriaSessao`, `calcEstornoSessao`) — não muda, filtra por tipo específico.
- `entradasPorFormaSessao` / `porFormaDoDiaFechamento` — já filtram por tipos específicos, `reabertura` fica de fora naturalmente.

## Permissão

- Botão só aparece para `podeLancarRecebDespesa` (admin/gestor/financeiro).
- Recepcionistas não veem o botão.
- Não crio nova RPC nem migration — apenas UPDATE e INSERT via cliente Supabase, respeitando as RLS existentes de `caixa_sessoes` e `caixa_movimentos`. Se a RLS bloquear o update de sessão alheia por um financeiro/admin, o toast de erro mostra a mensagem original e eu revisito com uma migration em turno seguinte. **Verificação prévia**: rodar `select` das policies dessas tabelas antes de aplicar o botão, para confirmar que admin/gestor/financeiro conseguem atualizar sessão de outro `user_id`. Se não conseguirem, adiciono uma policy nova nesse mesmo pacote de mudanças.

## Onde a reabertura aparece

- **Aba "Todos (Financeiro)"**: o dia volta ao status "aberto" imediatamente após a ação (o `loadTodos` roda no callback), sem `informado` nem `diferença`.
- **Aba "Meu caixa" da Mayra**: o caixa volta a estar aberto; a lista de Movimentos mostra: `Abertura → ...movs... → Fechamento (do dia X) → Reabertura por FULANO`.
- **Modal "Ver detalhes"**: as duas linhas (fechamento + reabertura) aparecem em ordem cronológica.
- **Relatório impresso** (botão "Relatório" da sessão): a linha "Reabertura" **NÃO** entra no agrupamento GERAL/por forma (evita poluir totais). Aparece apenas no rodapé de contagem de registros — pode-se opcionalmente exibir um bloco textual "Reaberturas: 1 (motivo: ...)" abaixo da tabela. **Decisão adotada**: incluir esse bloco textual auxiliar, curto, ao final do HTML do relatório.

## Fora do escopo

- Não permito editar valores já registrados (recebimentos, sangrias) na reabertura — o operador reabre, corrige lançando novos movimentos (sangria/estorno/etc.) e fecha de novo normalmente.
- Não altero regras de negócio do fechamento em si.
- Sem alterações em `fin_lancamentos` (o financeiro continua como está).

## Validação

1. Fazer login como admin/financeiro, ir em Caixa → Todos (Financeiro), filtrar o dia da Mayra (15/07/2026).
2. Clicar em "Desfazer fechamento" na linha, digitar motivo e confirmar.
3. Conferir na tabela: status volta para "aberto", Informado/Diferença zeram.
4. Trocar para o operador afetado (ou usar o botão de detalhe): a linha `Reabertura` deve aparecer em Movimentos, com o nome do executor e o motivo.
5. Imprimir o relatório: a linha de reabertura aparece como bloco textual auxiliar, sem alterar os totais Pagamento/Recebimento.

## Riscos

- Baixo/médio. Ação sensível (reverte fechamento contábil), mas totalmente auditada via `caixa_movimentos` + `observacoes`. Nada é apagado. Requer motivo obrigatório.
- Se surgir bloqueio de RLS ao reabrir sessão alheia, entrego junto uma migration adicionando policy de UPDATE para admin/gestor/financeiro sobre `caixa_sessoes` (limitada à mesma clínica). Verifico as policies antes de decidir.