/**
 * Exportação de uma tabela em Word de verdade (.docx).
 *
 * O par natural disto é `exportar-xlsx.ts`: lá a saída é uma planilha para
 * somar e filtrar; aqui é um documento para imprimir, assinar e entregar ao
 * paciente ou anexar ao prontuário. Por isso o .docx sai com título, linhas
 * de contexto e a tabela já formatada, em vez de uma grade crua.
 *
 * O arquivo é montado à mão, sem biblioteca nova: um .docx é um ZIP com três
 * peças XML mínimas, e o ZIP é gravado sem compressão (método "stored"), que
 * o Word abre igual. Trazer uma dependência de centenas de kB para escrever
 * ~200 linhas de XML encareceria o build do Lovable sem ganho nenhum.
 */

/** Uma coluna do documento. */
export type ColunaDocx = {
  rotulo: string;
  /** Alinhamento do conteúdo da coluna (o cabeçalho segue o mesmo). */
  alinhamento?: "esquerda" | "centro" | "direita";
  /** Peso relativo da largura. Sem valor, todas as colunas pesam igual. */
  peso?: number;
};

export type DocumentoTabela = {
  /** Nome do arquivo, com ou sem a extensão. */
  arquivo: string;
  /** Título em destaque no topo da folha. */
  titulo: string;
  /** Linhas de contexto abaixo do título (paciente, período, data de emissão). */
  contexto?: string[];
  colunas: ColunaDocx[];
  /** Já formatado como texto — o Word não soma coluna, quem soma é o Excel. */
  linhas: string[][];
  /** Linha de totais, na mesma ordem das colunas. */
  totais?: string[];
  orientacao?: "retrato" | "paisagem";
};

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ESCAPES[c]);

const ALINHAMENTO: Record<string, string> = {
  esquerda: "left",
  centro: "center",
  direita: "right",
};

/**
 * Largura útil da folha A4 em DXA (1/20 de ponto), já descontadas as margens
 * de 2,54 cm de cada lado que o documento declara no `sectPr`.
 */
const LARGURA_UTIL = { retrato: 9026, paisagem: 13958 } as const;

/** Larguras de cada coluna em DXA, distribuídas pelos pesos informados. */
export function largurasDocx(d: DocumentoTabela): number[] {
  const util = LARGURA_UTIL[d.orientacao ?? "retrato"];
  const pesos = d.colunas.map((c) => Math.max(0.2, c.peso ?? 1));
  const soma = pesos.reduce((a, b) => a + b, 0);
  return pesos.map((p) => Math.max(600, Math.round((p / soma) * util)));
}

function paragrafo(texto: string, opcoes: { negrito?: boolean; alinhamento?: string } = {}) {
  const jc = opcoes.alinhamento ? `<w:jc w:val="${opcoes.alinhamento}"/>` : "";
  const b = opcoes.negrito ? "<w:b/>" : "";
  return (
    `<w:p><w:pPr>${jc}<w:spacing w:before="20" w:after="20"/><w:rPr>${b}<w:sz w:val="18"/></w:rPr></w:pPr>` +
    `<w:r><w:rPr>${b}<w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`
  );
}

function celula(
  texto: string,
  largura: number,
  opcoes: { negrito?: boolean; alinhamento?: string; fundo?: string } = {},
) {
  const shd = opcoes.fundo ? `<w:shd w:val="clear" w:color="auto" w:fill="${opcoes.fundo}"/>` : "";
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${largura}" w:type="dxa"/>${shd}` +
    `<w:vAlign w:val="center"/><w:tcMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar></w:tcPr>` +
    paragrafo(texto, opcoes) +
    `</w:tc>`
  );
}

/**
 * Monta o `word/document.xml`. Fica separado da gravação do arquivo para
 * poder ser conferido em teste, sem navegador e sem tocar em disco.
 */
