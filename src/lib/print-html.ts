/**
 * Envia um HTML para a impressora usando um iframe oculto.
 *
 * Usa iframe em vez de `window.open` porque os botões de "Salvar e imprimir"
 * gravam antes de imprimir: depois do `await`, o navegador já perdeu o gesto
 * do usuário e o pop-up seria bloqueado. O iframe é removido assim que o
 * diálogo de impressão fecha (ou após 60s, se o evento não chegar).
 *
 * A impressão espera `ESPERA_FECHAR_MODAL_MS` antes de disparar. Quase toda
 * chamada vem logo depois de fechar um modal, que leva 200ms animando a saída.
 * `print()` congela a página; se isso acontece no meio da animação, o evento
 * de fim de animação se perde e o modal fica na tela, vazio e sem responder,
 * até dar F5 — foi o que aconteceu na sangria do caixa em 14/09/2026.
 */
const ESPERA_FECHAR_MODAL_MS = 400;

/** Teto para esperar imagens (ex.: logo): imprime mesmo se alguma travar. */
const TETO_ESPERA_IMAGENS_MS = 2500;

/**
 * `esperarImagens`: só dispara a impressão depois que todas as imagens do
 * documento carregarem (ou falharem), com teto de 2,5s — mesmo critério de
 * `print-gr.ts`. Desligado por padrão para não mudar os papéis que já usam
 * este helper.
 */
export function printHtmlViaIframe(html: string, opts: { esperarImagens?: boolean } = {}) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {
        /* noop */
      }
    }, 1000);
  };

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    cleanup();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  let jaImprimiu = false;
  const triggerPrint = () => {
    if (jaImprimiu) return;
    jaImprimiu = true;
    try {
      win.focus();
      win.print();
    } catch {
      /* noop */
    }
    const onAfter = () => {
      cleanup();
      win.removeEventListener("afterprint", onAfter);
    };
    win.addEventListener("afterprint", onAfter);
    setTimeout(cleanup, 60000);
  };

  const aposImagens = (fn: () => void) => {
    if (!opts.esperarImagens) return fn();
    const pendentes = Array.from(doc.images ?? []).filter((im) => !im.complete);
    if (pendentes.length === 0) return fn();
    let restantes = pendentes.length;
    const done = () => {
      restantes -= 1;
      if (restantes <= 0) fn();
    };
    pendentes.forEach((im) => {
      im.addEventListener("load", done, { once: true });
      im.addEventListener("error", done, { once: true });
    });
    setTimeout(fn, TETO_ESPERA_IMAGENS_MS);
  };
  const agendar = () => aposImagens(() => setTimeout(triggerPrint, ESPERA_FECHAR_MODAL_MS));

  if (doc.readyState === "complete") {
    agendar();
  } else {
    iframe.addEventListener("load", agendar, { once: true });
  }
}
