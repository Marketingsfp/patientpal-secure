## Objetivo
Adicionar um botão **X (Fechar agenda)** no cabeçalho do painel direito (Agenda) em `/app/orcamentos-agenda`, permitindo ocultar o painel da agenda e fazer o painel de Orçamentos ocupar 100% da largura.

## Mudanças

**Arquivo:** `src/routes/_authenticated/app.orcamentos-agenda.tsx`

1. Adicionar estado `agendaAberta` (boolean, default `true`).
2. Importar ícones `X` e `PanelRightOpen` do `lucide-react`.
3. No cabeçalho do painel Agenda, adicionar um botão `X` com tooltip "Fechar agenda" que faz `setAgendaAberta(false)`.
4. Quando `agendaAberta === false`:
   - Painel esquerdo (Orçamentos) ocupa `100%` da largura.
   - Barra divisória central e painel direito ficam ocultos.
   - Mostrar no cabeçalho do painel Orçamentos um botão "Abrir agenda" (ícone `PanelRightOpen`) para restaurar o layout.
5. Quando uma mensagem `agendar-orcamento` for recebida (usuário clicou em "Agendar" num orçamento), reabrir automaticamente a agenda (`setAgendaAberta(true)`).

## Resultado
O usuário pode fechar a agenda após criar os agendamentos e voltar à visualização de página inteira dos Orçamentos, com possibilidade de reabrir a qualquer momento.
