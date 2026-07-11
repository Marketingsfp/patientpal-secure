## Problema

Ao gerar o pagamento e imprimir a GR, o navegador abre **dois pop-ups de impressão idênticos** em sequência. O usuário só precisa de um — se quiser 2 vias, tira duas cópias no próprio diálogo do navegador.

## Causa

No utilitário de impressão `src/lib/print-gr.ts` (função `imprimirViaIframe`, linhas ~183–216), a GR é impressa através de um iframe oculto. O disparo do `print()` está registrado em **dois caminhos**:

1. `iframe.onload = () => setTimeout(dispararPrint, 80)` — caminho normal.
2. `setTimeout(() => { if (iframe.isConnected) dispararPrint(); }, 600)` — "fallback" caso o `onload` não dispare.

O iframe só é removido do DOM 4 segundos depois (`setTimeout(cleanup, 4000)`). Como o `onload` funciona normalmente, o print é chamado aos ~80 ms; aos 600 ms o iframe ainda está conectado, então o fallback dispara `print()` de novo — abrindo o segundo pop-up idêntico.

## Correção

Ajustar `imprimirViaIframe` para garantir que `print()` seja disparado **uma única vez**:

- Adicionar uma flag local `jaImprimiu` dentro da função.
- `dispararPrint` verifica e seta a flag antes de chamar `cw.print()`; se já impresso, retorna imediatamente.
- Mantém tanto o `onload` quanto o timeout de 600 ms como fallback, mas só um deles efetivamente aciona a impressão.

Nenhuma outra alteração é necessária. Todos os fluxos que imprimem via GR (individual, agrupada, mensalidade, carnê, etc.) passam por essa mesma função e serão corrigidos juntos.

### Arquivo afetado

- `src/lib/print-gr.ts` — função `imprimirViaIframe` (bloco entre linhas ~200 e 216).