export function montarDocumentoXml(d: DocumentoTabela): string {
  const larguras = largurasDocx(d);
  const paisagem = d.orientacao === "paisagem";
  const alinhamentos = d.colunas.map((c) => ALINHAMENTO[c.alinhamento ?? "esquerda"]);

  const cabecalho =
    `<w:tr><w:trPr><w:tblHeader/></w:trPr>` +
    d.colunas
      .map((c, i) =>
        celula(c.rotulo, larguras[i], {
          negrito: true,
          alinhamento: alinhamentos[i],
          fundo: "EDF2F7",
        }),
      )
      .join("") +
    `</w:tr>`;

  const corpo = d.linhas
    .map(
      (linha) =>
        `<w:tr>` +
        d.colunas
          .map((_, i) => celula(linha[i] ?? "", larguras[i], { alinhamento: alinhamentos[i] }))
          .join("") +
        `</w:tr>`,
    )
    .join("");

  const totais = d.totais
    ? `<w:tr>` +
      d.colunas
        .map((_, i) =>
          celula(d.totais![i] ?? "", larguras[i], {
            negrito: true,
            alinhamento: alinhamentos[i],
            fundo: "F7FAFC",
          }),
        )
        .join("") +
      `</w:tr>`
    : "";

  const bordas = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="CBD5E0"/>`)
    .join("");

  const tabela =
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${bordas}</w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/></w:tblPr>` +
    `<w:tblGrid>${larguras.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` +
    cabecalho +
    corpo +
    totais +
    `</w:tbl>`;

  const titulo =
    `<w:p><w:pPr><w:spacing w:after="60"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:pPr>` +
    `<w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">${esc(d.titulo)}</w:t></w:r></w:p>`;

  const contexto = (d.contexto ?? []).map((l) => paragrafo(l)).join("");

  const sect =
    `<w:sectPr><w:pgSz w:w="${paisagem ? 16838 : 11906}" w:h="${paisagem ? 11906 : 16838}"${
      paisagem ? ` w:orient="landscape"` : ""
    }/>` +
    `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
    titulo +
    contexto +
    `<w:p/>` +
    tabela +
    sect +
    `</w:body></w:document>`
  );
}

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `</Types>`;

const RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

/** CRC-32 (polinômio do ZIP). Cada peça do pacote precisa do seu. */
function crc32(dados: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < dados.length; i++) {
    c ^= dados[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

/**
 * ZIP sem compressão (método "stored"), o suficiente para um pacote OOXML.
 * Exportado para o teste conseguir abrir o pacote e conferir as peças.
 */
export function zipSemCompressao(arquivos: Array<{ nome: string; texto: string }>): Uint8Array {
  const enc = new TextEncoder();
  const locais: Uint8Array[] = [];
  const centrais: Uint8Array[] = [];
  let offset = 0;

  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const dados = enc.encode(a.texto);
    const crc = crc32(dados);

    const local = new Uint8Array(30 + nome.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true); // método 0 = stored
    lv.setUint16(10, 0, true); // hora
    lv.setUint16(12, 0x21, true); // data: 01/01/1980
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dados.length, true);
    lv.setUint32(22, dados.length, true);
    lv.setUint16(26, nome.length, true);
    local.set(nome, 30);
    locais.push(local, dados);

    const central = new Uint8Array(46 + nome.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dados.length, true);
    cv.setUint32(24, dados.length, true);
    cv.setUint16(28, nome.length, true);
    cv.setUint32(42, offset, true);
    central.set(nome, 46);
    centrais.push(central);

    offset += local.length + dados.length;
  }

  const tamanhoCentral = centrais.reduce((a, b) => a + b.length, 0);
  const fim = new Uint8Array(22);
  const fv = new DataView(fim.buffer);
  fv.setUint32(0, 0x06054b50, true);
  fv.setUint16(8, arquivos.length, true);
  fv.setUint16(10, arquivos.length, true);
  fv.setUint32(12, tamanhoCentral, true);
  fv.setUint32(16, offset, true);

  const partes = [...locais, ...centrais, fim];
  const total = partes.reduce((a, p) => a + p.length, 0);
  const saida = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    saida.set(p, pos);
    pos += p.length;
  }
  return saida;
}

/** As três peças que formam o pacote .docx, na ordem em que entram no ZIP. */
export function pecasDoPacote(d: DocumentoTabela) {
  return [
    { nome: "[Content_Types].xml", texto: CONTENT_TYPES },
    { nome: "_rels/.rels", texto: RELS },
    { nome: "word/document.xml", texto: montarDocumentoXml(d) },
  ];
}

/** Monta e baixa o .docx. Roda só no navegador — é dele a pasta de downloads. */
export function exportarTabelaDocx(d: DocumentoTabela): void {
  const pacote = zipSemCompressao(pecasDoPacote(d));
  const blob = new Blob([pacote as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = d.arquivo.endsWith(".docx") ? d.arquivo : `${d.arquivo}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
