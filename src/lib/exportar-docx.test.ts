import { describe, expect, it } from "bun:test";
import {
  largurasDocx,
  montarDocumentoXml,
  pecasDoPacote,
  zipSemCompressao,
  type DocumentoTabela,
} from "./exportar-docx";

const doc: DocumentoTabela = {
  arquivo: "orcamentos",
  titulo: "Orçamentos de Odontologia",
  contexto: ["Paciente: MARIA & JOSÉ", "Emitido em 03/09/2026"],
  colunas: [
    { rotulo: "Nº", peso: 1 },
    { rotulo: "Procedimento", peso: 3 },
    { rotulo: "Total", alinhamento: "direita", peso: 1 },
  ],
  linhas: [
    ["D-2026-00001", "IMPLANTE", "R$ 2.200,00"],
    ["D-2026-00003", "RESINA <M>", "R$ 190,00"],
  ],
  totais: ["TOTAL", "", "R$ 2.390,00"],
  orientacao: "paisagem",
};

describe("montarDocumentoXml", () => {
  it("abre com o título e as linhas de contexto antes da tabela", () => {
    const xml = montarDocumentoXml(doc);
    expect(xml.indexOf("Orçamentos de Odontologia")).toBeLessThan(xml.indexOf("<w:tbl>"));
    expect(xml.indexOf("Emitido em 03/09/2026")).toBeLessThan(xml.indexOf("<w:tbl>"));
  });

  it("escapa & e < para o XML não quebrar o arquivo no Word", () => {
    const xml = montarDocumentoXml(doc);
    expect(xml).toContain("MARIA &amp; JOSÉ");
    expect(xml).toContain("RESINA &lt;M&gt;");
    expect(xml).not.toContain("RESINA <M>");
  });

  it("repete o cabeçalho da tabela quando ela vira a página", () => {
    expect(montarDocumentoXml(doc)).toContain("<w:tblHeader/>");
  });

  it("marca a folha como paisagem quando pedido", () => {
    expect(montarDocumentoXml(doc)).toContain('w:orient="landscape"');
    expect(montarDocumentoXml({ ...doc, orientacao: "retrato" })).not.toContain("landscape");
  });

  it("gera uma linha da tabela por registro, mais cabeçalho e totais", () => {
    const linhas = montarDocumentoXml(doc).match(/<w:tr>|<w:tr><w:trPr>/g) ?? [];
    expect(linhas.length).toBe(doc.linhas.length + 2);
  });
});

describe("largurasDocx", () => {
  it("distribui a folha pelos pesos das colunas", () => {
    const [n, proc, total] = largurasDocx(doc);
    expect(proc).toBeGreaterThan(n);
    expect(n + proc + total).toBeLessThanOrEqual(13958 + 3);
  });
});

describe("zipSemCompressao", () => {
  it("assina o pacote como ZIP e fecha com o diretório central", () => {
    const zip = zipSemCompressao(pecasDoPacote(doc));
    const vista = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(vista.getUint32(0, true)).toBe(0x04034b50); // 1º arquivo
    expect(vista.getUint32(zip.length - 22, true)).toBe(0x06054b50); // fim do ZIP
    expect(vista.getUint16(zip.length - 22 + 10, true)).toBe(3); // 3 peças
  });

  it("guarda cada peça sem compressão, com o tamanho declarado igual ao real", () => {
    const pecas = pecasDoPacote(doc);
    const zip = zipSemCompressao(pecas);
    const vista = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(vista.getUint16(8, true)).toBe(0); // método 0 = stored
    const tamanho = new TextEncoder().encode(pecas[0].texto).length;
    expect(vista.getUint32(18, true)).toBe(tamanho);
    expect(vista.getUint32(22, true)).toBe(tamanho);
  });
});
