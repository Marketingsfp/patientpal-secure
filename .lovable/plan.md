# Unificar os dois inboxes de WhatsApp

Hoje existem dois itens no menu apontando para inboxes diferentes:

- `Conversas WhatsApp` → aba `#chat` (componente `InboxWhatsapp`, chat simples)
- `Atendimento — Inbox Central` → aba `#atend-inbox` (componente `AtendInbox`, com filas/departamentos, atribuição, transferência e protocolo)

Vou manter apenas o **Inbox Central** e remover o item duplicado.

## Mudanças

1. **`src/components/app-shell.tsx`**
   - Remover a entrada de menu `{ to: "/app/nina", hash: "chat", label: "Conversas WhatsApp", icon: MessageCircle }`.
   - Renomear o item `"Atendimento — Inbox Central"` para `"Conversas WhatsApp"` (mantendo o `hash: "atend-inbox"` e o ícone `Inbox`), para preservar o rótulo familiar do usuário.

2. **`src/routes/_authenticated/app.nina.tsx`**
   - Remover a `<TabsContent value="chat">` que renderiza `InboxWhatsapp`.
   - Se a aba ativa default for `"chat"`, trocar para `"atend-inbox"` (assim quem entrar em `/app/nina` sem hash cai direto no inbox central).
   - Remover o componente `InboxWhatsapp` e suas props/estado relacionados que ficarem órfãos (`conversas`, `sel`, `setSel`, `draft`, `enviarMensagem`, `loadingConv`, subscription realtime de `whatsapp_mensagens` se não for usada por outra aba). Verificar se o `useEffect` de realtime ainda é necessário para outra coisa — se não, remover também.

## Fora de escopo

- Não vou apagar o componente `InboxWhatsapp` do arquivo apenas se isso exigir refatoração extensa; nesse caso, deixo só sem ser renderizado e marco para limpeza futura. A meta principal é que o usuário veja **um único item de menu** abrindo o Inbox Central.
