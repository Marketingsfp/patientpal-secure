import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { RelatorioDiario } from "./relatorio-diario.server";
import { rotuloTipo } from "./relatorio-diario.server";

/** Remove caracteres fora do WinAnsi (emojis etc.) que quebram as fontes padrão do PDF. */
function limpar(s: string): string {
  return (s ?? "")
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00A0/g, " ")
    .trim();
}

export async function gerarRelatorioPdf(rel: RelatorioDiario): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const A4: [number, number] = [595.28, 841.89];
  const M = 48;
  const LARGURA = A4[0] - M * 2;

  let page = doc.addPage(A4);
  let y = A4[1] - M;

  const novaPagina = () => {
    page = doc.addPage(A4);
    y = A4[1] - M;
  };

  const quebrar = (texto: string, size: number, font = regular, largura = LARGURA) => {
    const linhas: string[] = [];
    for (const paragrafo of limpar(texto).split("\n")) {
      let atual = "";
      for (const palavra of paragrafo.split(/\s+/)) {
        const teste = atual ? `${atual} ${palavra}` : palavra;
        if (font.widthOfTextAtSize(teste, size) > largura && atual) {
          linhas.push(atual);
          atual = palavra;
        } else {
          atual = teste;
        }
      }
      linhas.push(atual);
    }
    return linhas;
  };

  const escrever = (
    texto: string,
    opts: { size?: number; font?: typeof regular; cor?: [number, number, number]; recuo?: number; espaco?: number } = {},
  ) => {
    const size = opts.size ?? 10;
    const font = opts.font ?? regular;
    const cor = opts.cor ?? [0.15, 0.16, 0.2];
    const recuo = opts.recuo ?? 0;
    for (const linha of quebrar(texto, size, font, LARGURA - recuo)) {
      if (y < M + 40) novaPagina();
      page.drawText(linha, {
        x: M + recuo,
        y,
        size,
        font,
        color: rgb(cor[0], cor[1], cor[2]),
      });
      y -= size + 4;
    }
    y -= opts.espaco ?? 0;
  };

  const [ano, mes, dia] = rel.data.split("-");
  const dataBr = `${dia}/${mes}/${ano}`;

  // Cabeçalho
  page.drawRectangle({ x: 0, y: A4[1] - 92, width: A4[0], height: 92, color: rgb(0.06, 0.35, 0.29) });
  page.drawText("Relatorio diario de desenvolvimento", {
    x: M,
    y: A4[1] - 46,
    size: 17,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText(`${dataBr}  -  janela ${rel.janela}`, {
    x: M,
    y: A4[1] - 68,
    size: 11,
    font: regular,
    color: rgb(0.85, 0.94, 0.9),
  });
  y = A4[1] - 122;

  escrever("Resumo do dia", { size: 13, font: bold, espaco: 4 });
  escrever(rel.resumo, { size: 10.5, espaco: 12 });

  // Números
  const kpis = [
    `Alteracoes: ${rel.total}`,
    `Loops de erro: ${rel.loops.length}`,
    `Areas: ${rel.porArea.length}`,
  ];
  escrever(kpis.join("     |     "), { size: 10.5, font: bold, cor: [0.06, 0.35, 0.29], espaco: 12 });

  if (rel.porArea.length) {
    escrever("Por area", { size: 12, font: bold, espaco: 2 });
    for (const a of rel.porArea) escrever(`- ${a.area}: ${a.total}`, { size: 10, recuo: 8 });
    y -= 8;
  }

  if (rel.porTipo.length) {
    escrever("Por tipo", { size: 12, font: bold, espaco: 2 });
    for (const t of rel.porTipo) escrever(`- ${rotuloTipo(t.tipo)}: ${t.total}`, { size: 10, recuo: 8 });
    y -= 8;
  }

  escrever("O que mudou", { size: 13, font: bold, espaco: 4 });
  if (!rel.entradas.length) {
    escrever("Nenhuma alteracao registrada nesta janela.", { size: 10, espaco: 8 });
  } else {
    for (const e of rel.entradas) {
      const area = e.area ? ` - ${e.area}` : "";
      escrever(`${e.hora.slice(0, 5)}  ${rotuloTipo(e.tipo)}${area}`, {
        size: 9,
        font: bold,
        cor: [0.06, 0.35, 0.29],
      });
      escrever(e.titulo, { size: 10.5, font: bold });
      if (e.descricao) escrever(e.descricao, { size: 10, recuo: 8, cor: [0.3, 0.32, 0.36] });
      y -= 8;
    }
  }

  y -= 4;
  escrever("Loops de erro (assuntos que voltaram)", { size: 13, font: bold, espaco: 4 });
  if (!rel.loops.length) {
    escrever("Nenhum loop de erro identificado no periodo.", { size: 10 });
  } else {
    for (const l of rel.loops) {
      const marca = l.manual ? "marcado manualmente" : `${l.datas.length}x em 30 dias`;
      escrever(`- ${l.titulo} (${marca})`, { size: 10.5, font: bold });
      if (l.motivo) escrever(l.motivo, { size: 10, recuo: 10, cor: [0.3, 0.32, 0.36] });
      if (l.datas.length) escrever(`Datas: ${l.datas.join(", ")}`, { size: 9, recuo: 10, cor: [0.45, 0.47, 0.5] });
      y -= 6;
    }
  }

  // Rodapé em todas as páginas
  const paginas = doc.getPages();
  paginas.forEach((p, i) => {
    p.drawText(`ClinicaOS - gerado automaticamente - pagina ${i + 1} de ${paginas.length}`, {
      x: M,
      y: 26,
      size: 8,
      font: regular,
      color: rgb(0.5, 0.52, 0.55),
    });
  });

  return await doc.save();
}

export function nomeArquivoRelatorio(data: string) {
  return `relatorio-diario-${data}.pdf`;
}
