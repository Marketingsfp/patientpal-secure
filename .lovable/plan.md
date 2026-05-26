## Objetivo
Melhorar a formatação visual das mensagens na tela da Nina (`/app/nina`), que hoje são renderizadas como texto puro com quebras de linha. Quando a Nina responde com listas, valores, negritos ou parágrafos, tudo aparece "cru".

## O que muda
Renderizar as mensagens da Nina (e do usuário, quando fizer sentido) com **Markdown** + estilos tipográficos do Tailwind (`prose`), preservando o visual de balão atual.

### Aba "Nina treinada" (chat interno com IA)
- Mensagens do **assistant**: renderizar como Markdown com suporte a:
  - **negrito**, *itálico*, listas com `-` ou `1.`
  - blocos de código e `inline code`
  - links clicáveis (abrem em nova aba)
  - tabelas simples (preços, horários, médicos)
- Mensagens do **usuário**: manter texto simples com quebra de linha (sem markdown, evita renderizar acidentalmente).
- Aplicar classes `prose prose-sm` com ajustes para caber no balão verde/branco e funcionar em dark mode (`prose-invert` no balão verde).
- Espaçamento entre parágrafos/listas mais compacto para não inchar o balão.

### Aba WhatsApp (conversa com paciente)
- Aplicar uma formatação leve estilo WhatsApp: `*negrito*`, `_itálico_`, `~riscado~`, links auto-detectados viram clicáveis, números de telefone destacados.
- Sem markdown completo (não faz sentido em SMS/WhatsApp), só o subset que o WhatsApp usa.

### Indicador "Nina digitando…"
- Trocar o `Loader2` por três pontinhos animados (bounce escalonado) para ficar mais parecido com um chat real.

## Detalhes técnicos
- Instalar `react-markdown` e `remark-gfm` (suporte a tabelas, listas de tarefas, autolinks).
- Criar um pequeno componente `<NinaMessage content={...} variant="assistant|user" />` em `src/components/nina/NinaMessage.tsx` para encapsular a renderização e ser reutilizado nas duas abas.
- Para a aba WhatsApp, criar utilitário `formatWhatsappText(text)` que converte `*x*`, `_x_`, `~x~` e URLs em JSX — sem dependência extra.
- Tokens semânticos do design system mantidos; nada de cores hardcoded novas.

## Arquivos afetados
- `src/routes/_authenticated/app.nina.tsx` (usar o novo componente nas duas listas de mensagens + novo indicador de digitação)
- `src/components/nina/NinaMessage.tsx` (novo)
- `src/components/nina/formatWhatsappText.tsx` (novo)
- `package.json` (deps `react-markdown`, `remark-gfm`)

## Fora de escopo
- Não mexer no backend / prompts da Nina.
- Não alterar fluxo de envio de mensagens, IA on/off, webhooks ou configuração do WhatsApp.