## Problema

Na tela `/app/nina` (arquivo `src/routes/_authenticated/app.nina.tsx`), os três painéis (lista de conversas, chat, painel do contato) estão usando `react-resizable-panels` v4 via `ResizablePanelGroup` / `ResizablePanel`. Resultado visível no print:

- as colunas ficam todas espremidas (lista com texto cortado tipo "Não lid…", "Nin…", "Agu…", contato com o telefone quebrado verticalmente)
- aparece scroll horizontal na página inteira
- os "grips" das alças aparecem só como quadradinhos no rodapé, sem barra de arrasto vertical real
- arrastar não redimensiona

A causa é incompatibilidade entre o wrapper shadcn (escrito para `react-resizable-panels` v2, que usava `direction` e atributos `data-panel-group-direction`) e a v4 instalada (que usa `orientation` e outros data attrs), além de o container externo ter altura fixa baseada em `100vh-260px` que estoura em viewports pequenos.

## Solução

Substituir o sistema de painéis arrastáveis por um **layout flex responsivo** ao estilo WhatsApp Web / Hi Platform, que se adapta sozinho à largura disponível (sem precisar arrastar). É o padrão que a referência da Hi Platform usa na prática.

### Mudanças em `src/routes/_authenticated/app.nina.tsx`

1. **Remover imports e uso** de `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle`.

2. **Container externo** passa a usar altura baseada no viewport real e preencher o espaço do conteúdo da página:
   - `h-[calc(100dvh-var(--header-offset,180px))] min-h-[520px] flex` em vez de `100vh-260px` fixo.

3. **Coluna 1 — Lista de conversas**: largura responsiva fixa por breakpoint, sem arrastar.
   - `w-full max-w-full sm:w-[300px] sm:shrink-0 lg:w-[340px] xl:w-[360px] border-r border-border flex flex-col`
   - em telas `< sm` ela ocupa 100% e o chat só aparece quando uma conversa é selecionada (padrão mobile do WhatsApp).

4. **Coluna 2 — Chat**: ocupa o restante.
   - `flex-1 min-w-0 flex flex-col` (com `min-w-0` para o texto não estourar).
   - botão de voltar (ChevronLeft) no header só em mobile (`sm:hidden`) para reabrir a lista.

5. **Coluna 3 — Painel do contato** (já tem toggle via `painelAberto`): largura fixa responsiva, sem arrastar.
   - `hidden xl:flex xl:w-[320px] 2xl:w-[360px] shrink-0 border-l border-border flex-col overflow-auto` quando `painelAberto`
   - em telas menores que `xl`, abre como **Sheet/Drawer** sobreposto (usar `Sheet` do shadcn vindo da direita) para não espremer o chat.

6. **Mobile (`<sm`)**: alternância entre lista e chat controlada por estado simples `mobileView: "lista" | "chat"` derivado de `sel != null`, para não tentar mostrar as duas colunas em telas estreitas.

7. **Remover** o `min-h-[560px]` rígido que forçava scroll horizontal em viewports compactos.

## Fora de escopo

- Não voltar a oferecer drag-to-resize (a referência Hi Platform também não tem).
- Não mexer em campanhas, configurações WhatsApp nem na tela de contratos/boleto/carnê.
- Lógica de mensagens, Nina toggle e envio permanecem exatamente iguais.

## Detalhes técnicos

- `react-resizable-panels` pode continuar instalado (outras telas podem usar) — só removemos o uso aqui.
- Usaremos `100dvh` (dynamic viewport) para o mobile lidar bem com barras do navegador.
- Breakpoints: `sm` 640, `lg` 1024, `xl` 1280, `2xl` 1536 (defaults Tailwind v4).
- Em 1086px (viewport atual do usuário): lista 300px + chat flex + painel contato como Sheet → o chat ganha ~786px úteis, em vez dos ~600px espremidos atuais.
