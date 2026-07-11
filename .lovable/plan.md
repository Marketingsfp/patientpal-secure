## Problema

Ao pagar a 1ª mensalidade do Cartão Benefícios (que também cobra a taxa de adesão) por cartão/PIX, o sistema abre **2 pop-ups de impressão**, cada um com **2 vias automáticas** (1ª via — Médico, 2ª via — Financeiro) → totalizando 4 impressões que o usuário percebe como "4 pop-ups".

Fluxo atual em `src/components/pages/contratos-page.tsx` (linha 2775 e 2851):
1. `printGuiaMensalidade(...)` → abre iframe #1 com 2 vias da mensalidade
2. `printGuiaTaxaAdesao(...)` → abre iframe #2 com 2 vias da taxa

## Solução

Emitir **um único pop-up** com **1 GR de mensalidade + espaço + 1 GR de taxa de adesão**, no mesmo documento. Se o usuário quiser 2 cópias, usa o campo "Cópias" do próprio diálogo de impressão do navegador.

### Passos

**1. `src/lib/print-gr.ts` — nova função `printGuiaMensalidadeComTaxa`**

- Recebe os mesmos inputs de `printGuiaMensalidade` + `valorTaxa`.
- Monta os **dois** `ticketHtml` (mensalidade + taxa) internamente, reaproveitando as consultas e a mesma lógica de formatação já existentes nos dois `*Core`.
- Concatena os dois tickets no mesmo `<body>`, com um separador visual (margem + linha `.sep`) entre eles, garantindo espaço entre as GRs.
- Chama `imprimirViaIframe(html)` **uma única vez**.
- Registra as duas linhas de auditoria em `gr_impressoes` (uma com `tipo: "mensalidade"`, outra com `tipo: "taxa_adesao"`), como via 1 de cada.
- **Uma via só** de cada GR (sem duplicar médico/financeiro).

**2. `src/components/pages/contratos-page.tsx` — usar a função nova quando houver taxa**

No `onSavedWithData` do `LancamentoDialog` (linhas 2769–2876):

- Se `taxaAdesao > 0`: manter todo o bloco de criação do lançamento financeiro da taxa + movimento no caixa (linhas 2790–2848 permanecem intactos), mas **substituir** as duas chamadas separadas `printGuiaMensalidade` + `printGuiaTaxaAdesao` por **uma única** chamada `printGuiaMensalidadeComTaxa`.
- Se `taxaAdesao === 0`: continuar chamando `printGuiaMensalidade` como hoje (comportamento atual das mensalidades 2 a 12 fica inalterado).

**3. Reimpressão (fora do escopo desta correção)**

Os botões de reimpressão existentes (`reimprimirGuiaMensalidade`, `reimprimirGuiaTaxaAdesao`) continuam funcionando individualmente, sem alteração.

## O que NÃO muda

- Lançamento financeiro separado da taxa de adesão (continua sendo criado).
- Movimento no caixa da taxa (continua sendo registrado).
- Categoria "TAXA DE ADESAO CARTAO" (continua sendo usada).
- Comportamento de 2 vias (médico + financeiro) das outras GRs do sistema (atendimento, mensalidades 2–12, boleto).
- Layout individual de cada GR (só passam a compartilhar o mesmo arquivo).

## Ponto que quero confirmar

O botão "Imprimir cartão" e "Imprimir A4" após criar o contrato **não são** afetados — a queixa é apenas sobre o pagamento da 1ª mensalidade + taxa. Confirma?