# A4 Fase 2 — Caixa como painel operacional

Escopo: refinar `/app/dev-caixa-shell` (flag `caixa_v2`, off por padrão) para virar um **painel operacional**, não uma tabela. `/app/caixa` clássico permanece intocado. Nada de lógica financeira nova — só apresentação, agregação e atalhos sobre queries já existentes.

---

## 1. Painel de Resumo (sticky topo)

Grid de cards pequenos (h ~64px), 3 linhas em desktop, scroll horizontal em mobile. Atualiza via realtime já ligado em `caixa_movimentos` + `agendamentos`.

```
┌ Sessão #123 · aberta 2h14 ┐┌ Recebido hoje ┐┌ Recebido sessão ┐
│ Saldo R$ 1.240,00         ││ R$ 3.180,00   ││ R$ 2.410,00     │
└───────────────────────────┘└───────────────┘└─────────────────┘
┌ Particular ┐┌ Associado ┐┌ Dinheiro ┐┌ Pix ┐┌ Cartão ┐
│ R$ 1.900   ││ R$ 1.280  ││ R$ 640   ││ R$1k││ R$1.5k │
└────────────┘└───────────┘└──────────┘└─────┘└────────┘
┌ Pendentes na fila ┐┌ Aguardando pagamento ┐
│ 7                 ││ 3 pacientes           │
└───────────────────┘└───────────────────────┘
```

Agregação client-side sobre o array já carregado + `count head:true` para pendentes. Sem nova query pesada. Nomenclatura: **Particular / Associado / Cartão de Benefícios** — nunca "Convênio".

## 2. Receber em 1 clique

Botão "Receber" vira ação primária (variant default, tamanho lg, cor verde tokenizada) em cada card da fila.

- Fila carrega `agendamento_orcamento_itens` com `count` de itens pendentes.
- 1 item pendente → clique direto abre modal de pagamento com item pré-selecionado.
- >1 item → abre sheet de seleção; após seleção, mesma tela de pagamento.
- Nada muda na lógica de gravação — só encurta o caminho de entrada.

## 3. Cores inteligentes (tokens novos em `src/styles.css`)

Tokens semânticos (evitar hard-coded, respeita dark mode):

```
--status-paid: oklch(0.72 0.17 145);        /* verde  */
--status-waiting: oklch(0.85 0.16 90);      /* amarelo*/
--status-in-service: oklch(0.65 0.15 240);  /* azul   */
--status-canceled: oklch(0.60 0.20 25);     /* vermelho*/
--status-refunded: oklch(0.60 0.18 300);    /* roxo   */
```

Ponto colorido 8px + label opcional. Aria-label mantém texto para acessibilidade ("Status: pago").

## 4. Card de fila (não linha de tabela)

Substitui a lista de 40px por cards de ~88px com hierarquia visual:

```
┌ ● João Silva · 32a                        14:30 ┐
│  Consulta cardiológica · Dr. Marcos             │
│  [Particular] R$ 350,00        [🟢 Receber →]  │
└─────────────────────────────────────────────────┘
```

Modo compacto (Ctrl+Shift+C): 56px, esconde procedimento e vira 2 colunas.

## 5. Mini Timeline (drawer lateral)

Clique no card abre drawer (não navega). Timeline horizontal com 5 estágios derivados de `agendamentos.status` + `caixa_movimentos` + `atendimento_ia`:

```
● Check-in  ● Recepção  ○ Caixa  ○ Atendimento  ○ Finalizado
14:22       14:25       —        —              —
```

Preenchido = concluído; vazio = pendente; atual = pulsante. Read-only nesta fase.

## 6. Alertas (badges no card + faixa no topo)

Detecção client-side sobre os dados já carregados:

