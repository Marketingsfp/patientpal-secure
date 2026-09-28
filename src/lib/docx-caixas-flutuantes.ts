/**
 * Pré-processa o document.xml de um .docx antes do mammoth.
 *
 * Caixas de texto e imagens "flutuantes" do Word (wp:anchor) são posicionadas
 * por coordenada na página. O mammoth ignora a posição e despeja o conteúdo
 * delas em parágrafos soltos, um embaixo do outro — o cabeçalho do contrato
 * (Data, logo, Contrato, Código) vira uma coluna. Aqui cada parágrafo que
 * ancora caixas vira uma tabela de uma linha, com as caixas lado a lado na
 * ordem horizontal e espaçadores no lugar dos vãos.
 *
 * Cada célula recebe um marcador de texto (MARCA_INICIO…MARCA_FIM) com o tipo e
 * a largura em %, que sobrevive ao mammoth e é lido por normalizarHtmlDocx
 * para desenhar a tabela sem bordas.
 */

import { escreverZip, lerZip } from "./zip-simples";

export const MARCA_INICIO = "";
export const MARCA_FIM = "";
export type TipoCelulaLayout = "caixa" | "faixa" | "imagem" | "texto" | "vazio";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const MC = "http://schemas.openxmlformats.org/markup-compatibility/2006";

const EMU_POR_TWIP = 635;
const EMU_POR_CM = 360000;
// Abaixo disso, caixa sem texto é o quadradinho de marcar (S / N).
const LADO_MAX_QUADRADINHO = 0.6 * EMU_POR_CM;
// Vão horizontal menor que isso não vira célula espaçadora.
const VAO_MIN = 0.4 * EMU_POR_CM;

function filhos(el: Element, ns: string, nome: string): Element[] {
  return Array.from(el.childNodes).filter(
    (n): n is Element =>
      n.nodeType === 1 && (n as Element).namespaceURI === ns && (n as Element).localName === nome,
  );
}

function ancestral(el: Element, ns: string, nome: string, limite?: Element): Element | null {
  let atual = el.parentNode as Element | null;
  while (atual && atual !== limite && atual.nodeType === 1) {
    if (atual.namespaceURI === ns && atual.localName === nome) return atual;
    atual = atual.parentNode as Element | null;
  }
  return null;
}

/** Run de nível mais alto do parágrafo que contém o elemento. */
function runDoParagrafo(el: Element, p: Element): Element | null {
  let atual: Node | null = el;
  while (atual && atual.parentNode !== p) atual = atual.parentNode;
  return (atual as Element) ?? null;
}

/**
 * Texto que aparece no parágrafo, sem o conteúdo de desenhos/caixas embutidos
 * (textContent traria também números internos de posição, como posOffset).
 */
function textoVisivel(el: Element) {
  return Array.from(el.getElementsByTagNameNS(W, "t"))
    .filter((t) => {
      for (let n = t.parentNode as Element | null; n && n !== el; n = n.parentNode as Element) {
        if (["drawing", "pict", "AlternateContent"].includes(n.localName)) return false;
      }
      return true;
    })
    .map((t) => t.textContent ?? "")
    .join("")
    .trim();
}

function numero(v: string | null | undefined, padrao = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : padrao;
}

function temCorBrancaNoTexto(caixa: Element) {
  return Array.from(caixa.getElementsByTagNameNS(W, "color")).some((c) =>
    /^(FFFFFF|white)$/i.test(c.getAttributeNS(W, "val") ?? c.getAttribute("w:val") ?? ""),
  );
}

function temPreenchimento(anchor: Element) {
  const spPr = anchor.getElementsByTagNameNS(
    "http://schemas.microsoft.com/office/word/2010/wordprocessingShape",
    "spPr",
  )[0];
  if (!spPr) return false;
  if (filhos(spPr, A, "noFill").length) return false;
  if (filhos(spPr, A, "solidFill").length || filhos(spPr, A, "gradFill").length) return true;
  const fillRef = anchor.getElementsByTagNameNS(A, "fillRef")[0];
  return !!fillRef && numero(fillRef.getAttribute("idx")) > 0;
}

function temContorno(anchor: Element) {
  const ln = anchor.getElementsByTagNameNS(A, "ln")[0];
  if (!ln) return false;
  if (filhos(ln, A, "noFill").length) return false;
  return filhos(ln, A, "solidFill").length > 0;
}

type Item = {
  x: number;
  largura: number;
  tipo: TipoCelulaLayout;
  conteudo: Element[];
};

