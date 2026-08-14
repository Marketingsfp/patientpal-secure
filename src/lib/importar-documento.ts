/**
 * Extrai conteúdo de arquivos .docx, .pdf e .txt no navegador
 * e devolve HTML limpo (tabelas, títulos, negrito, alinhamento)
 * pronto para injetar no editor.
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
  return paragrafos.map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br />")}</p>`).join("");
}

const BORDA = "1px solid #111827";
const AZUL_CABECALHO = "#1b365d";

/**
 * Normaliza o HTML gerado pelo mammoth aplicando CSS inline nas tabelas,
 * células e títulos, para que o documento importado fique visualmente
 * igual ao original (bordas, padding, negrito e alinhamento).
 */
function normalizarHtmlDocx(html: string): string {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<div id="raiz">${html}</div>`, "text/html");
  const raiz = doc.getElementById("raiz");
  if (!raiz) return html;

  // Tabelas
  raiz.querySelectorAll("table").forEach((tabela) => {
    tabela.setAttribute(
      "style",
      `width:100%;border-collapse:collapse;table-layout:fixed;border:${BORDA};margin:8px 0;`,
    );
    tabela.setAttribute("class", "contract-table");
    tabela.querySelectorAll("td,th").forEach((celula) => {
      const el = celula as HTMLElement;
      const ehCabecalho = el.tagName === "TH";
      const alinhamento = el.getAttribute("align") || (ehCabecalho ? "left" : "left");
      // Preserva o fundo/cor vindos do Word (sombreamento de cabeçalho de seção)
      // Só linhas de cabeçalho de seção (célula que ocupa a largura toda da
      // tabela) ficam azuis. Células estreitas — como a coluna de números
      // 1/2/3 — nunca herdam fundo, para não virar tarja azul vertical.
      const colspan = Number(el.getAttribute("colspan") || "1");
      const linha = el.parentElement as HTMLElement | null;
      const celulasDaLinha = linha ? linha.querySelectorAll("td,th").length : 1;
      const ehFaixaCabecalho = celulasDaLinha === 1 || colspan > 1;
      const fundo = ehFaixaCabecalho ? AZUL_CABECALHO : "";
      const cor = ehFaixaCabecalho ? "#ffffff" : "";
      el.removeAttribute("bgcolor");
      el.style.removeProperty("background-color");
      el.setAttribute(
        "style",
        `border:${BORDA};padding:6px 8px;vertical-align:top;text-align:${alinhamento};` +
          (fundo ? `background-color:${fundo};` : "") +
          (cor ? `color:${cor};` : "") +
          (ehCabecalho || ehFaixaCabecalho ? "font-weight:700;" : ""),
      );
      if (fundo) el.setAttribute("data-bg", fundo);
      else el.removeAttribute("data-bg");
      if (ehFaixaCabecalho) el.setAttribute("data-header-row", "1");
      el.removeAttribute("class");
      // Parágrafos dentro da célula sem margem, para não "inflar" a linha
      el.querySelectorAll("p").forEach((p) => {
        (p as HTMLElement).style.margin = "0";
      });
    });
  });

  // Alinhamento preservado pelo mammoth via classes/estilos do Word
  raiz.querySelectorAll("p,h1,h2,h3,h4,li").forEach((no) => {
    const el = no as HTMLElement;
    const classe = el.getAttribute("class") || "";
    if (/center/i.test(classe)) el.style.textAlign = "center";
    else if (/right/i.test(classe)) el.style.textAlign = "right";
    else if (/justif/i.test(classe)) el.style.textAlign = "justify";
    el.removeAttribute("class");
  });

  // Remove parágrafos totalmente vazios em sequência
  raiz.querySelectorAll("p").forEach((p) => {
    if (!p.textContent?.trim() && !p.querySelector("img")) p.remove();
  });

  return raiz.innerHTML || "<p></p>";
}

const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Título'] => h1:fresh",
  "p[style-name='Título 1'] => h1:fresh",
  "p[style-name='Título 2'] => h2:fresh",
  "p[style-name='Título 3'] => h3:fresh",
  "b => strong",
  "i => em",
  "u => u",
  "strike => s",
].join("\n");

export async function extrairHtmlDeArquivo(file: File): Promise<string> {
  const nome = file.name.toLowerCase();

  if (nome.endsWith(".html") || nome.endsWith(".htm") || file.type === "text/html") {
    // HTML nativo: injeta o código exatamente como veio, preservando
    // estilos inline, tabelas e classes. Só extrai o conteúdo do <body>
    // quando o arquivo for um documento completo.
    const bruto = await file.text();
    const corpo = bruto.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const html = (corpo ? corpo[1] : bruto).replace(/<script[\s\S]*?<\/script>/gi, "").trim();
    return html || "<p></p>";
  }

  if (nome.endsWith(".txt") || file.type.startsWith("text/")) {
    return textoParaHtml(await file.text());
  }

  if (nome.endsWith(".docx")) {
    const mammothUrl = "https://esm.sh/mammoth@1.12.1/mammoth.browser.js";
    const mammoth: any = await import(/* @vite-ignore */ mammothUrl);
    const lib = mammoth.default ?? mammoth;
    const arrayBuffer = await file.arrayBuffer();
    const res = await lib.convertToHtml(
      { arrayBuffer },
      {
        styleMap: STYLE_MAP,
        includeDefaultStyleMap: true,
        ignoreEmptyParagraphs: true,
        convertImage: lib.images?.imgElement
          ? lib.images.imgElement(async (image: any) => {
              const base64 = await image.read("base64");
              return { src: `data:${image.contentType};base64,${base64}` };
            })
          : undefined,
      },
    );
    return normalizarHtmlDocx((res?.value as string) || "") || "<p></p>";
  }

  if (nome.endsWith(".pdf") || file.type === "application/pdf") {
    const pdfjsUrl = "https://esm.sh/pdfjs-dist@4.7.76/build/pdf.min.mjs";
    const pdfjs: any = await import(/* @vite-ignore */ pdfjsUrl);
    pdfjs.GlobalWorkerOptions.workerSrc =
      "https://esm.sh/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs";
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
    throw new Error(
      "Arquivos .doc antigos não são suportados. Salve como .docx e tente novamente.",
    );
  }

  throw new Error("Formato não suportado. Use .docx, .pdf ou .txt.");
}
