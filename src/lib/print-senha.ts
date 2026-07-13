/**
 * Impressão automática da senha do totem em impressora térmica 80mm.
 * Abre uma janela oculta, escreve o HTML da senha e dispara window.print()
 * automaticamente. Fecha a janela ao terminar.
 */

const TIPO_LABEL: Record<string, string> = {
  N: "COMUM",
  P: "PREFERENCIAL",
  E: "PRIORIDADE MEDICA",
  R: "RETORNO",
};

export function imprimirSenhaTotem(params: {
  codigo: string;
  tipo: string;
  clinicaNome?: string | null;
}) {
  const { codigo, tipo, clinicaNome } = params;
  const label = TIPO_LABEL[tipo] ?? "SENHA";
  const agora = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Senha ${codigo}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: 80mm;
    font-family: 'Courier New', Courier, monospace;
    color: #000;
    text-align: center;
    padding: 6mm 4mm;
  }
  .clinica { font-size: 12pt; font-weight: bold; margin-bottom: 2mm; }
  .label   { font-size: 10pt; letter-spacing: 2px; margin-bottom: 1mm; }
  .tipo    { font-size: 12pt; font-weight: bold; margin-bottom: 3mm; }
  .codigo  { font-size: 64pt; font-weight: 900; line-height: 1; margin: 4mm 0; }
  .data    { font-size: 10pt; margin-top: 3mm; }
  .aviso   { font-size: 9pt; margin-top: 4mm; }
  hr { border: none; border-top: 1px dashed #000; margin: 3mm 0; }
</style>
</head>
<body>
  ${clinicaNome ? `<div class="clinica">${escapeHtml(clinicaNome)}</div>` : ""}
  <div class="label">SUA SENHA</div>
  <div class="tipo">${label}</div>
  <div class="codigo">${escapeHtml(codigo)}</div>
  <hr />
  <div class="data">${agora}</div>
  <div class="aviso">Aguarde ser chamado(a)<br/>no painel da recepcao.</div>
</body>
</html>`;

  // iframe oculto: mais confiável que window.open() em modo quiosque
  // (não é bloqueado por popup blocker e não rouba foco do totem)
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    try { document.body.removeChild(iframe); } catch { /* noop */ }
  };

  const doPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      // ignora — impressora pode não estar disponível
    }
    // dá tempo do diálogo/impressora consumir antes de remover o iframe
    setTimeout(cleanup, 5000);
  };

  // aguarda o layout do documento antes de imprimir
  if (doc.readyState === "complete") {
    setTimeout(doPrint, 50);
  } else {
    iframe.addEventListener("load", () => setTimeout(doPrint, 50), { once: true });
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}