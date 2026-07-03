## Objetivo

1. GR sempre imprime **2 vias**, independente da forma de pagamento (hoje só emite 2 vias em cartão/pix; dinheiro/boleto/convênio saem com 1).
2. Só deve aparecer **1 diálogo de impressão** do navegador (hoje aparecem 2 seguidos).

## Alterações em `src/lib/print-gr.ts`

### 1. Sempre 2 vias

Substituir `numViasGR(...)` por constante `2`, ou simplificar a função para retornar sempre `2`. As chamadas nas linhas 510, 920 e 1137 passam a receber `2` diretamente. `VIA_LABELS` (`1ª VIA — MÉDICO`, `2ª VIA — FINANCEIRO`) e `multiplicarVias` já suportam isso sem mudança.

### 2. Único diálogo de impressão

Em `imprimirViaIframe`, o `window.print()` é disparado duas vezes: pelo `iframe.onload` (linha 139) e pelo `setTimeout(600 ms)` de fallback (linha 141), que só checa `iframe.isConnected` — condição ainda verdadeira porque o cleanup só acontece 4 s depois.

Adicionar guard de "já disparado":

```ts
let jaDisparou = false;
const dispararPrint = () => {
  if (jaDisparou) return;
  jaDisparou = true;
  try { cw.focus(); cw.print(); } catch { /* noop */ }
  setTimeout(cleanup, 4000);
};
iframe.onload = () => setTimeout(dispararPrint, 80);
setTimeout(() => { if (!jaDisparou && iframe.isConnected) dispararPrint(); }, 600);
```

O HTML das 2 vias continua sendo montado por `multiplicarVias` com `page-break-after: always` entre elas — o navegador imprime as 2 páginas em um único job/diálogo.

## Arquivos afetados

- `src/lib/print-gr.ts` (apenas `numViasGR` e `imprimirViaIframe`).

## Fora de escopo

- Layout/conteúdo das vias, cabeçalhos, CSS, rótulos das vias.
