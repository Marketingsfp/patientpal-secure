
# Layout WhatsApp estilo Hi Platform (3 colunas)

Reformular a área de WhatsApp da Nina para o padrão de inbox profissional (Hi Platform / WhatsApp Web): **lista de conversas | chat central | painel do contato**, mantendo todas as funcionalidades atuais.

## Estrutura visual nova

```text
┌──────────────────────────────────────────────────────────────────────┐
│  Header: Nina — WhatsApp  · status online · busca global · filtros   │
├────────────┬────────────────────────────────────┬────────────────────┤
│ CONVERSAS  │ CHAT                               │ CONTATO            │
│ (320px)    │ (flex-1)                           │ (320px)            │
│            │                                    │                    │
│ filtros:   │ ┌── header do contato ───────────┐ │ avatar + nome      │
│ [Todas]    │ │ avatar + nome + tel + status   │ │ telefone           │
│ [Não lidas]│ │ Nina ON/OFF · ações ⋮          │ │ tags               │
│ [Nina]     │ └────────────────────────────────┘ │ ─────              │
│ [Humano]   │                                    │ Paciente vinculado │
│            │  msgs com bubbles                  │ Última consulta    │
│ avatar+nome│  separadores por dia               │ Mensalidades       │
│ prévia     │  status "entregue/lida"            │ ─────              │
│ hora+badge │                                    │ Notas internas     │
│ ...        │ ┌── composer ────────────────────┐ │ Histórico de       │
│            │ │ 📎 emoji │ textarea │ 🎤 │ →  │ │ atendimentos       │
│            │ └────────────────────────────────┘ │                    │
└────────────┴────────────────────────────────────┴────────────────────┘
```

A página passa a ocupar `h-[calc(100vh-var(--header))]` sem padding externo, como um app de chat dedicado (não dentro de um Card scrollável).

## Mudanças por aba

A página `/app/nina` mantém as 4 abas (**Nina treinada · Conversas · Automações · Configuração**). Só a aba **Conversas** é reescrita.

### 1. Coluna esquerda — Lista de conversas
- Topo: input de busca + chips de filtro (Todas / Não lidas / Nina / Humano / Arquivadas).
- Itens da lista: avatar redondo (iniciais ou foto do paciente), nome, prévia da última mensagem (1 linha), horário e badge de não lidas. Indicador colorido se a Nina está respondendo (●verde) ou aguardando humano (●âmbar).
- Item selecionado com fundo destacado e barra lateral primary.
- Scroll independente; lista densa estilo Hi/Intercom.

### 2. Coluna central — Conversa
- Header fixo com avatar + nome + telefone + último visto + toggle "Nina respondendo" + menu de ações (marcar como resolvida, transferir, arquivar).
- Mensagens agrupadas por dia (separador "Hoje", "Ontem", data), bubbles arredondados estilo WhatsApp: entrada à esquerda (cinza), saída à direita (verde para Nina, azul/primary para humano), com horário e duplo-check.
- Suporte a áudio transcrito, imagens e anexos (placeholder visual).
- Composer com: anexo (📎), emoji (😊), textarea com auto-resize, gravar áudio (🎤), botão enviar verde. Enter envia, Shift+Enter quebra linha.

### 3. Coluna direita — Painel do contato (nova)
- Avatar grande + nome + telefone formatado.
- Tags do paciente (VIP, Convênio X, etc).
- Cards compactos: **Paciente vinculado** (com link para o cadastro), **Última consulta**, **Mensalidades em aberto**, **Próximo agendamento**.
- Área de **Notas internas** (textarea persistente por conversa).
- Pode ser colapsada com botão `>` no header do chat (esconde a coluna).

## Detalhes técnicos

**Arquivos alterados**
- `src/routes/_authenticated/app.nina.tsx` — apenas o `TabsContent value="chat"` é reescrito; abas Treinada/Automações/Configuração ficam intactas. O wrapper externo da página perde `space-y-6` para a aba conversas usar altura total.
- Criar `src/components/nina/ConversasInbox.tsx` (novo) com 3 sub-componentes: `ListaConversas`, `ChatJanela`, `PainelContato`. Mantém o estado e o `useEffect` de realtime que já existem hoje em `app.nina.tsx` — só extrai a UI.
- Reaproveitar `formatWhatsappText` para markdown de WhatsApp.

**Dados (sem mudança de schema)**
- Continuamos lendo de `whatsapp_mensagens` e agrupando por `from_number`/`to_number` como já feito hoje.
- Para o painel direito: lookup do paciente por `telefone` em `pacientes`, e queries leves de `agendamentos` (último/próximo) e `contrato_mensalidades` em aberto. Tudo client-side com `supabase` (RLS já cobre).

**Tokens / cores**
- Bubble Nina: `bg-emerald-500 text-white` (mantém).
- Bubble paciente: `bg-card border border-border`.
- Coluna ativa / hover: `bg-muted` / `bg-muted/50`.
- Sem cores hardcoded fora das já presentes no projeto.

**Responsivo**
- `<lg`: mostra só a lista; ao clicar numa conversa abre o chat full-screen com botão voltar; painel do contato vira sheet (drawer).
- `lg`: 2 colunas (lista + chat), painel toggleável.
- `xl+`: 3 colunas completas.

## Fora do escopo
- Configuração WhatsApp (token, número, horário) **mantém o layout atual** dentro da aba "Configuração" — o usuário pediu o mesmo layout do Hi apenas para a área de conversas/inbox.
- Campanhas (`/app/campanhas`) e Envios (`/app/mkt-envios`) recebem apenas um ajuste leve de header para ficarem visualmente coerentes com a nova inbox (mesma tipografia de título e badges); a estrutura tabular delas permanece.
- Sem alterações no webhook, no `whatsapp.functions.ts` ou em `whatsapp.server.ts`.
- Sem alterações nas automações cadastradas.