| Regra | Badge |
|---|---|
| Aguardando > 20min | ⏱️ "Espera longa" |
| Pago sem check-in de atendimento | 🟢 "Pago aguardando" |
| Atendimento iniciado sem pagamento | ⚠️ "Sem pagamento" |
| Orçamento pendente vinculado | 📄 "Orçamento" |
| NFS-e: falta CPF/endereço | 📋 "Cadastro incompleto" |

Faixa no topo aparece só se houver alerta ativo, com contador e "Ver todos".

## 7. Atalhos de teclado

Via listener no shell (limpo no unmount, ignora quando input focado exceto Esc):

- **F2** — Receber pagamento do primeiro card da fila (ou selecionado)
- **F3** — Imprimir último recibo
- **F4** — Nova despesa
- **Ctrl+Shift+C** — Compacto (já existe)
- **Esc** — Fecha drawer/sheet

Tooltip nos botões mostra o atalho.

## 8. KPI operacional (rodapé sticky, discreto)

Barra fina, tabular-nums, agregada da sessão + hoje:

```
Tempo médio até pagamento: 4m12s · Maior fila: 9 (11h20)
Tempo médio em caixa: 2m40s · Receita sessão: R$ 2.410
Receita hoje: R$ 3.180 · Atendimentos: 18
```

Cálculos derivados de timestamps já existentes (`agendamentos.created_at`, `caixa_movimentos.created_at`, etc). Cache 30s.

## 9. Estética "painel operacional"

- Zero `<table>`. Fila = grid de cards. Movimentos = lista com separadores sutis, não bordas de linha.
- Espaçamento generoso, tipografia hierárquica, ícones semânticos.
- Fundo `bg-muted/30` para respirar; cards em `bg-card` com `shadow-sm`.
- Densidade equilibrada: modo normal respira, compacto para operação.

## 10. Testes e medição

Playwright em `/tmp/browser/caixa-v2-fase2/`:

- resumo carrega e agrega corretamente (mockar 3 movimentos → conferir cards);
- 1 item pendente → clique em Receber abre pagamento direto;
- >1 item → clique abre seleção;
- cores por status renderizam com `data-status`;
- F2/F3/F4/Esc funcionam;
- timeline reflete estágios corretos;
- alertas aparecem conforme thresholds;
- KPIs preenchidos;
- mobile 390×844: cards empilhados, resumo com scroll horizontal;
- zero "Convênio" no DOM;
- console sem erros;
- print desktop, compacto e mobile.

**Medição:**

| Métrica | Clássico | Meta v2 |
|---|---|---|
| Cliques até receber pagamento | 4 | 1 |
| Tempo até visualizar estado da fila | ~2s | <500ms |
| Info visível por paciente sem abrir | 2 campos | 7 campos |
| Recepção sabe onde paciente está | não | sim (timeline) |

---

## Arquivos

Novos:
- `src/components/caixa-v2/painel-resumo.tsx`
- `src/components/caixa-v2/fila-card.tsx`
- `src/components/caixa-v2/mini-timeline.tsx`
- `src/components/caixa-v2/alertas-fila.ts` (regras puras)
- `src/components/caixa-v2/kpi-bar.tsx`
- `src/components/caixa-v2/atalhos.ts` (hook `useCaixaShortcuts`)

Editados:
- `src/components/caixa-v2/caixa-shell.tsx` — integra tudo
- `src/styles.css` — tokens `--status-*`

Intocado: `/app/caixa`, lógica de abertura/fechamento, estorno, recibo, NFS-e.

## Riscos e rollback

- Realtime overhead: agregações client-side, sem novas subscriptions.
- Atalhos conflitando com browser (F3=find): `preventDefault` só quando shell montado + flag on.
- Rollback: flag `caixa_v2` off → `/app/caixa` clássico.

## Promoção

Após validação (você + Playwright), promovo com o mesmo modelo do MenuV2: `/app/caixa` renderiza `CaixaShellV2` só para perfis autorizados (recepção/gestor/admin) atrás da flag, com fallback imediato para o clássico ao desligar.

**Aguardando aprovação para implementar A4 Fase 2.**