/**
 * Sanitiza HTML vindo da área de transferência (MS Word / Google Docs)
 * preservando a estrutura de tabelas (table/tr/td/th), colspan/rowspan
 * e o sombreamento das células (background-color / bgcolor).
 */

const ESTILOS_MANTIDOS = new Set([
  "background-color",
  "background",
  "color",
  "text-align",
  "vertical-align",
  "font-weight",
  "font-style",
  "text-decoration",
  "width",
  "height",
  "border",
  "font-family",
  "font-size",
]);

function limparEstilo(valor: string): string {
  return valor
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .filter((d) => {
      const prop = d.split(":")[0]?.trim().toLowerCase() ?? "";
      if (!prop || prop.startsWith("mso-") || prop.startsWith("-webkit-")) return false;
      return ESTILOS_MANTIDOS.has(prop);
    })
    .map((d) => {
      const [p, ...resto] = d.split(":");
      const prop = p.trim().toLowerCase();
      const val = resto.join(":").trim();
      // "background: #fff none repeat" -> background-color
      if (prop === "background") {
        const cor = val.split(/\s+/).find((t) => /^(#|rgb|hsl)/i.test(t));
        return cor ? `background-color: ${cor}` : "";
      }
      return `${prop}: ${val}`;
    })
    .filter(Boolean)
    .join("; ");
}

export function limparHtmlColado(html: string): string {
  if (!html || typeof window === "undefined" || typeof DOMParser === "undefined") return html;

  // Remove wrappers/condicionais do Word antes do parse
  const bruto = html
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "")
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/?(o|w|m|v|st1):[^>]*>/gi, "");

  const doc = new DOMParser().parseFromString(`<div id="raiz">${bruto}</div>`, "text/html");
  const raiz = doc.getElementById("raiz");
  if (!raiz) return bruto;

  raiz.querySelectorAll("meta,link,style,script,xml,o\\:p").forEach((n) => n.remove());

  raiz.querySelectorAll<HTMLElement>("*").forEach((el) => {
    // Classes do Word (MsoNormal, MsoTableGrid…) não servem para nada aqui
    const classe = el.getAttribute("class") || "";
    if (/^\s*(Mso|Table)/i.test(classe) || classe.includes("Mso")) el.removeAttribute("class");

    // bgcolor -> background-color inline (o Word ainda usa o atributo legado)
    const bgcolor = el.getAttribute("bgcolor");
    if (bgcolor) {
      el.style.backgroundColor = bgcolor;
      el.removeAttribute("bgcolor");
    }
    const align = el.getAttribute("align");
    if (align && /^(td|th|tr|table)$/i.test(el.tagName)) {
      el.style.textAlign = align;
      el.removeAttribute("align");
    }
    const valign = el.getAttribute("valign");
    if (valign) {
      el.style.verticalAlign = valign;
      el.removeAttribute("valign");
    }

    const estilo = limparEstilo(el.getAttribute("style") || "");
    if (estilo) el.setAttribute("style", estilo);
    else el.removeAttribute("style");

    // Marca fundo em data-bg para o schema das células preservar
    if (/^(td|th)$/i.test(el.tagName)) {
      const fundo = el.style.backgroundColor;
      if (fundo) el.setAttribute("data-bg", fundo);
      const colspan = el.getAttribute("colspan");
      const rowspan = el.getAttribute("rowspan");
      if (colspan === "1") el.removeAttribute("colspan");
      if (rowspan === "1") el.removeAttribute("rowspan");
      // Célula vazia do Word precisa de um parágrafo para não colapsar
      if (!el.textContent?.trim() && !el.querySelector("img")) el.innerHTML = "<p></p>";
    }

    // Tabelas responsivas: largura sempre relativa
    if (/^table$/i.test(el.tagName)) {
      el.removeAttribute("width");
      el.style.width = "100%";
      el.style.borderCollapse = "collapse";
    }
  });

  // Remove spans sem estilo (Word cria uma pilha deles)
  raiz.querySelectorAll("span").forEach((span) => {
    if (!span.getAttribute("style")) span.replaceWith(...Array.from(span.childNodes));
  });

  return raiz.innerHTML;
}
