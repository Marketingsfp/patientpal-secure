/**
 * Envia um HTML para a impressora usando um iframe oculto.
 *
 * Usa iframe em vez de `window.open` porque os botões de "Salvar e imprimir"
 * gravam antes de imprimir: depois do `await`, o navegador já perdeu o gesto
 * do usuário e o pop-up seria bloqueado. O iframe é removido assim que o
 * diálogo de impressão fecha (ou após 60s, se o evento não chegar).
 */
export function printHtmlViaIframe(html: string) {
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

  const triggerPrint = () => {
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

  if (doc.readyState === "complete") {
    setTimeout(triggerPrint, 100);
  } else {
    iframe.addEventListener("load", () => setTimeout(triggerPrint, 100), { once: true });
  }
}