export function achatarCaixasFlutuantes(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return xml;
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  if (!body) return xml;

  const attrW = (el: Element | undefined, nome: string) =>
    el ? (el.getAttributeNS(W, nome) ?? el.getAttribute(`w:${nome}`)) : null;
  const sect = body.getElementsByTagNameNS(W, "sectPr")[0];
  const pgSz = sect?.getElementsByTagNameNS(W, "pgSz")[0];
  const pgMar = sect?.getElementsByTagNameNS(W, "pgMar")[0];
  const margemEsq = numero(attrW(pgMar, "left"), 1134) * EMU_POR_TWIP;
  const larguraPagina = numero(attrW(pgSz, "w"), 11906) * EMU_POR_TWIP;
  const larguraUtil =
    larguraPagina - margemEsq - numero(attrW(pgMar, "right"), 1134) * EMU_POR_TWIP;
  if (larguraUtil <= 0) return xml;

  const novo = (nome: string) => doc.createElementNS(W, `w:${nome}`);
  const runTexto = (texto: string) => {
    const r = novo("r");
    const t = novo("t");
    t.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
    t.textContent = texto;
    r.appendChild(t);
    return r;
  };
  const marca = (tipo: TipoCelulaLayout, pct: number) =>
    runTexto(`${MARCA_INICIO}${tipo}|${pct.toFixed(1)}${MARCA_FIM}`);

  const posicaoX = (anchor: Element, largura: number) => {
    const posH = anchor.getElementsByTagNameNS(WP, "positionH")[0];
    const rel = posH?.getAttribute("relativeFrom") ?? "column";
    const alinhar = posH?.getElementsByTagNameNS(WP, "align")[0]?.textContent?.trim();
    const offset = numero(posH?.getElementsByTagNameNS(WP, "posOffset")[0]?.textContent);
    const ehPagina = rel === "page" || rel === "leftMargin";
    const base = ehPagina ? larguraPagina : larguraUtil;
    let x = offset;
    if (alinhar === "center") x = (base - largura) / 2;
    else if (alinhar === "right") x = base - largura;
    else if (alinhar === "left") x = 0;
    if (ehPagina) x -= margemEsq;
    return Math.max(0, Math.min(x, larguraUtil - Math.min(largura, larguraUtil)));
  };

  // Só as âncoras "de verdade": a cópia VML em mc:Fallback é ignorada.
  const ancoras = Array.from(doc.getElementsByTagNameNS(WP, "anchor")).filter(
    (a) => !ancestral(a, MC, "Fallback"),
  );

  // Quadradinhos de marcar viram "☐". Numa linha de tabela com uma célula de
  // palavras curtas, uma por quadradinho (ex.: "S        N" no quadro da LGPD),
  // cada palavra ganha o seu: "☐ S     ☐ N".
  const quadradinhosPorLinha = new Map<Element, { p: Element; run: Element }[]>();
  for (const a of ancoras) {
    const ext = a.getElementsByTagNameNS(WP, "extent")[0];
    const cx = numero(ext?.getAttribute("cx"));
    const cy = numero(ext?.getAttribute("cy"));
    const texto = Array.from(a.getElementsByTagNameNS(W, "t"))
      .map((t) => t.textContent)
      .join("")
      .trim();
    const temImagem = a.getElementsByTagNameNS(A, "blip").length > 0;
    if (texto || temImagem || cx > LADO_MAX_QUADRADINHO || cy > LADO_MAX_QUADRADINHO) continue;
    const p = ancestral(a, W, "p");
    if (!p || ancestral(p, W, "txbxContent")) continue;
    const run = runDoParagrafo(a, p);
    if (!run) continue;
    const tr = ancestral(p, W, "tr");
    if (tr) {
      const lista = quadradinhosPorLinha.get(tr) ?? [];
      lista.push({ p, run });
      quadradinhosPorLinha.set(tr, lista);
    } else {
      p.replaceChild(runTexto("☐ "), run);
    }
  }
  quadradinhosPorLinha.forEach((lista, tr) => {
    let alvo: Element | null = null;
    let palavras: string[] = [];
    for (const tc of filhos(tr, W, "tc")) {
      const comTexto = filhos(tc, W, "p").filter((p) => textoVisivel(p));
      if (comTexto.length !== 1) continue;
      const ws = textoVisivel(comTexto[0]).split(/\s+/);
      if (ws.length === lista.length && ws.every((w) => w.length <= 3)) {
        alvo = comTexto[0];
        palavras = ws;
        break;
      }
    }
    if (!alvo) {
      lista.forEach(({ p, run }) => p.replaceChild(runTexto("☐ "), run));
      return;
    }
    lista.forEach(({ run }) => run.parentNode?.removeChild(run));
    // Mantém a formatação (negrito etc.) do primeiro trecho de texto.
    const rPr = alvo.getElementsByTagNameNS(W, "rPr")[0]?.cloneNode(true);
    const alvoFinal = alvo;
    Array.from(alvoFinal.childNodes)
      .filter((n) => !(n.nodeType === 1 && (n as Element).localName === "pPr"))
      .forEach((n) => alvoFinal.removeChild(n));
    const r = runTexto(palavras.map((w) => `☐ ${w}`).join("     "));
    if (rPr) r.insertBefore(rPr, r.firstChild);
    alvoFinal.appendChild(r);
  });

  const paragrafos = filhos(body, W, "p");
  for (const p of paragrafos) {
    const itens: Item[] = [];
    const runsUsados = new Set<Element>();
    for (const a of ancoras) {
      if (ancestral(a, W, "p") !== p) continue;
      const run = runDoParagrafo(a, p);
      if (!run || !run.parentNode) continue;
      const ext = a.getElementsByTagNameNS(WP, "extent")[0];
      const largura = Math.min(numero(ext?.getAttribute("cx")), larguraUtil);
      if (largura <= 0) continue;
      const caixaTexto = a.getElementsByTagNameNS(W, "txbxContent")[0];
      const temImagem = a.getElementsByTagNameNS(A, "blip").length > 0;
      let item: Item | null = null;
      if (caixaTexto) {
        const blocos = Array.from(caixaTexto.childNodes).filter(
          (n): n is Element => n.nodeType === 1 && ["p", "tbl"].includes((n as Element).localName),
        );
        if (!blocos.some((b) => textoVisivel(b))) continue;
        const faixa = temPreenchimento(a) || temCorBrancaNoTexto(caixaTexto);
        item = {
          x: posicaoX(a, largura),
          largura,
          tipo: faixa ? "faixa" : temContorno(a) ? "caixa" : "texto",
          conteudo: blocos.map((b) => b.cloneNode(true) as Element),
        };
      } else if (temImagem) {
        const r = novo("r");
        const drawing = novo("drawing");
        drawing.appendChild(a.cloneNode(true));
        r.appendChild(drawing);
        const pImg = novo("p");
        pImg.appendChild(r);
        item = { x: posicaoX(a, largura), largura, tipo: "imagem", conteudo: [pImg] };
      }
      if (!item) continue;
      itens.push(item);
      runsUsados.add(run);
    }
    if (!itens.length) continue;

    itens.sort((a, b) => a.x - b.x);
    const tr = novo("tr");
    const pct = (emu: number) => (emu / larguraUtil) * 100;
    const celula = (tipo: TipoCelulaLayout, largura: number, conteudo: Element[]) => {
      const tc = novo("tc");
      const blocos = conteudo.length ? conteudo : [novo("p")];
      // O marcador vai no primeiro parágrafo (ou num parágrafo próprio, se o
      // primeiro bloco for uma tabela).
      let alvo = blocos[0];
      if (alvo.localName !== "p") {
        alvo = novo("p");
        blocos.unshift(alvo);
      }
      const pPr = filhos(alvo, W, "pPr")[0];
      const m = marca(tipo, pct(largura));
      if (pPr) pPr.after(m);
      else alvo.insertBefore(m, alvo.firstChild);
      blocos.forEach((b) => tc.appendChild(b));
      tr.appendChild(tc);
    };
    let cursor = 0;
    for (const item of itens) {
      const vao = item.x - cursor;
      if (vao > VAO_MIN) celula("vazio", vao, []);
      const largura = Math.min(item.largura, larguraUtil - Math.max(cursor, item.x));
      if (largura <= 0) continue;
      celula(item.tipo, largura, item.conteudo);
      cursor = Math.max(cursor, item.x) + largura;
    }
    if (larguraUtil - cursor > VAO_MIN) celula("vazio", larguraUtil - cursor, []);

    const tbl = novo("tbl");
    tbl.appendChild(novo("tblPr"));
    tbl.appendChild(tr);
    body.insertBefore(tbl, p);

    runsUsados.forEach((r) => r.parentNode?.removeChild(r));
    if (!textoVisivel(p) && !p.getElementsByTagNameNS(A, "blip").length) {
      body.removeChild(p);
    }
  }

  return new XMLSerializer().serializeToString(doc);
}

/** Devolve o .docx com as caixas flutuantes do corpo reorganizadas em linhas. */
export async function reorganizarCaixasDoDocx(arquivo: ArrayBuffer): Promise<ArrayBuffer> {
  const partes = await lerZip(arquivo);
  const caminho = "word/document.xml";
  const xml = partes.get(caminho);
  if (!xml) return arquivo;
  const original = new TextDecoder().decode(xml);
  const alterado = achatarCaixasFlutuantes(original);
  if (alterado === original) return arquivo;
  partes.set(caminho, new TextEncoder().encode(alterado));
  return escreverZip(partes);
}
