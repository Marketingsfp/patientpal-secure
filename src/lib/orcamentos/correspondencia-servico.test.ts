import { describe, expect, it } from "bun:test";
import { escolhaSegura, ordenarServicosDoPedido, palavrasDoExame } from "./correspondencia-servico";

type S = { nome: string; preco: number; usos?: number };
const s = (nome: string, preco = 10, usos = 0): S => ({ nome, preco, usos });
const ordenar = (lido: string, lista: S[]) =>
  ordenarServicosDoPedido(
    lido,
    lista,
    (x) => x.usos ?? 0,
    (x) => x.preco,
  );
const escolher = (lido: string, lista: S[]) =>
  escolhaSegura(ordenar(lido, lista), (x) => x.preco)?.nome ?? null;

// Nomes reais da tabela de laboratório (São Francisco, out/2026).
const HEMOGRAMA = [s("HEMOGRAMA (URGENCIA DO DIA)", 20), s("HEMOGRAMA COMPLETO", 15)];
const POTASSIO = [
  s("POTASSIO", 11),
  s("POTASSIO (2)", 12),
  s("POTASSIO RS", 24),
  s("POTASSIO DOSAGEM DE", 11),
  s("POTUR - DOSAGEM URINARIA DE POTASSIO", 7),
];
const TSH = [
  s("TSH", 15),
  s("TSH ULTRA SENSIVEL", 15),
  s("HORMONIO TIREOESTIMULANTE (TSH)", 15),
  s("TSHN-TSH NEONATAL", 36),
  s("ANTICORPO ANTI-RECEPTOR DO TSH (TRAB)", 50),
];

describe("palavrasDoExame", () => {
  it("põe siglas e nomes por extenso na mesma forma", () => {
    expect(palavrasDoExame("Urina tipo 1")).toEqual(["EAS"]);
    expect(palavrasDoExame("EAS (URINA TIPO I)")).toEqual(["EAS"]);
    expect(palavrasDoExame("Beta-HCG")).toEqual(["BHCG"]);
    expect(palavrasDoExame("Hemoglobina glicada")).toEqual(["HBA1C"]);
    expect(palavrasDoExame("Gama GT")).toEqual(["GGT"]);
    expect(palavrasDoExame("Glicemia")).toEqual(["GLICOSE"]);
  });
});

describe("escolha do cadastro", () => {
  it("hemograma vai no completo, não no de urgência", () => {
    expect(escolher("Hemograma", HEMOGRAMA)).toBe("HEMOGRAMA COMPLETO");
    expect(escolher("Hemograma completo", HEMOGRAMA)).toBe("HEMOGRAMA COMPLETO");
  });

  it("TSH vai no cadastro de nome igual, nunca no neonatal", () => {
    expect(escolher("TSH", TSH)).toBe("TSH");
  });

  it("potássio sem qualificador vai no cadastro simples", () => {
    expect(escolher("Potássio", POTASSIO)).toBe("POTASSIO");
  });

  it("urina tipo 1 acha o EAS", () => {
    const lista = [
      s("EAS", 12),
      s("EAS (URINA TIPO I)", 12),
      s("EAS (URGENCIA DO DIA)", 18),
      s("CULTURA URINA", 30),
    ];
    expect(ordenar("Urina tipo 1", lista)[0].servico.nome).toBe("EAS");
  });

  it("erro de uma letra ainda acha o exame", () => {
    expect(escolher("Triglicerídios", [s("TRIGLICERIDEOS", 12), s("COLESTEROL TOTAL", 10)])).toBe(
      "TRIGLICERIDEOS",
    );
  });

  it("o que a recepção mais escolhe desempata cadastros iguais", () => {
    const lista = [s("GLICOSE", 10, 7), s("GLICOSE (BIOQUIMICA)", 10, 23), s("GLICOSE CURVA", 40)];
    expect(escolher("Glicose", lista)).toBe("GLICOSE (BIOQUIMICA)");
  });

  it("cadastro sem preço nunca entra sozinho", () => {
    expect(escolher("Colesterol total", [s("COLESTEROL TOTAL", 0)])).toBeNull();
  });

  it("empate de verdade fica para a recepção, com sugestões ordenadas", () => {
    const lista = [
      s("COLESTEROL TOTAL", 0),
      s("COLESTEROL TOTAL E FRACOES", 25),
      s("LIPIDOGRAMA (COLESTEROL TOTAL)", 10),
      s("COLESTEROL TOTAL ( URGENCIA DO DIA)", 15),
    ];
    expect(escolher("Colesterol total", lista)).toBeNull();
    const nomes = ordenar("Colesterol total", lista).map((x) => x.servico.nome);
    expect(nomes.indexOf("COLESTEROL TOTAL ( URGENCIA DO DIA)")).toBeGreaterThan(
      nomes.indexOf("COLESTEROL TOTAL E FRACOES"),
    );
  });

  it("pedido com palavra a mais que a tabela não tem vira sugestão, não escolha", () => {
    const r = ordenar("Hemograma completo com plaquetas", HEMOGRAMA);
    expect(r[0].servico.nome).toBe("HEMOGRAMA COMPLETO");
    expect(escolher("Hemograma completo com plaquetas", HEMOGRAMA)).toBeNull();
  });

  it("sigla com pontos é uma palavra só e acha o MAPA de Demais Serviços", () => {
    expect(palavrasDoExame("M.A.P.A. 24h")).toEqual(["MAPA", "24H"]);
    expect(escolher("M.A.P.A. 24h", [s("MAPA 24 HORAS", 167), s("HOLTER 24 HORAS", 178)])).toBe(
      "MAPA 24 HORAS",
    );
  });

  it("letra solta ou 24h sozinhos não viram sugestão (caso real: MAPA no Laboratório)", () => {
    const laboratorio = [
      s("ANCA-P", 40),
      s("ZINCO 24H", 80),
      s("FOSFORO (P)", 8),
      s("IMUNOGLOBULINA M", 20),
    ];
    expect(ordenar("M.A.P.A. 24h", laboratorio)).toEqual([]);
  });

  it("nada em comum fica de fora", () => {
    expect(ordenar("Ferritina", POTASSIO)).toEqual([]);
  });
});
