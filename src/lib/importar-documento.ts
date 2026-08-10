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
  return paragrafos
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
    .join("");
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
    tabela.removeAttribute("class");
    tabela.querySelectorAll("td,th").forEach((celula) => {
      const el = celula as HTMLElement;
      const ehCabecalho = el.tagName === "TH";
      const alinhamento = el.getAttribute("align") || (ehCabecalho ? "left" : "left");
      // Preserva o fundo/cor vindos do Word (sombreamento de cabeçalho de seção)
      const fundo =
        el.style.backgroundColor ||
        el.getAttribute("bgcolor") ||
        (ehCabecalho ? "#f3f4f6" : "");
      const cor = el.style.color || "";
      el.removeAttribute("bgcolor");
      el.setAttribute(
        "style",
        `border:${BORDA};padding:6px 8px;vertical-align:top;text-align:${alinhamento};` +
          (fundo ? `background-color:${fundo};` : "") +
          (cor ? `color:${cor};` : "") +
          (ehCabecalho ? "font-weight:700;" : ""),
      );
      if (fundo) el.setAttribute("data-bg", fundo);
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
    throw new Error("Arquivos .doc antigos não são suportados. Salve como .docx e tente novamente.");
  }

  throw new Error("Formato não suportado. Use .docx, .pdf ou .txt.");
}
