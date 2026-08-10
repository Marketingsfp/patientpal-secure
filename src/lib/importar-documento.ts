/**
 * Extrai conteúdo de arquivos .docx, .pdf e .txt no navegador
 * e devolve HTML pronto para injetar no editor.
 */

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function textoParaHtml(texto: string) {
  const paragrafos = texto
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((bloco) => bloco.trim())
    .filter(Boolean);
  if (!paragrafos.length) return "<p></p>";
  return paragrafos
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

export async function extrairHtmlDeArquivo(file: File): Promise<string> {
  const nome = file.name.toLowerCase();

  if (nome.endsWith(".txt") || file.type.startsWith("text/")) {
    return textoParaHtml(await file.text());
  }

  if (nome.endsWith(".docx")) {
    const mammoth = await import("mammoth/mammoth.browser.js");
    const arrayBuffer = await file.arrayBuffer();
    const res = await (mammoth as any).convertToHtml({ arrayBuffer });
    return (res?.value as string) || "<p></p>";
  }

  if (nome.endsWith(".pdf") || file.type === "application/pdf") {
    const pdfjs: any = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const partes: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let linha = "";
      let ultimoY: number | null = null;
      const linhas: string[] = [];
      for (const item of content.items as any[]) {
        const y = item.transform?.[5] ?? null;
        if (ultimoY !== null && y !== null && Math.abs(y - ultimoY) > 2) {
          linhas.push(linha.trim());
          linha = "";
        }
        linha += item.str ?? "";
        if (item.hasEOL) {
          linhas.push(linha.trim());
          linha = "";
        }
        ultimoY = y;
      }
      if (linha.trim()) linhas.push(linha.trim());
      partes.push(linhas.filter(Boolean).join("\n"));
    }
    return textoParaHtml(partes.join("\n\n"));
  }

  if (nome.endsWith(".doc")) {
    throw new Error("Arquivos .doc antigos não são suportados. Salve como .docx e tente novamente.");
  }

  throw new Error("Formato não suportado. Use .docx, .pdf ou .txt.");
}
