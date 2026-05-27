## Objetivo
Transformar cada ficha de mensalidade do carnê em duas vias lado a lado (cliente + clínica) numa única linha A4, mantendo 3 mensalidades por página.

## Mudanças em `src/lib/print-carne.ts`

### 1. Estrutura HTML de cada parcela
Hoje cada parcela gera um `<div class="ficha">`. Vou envolver em um wrapper que renderiza **duas fichas idênticas** lado a lado, cada uma com um cabeçalho identificando a via:

```text
┌─────────── A4 (paisagem do par, lado a lado) ───────────┐
│ Via do cliente          │ Via da clínica                │
│ ┌─────────────────────┐ │ ┌─────────────────────────┐   │
│ │   ficha completa    │ │ │   ficha completa        │   │
│ └─────────────────────┘ │ └─────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

Wrapper novo:
```html
<div class="ficha-par">
  <div class="ficha-via">
    <div class="via-label">Via do cliente</div>
    <div class="ficha">…conteúdo atual…</div>
  </div>
  <div class="ficha-via">
    <div class="via-label">Via da clínica</div>
    <div class="ficha">…mesmo conteúdo…</div>
  </div>
</div>
```

### 2. CSS
- A página continua `A4 portrait` (210mm × 297mm). Cada par fica numa linha horizontal com `grid-template-columns: 1fr 1fr; gap: 6mm;`.
- Reduzir a altura de cada ficha de `85mm` para caber 3 pares por página: manter `~85mm` por linha (ficha + label da via), mantendo o total ≤ ~270mm úteis. A altura interna da ficha cai para ~80mm; o label da via ocupa ~5mm.
- Como cada ficha agora tem metade da largura, ajustar tipografia interna:
  - `.ficha-grid` muda de `repeat(3, 1fr)` para `repeat(2, 1fr)` para não espremer.
  - `.ficha-header` continua flex, mas o bloco de 3 "parcelas" (Parcela / Mês ref. / Vencimento) vira coluna vertical compacta ou reduz tamanho de fonte de 18px para 13–14px.
  - `.ficha-rodape` continua `1fr 1fr` (data de pagamento + assinatura).
- `.via-label`: pequeno, uppercase, ~9px, alinhado à esquerda, com `border-bottom: 1px dashed` separando do conteúdo da ficha. Marca claramente "Via do cliente" / "Via do clínica".
- `page-break-inside: avoid` no `.ficha-par` (não na `.ficha` individual), para o par nunca quebrar entre páginas.

### 3. Capa
A capa (primeira página com dados do contrato) permanece intacta — é apenas resumo, não precisa de duas vias.

### 4. Conteúdo das duas vias
Idêntico nas duas — mesmos dados, mesmos campos de "Data de pagamento" e "Assinatura/Carimbo". Quando a parcela já está paga, a data preenchida aparece nas duas vias (igual ao comportamento atual).

## Fora de escopo
- Não altero `print-contrato.ts`, comprovante 80mm, nem nenhuma rota/lógica de pagamento.
- Não mudo regras de multa/juros nem dados exibidos.
