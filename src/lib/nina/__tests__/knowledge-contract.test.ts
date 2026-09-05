import { describe, it, expect } from "bun:test";
import {
  montarResultadoConhecimento,
  detectarConflitos,
  type RegistroConhecimento,
} from "../knowledge-contract";

const base = { versao: 3, arquivo: "tabela.xlsx" };
const reg = (r: Partial<RegistroConhecimento>): RegistroConhecimento => ({
  id: "r1",
  procedimento: "Consulta Cardiologia",
  medico: "Dr. A",
  preco_dinheiro: 200,
  aba_origem: "Consultas",
  linha_origem: 12,
  ...r,
});

describe("Fonte de verdade — pergunta presente na planilha", () => {
  const r = montarResultadoConhecimento({ registros: [reg({})], base });
  it("marca found", () => expect(r.knowledge_status).toBe("found"));
  it("identifica a fonte", () => {
    expect(r.source).toBe("nina_knowledge_base");
    expect(r.source_type).toBe("spreadsheet");
  });
  it("traz o fato da planilha", () => expect(r.price).toBe("R$ 200,00"));
  it("registra rastreabilidade (aba, linha, registro)", () =>
    expect(r.trace[0]).toEqual({
      record_id: "r1",
      sheet: "Consultas",
      row: 12,
      item: "Consulta Cardiologia",
    }));
});

describe("Pergunta ausente — Nina não inventa", () => {
  const r = montarResultadoConhecimento({ registros: [], base });
  it("marca not_found", () => expect(r.knowledge_status).toBe("not_found"));
  it("não devolve preço nem médicos", () => {
    expect(r.price).toBeNull();
    expect(r.doctors).toEqual([]);
  });
  it("proíbe conhecimento pré-treinado na instrução", () =>
    expect(r.instrucao).toMatch(/pré-treinado/i));
  it("não devolve nenhum fato quando o modelo 'saberia' por treinamento", () => {
    // Ex.: preparo de jejum para exame de sangue não cadastrado.
    expect(r.found).toBe(false);
    expect(r.records).toHaveLength(0);
    expect(r.notes).toEqual([]);
  });
});

describe("Informação contraditória — conflict/handoff", () => {
  const registros = [
    reg({ id: "a", preco_dinheiro: 200, linha_origem: 12 }),
    reg({ id: "b", preco_dinheiro: 350, linha_origem: 47 }),
  ];
  const r = montarResultadoConhecimento({ registros, base });
  it("detecta o conflito de preço", () =>
    expect(detectarConflitos(registros)[0]?.campo).toBe("preco_dinheiro"));
  it("marca conflict e não escolhe valor", () => {
    expect(r.knowledge_status).toBe("conflict");
    expect(r.price).toBeNull();
  });
  it("orienta handoff", () => expect(r.instrucao).toMatch(/handoff|equipe/i));
  it("guarda as duas origens", () =>
    expect(r.conflicts?.[0]?.trace.map((t) => t.row)).toEqual([12, 47]));
  it("preparo divergente também é conflito", () =>
    expect(
      detectarConflitos([
        reg({ id: "a", preparo: "Jejum de 8h" }),
        reg({ id: "b", preparo: "Sem jejum" }),
      ]).some((c) => c.campo === "preparo"),
    ).toBe(true));
  it("mesmo item em unidades/registros iguais não vira conflito", () =>
    expect(detectarConflitos([reg({ id: "a" }), reg({ id: "b" })])).toHaveLength(0));
});

describe("Nível de raciocínio não muda a fonte", () => {
  it("o contrato independe de LOW/MEDIUM/HIGH", () => {
    const r1 = montarResultadoConhecimento({ registros: [reg({})], base });
    const r2 = montarResultadoConhecimento({ registros: [reg({})], base });
    expect(r1.knowledge_status).toBe(r2.knowledge_status);
    expect(r1.price).toBe(r2.price);
  });
  it("ambiguidade pede confirmação antes de afirmar preço", () => {
    const r = montarResultadoConhecimento({
      registros: [reg({ id: "a" }), reg({ id: "b", procedimento: "Consulta Cardiologia Retorno" })],
      base,
      ambiguo: true,
    });
    expect(r.instrucao).toMatch(/pedido médico/i);
  });
});

describe("Preço vindo como texto da planilha", () => {
  it("detecta conflito mesmo quando o valor chega como texto", () => {
    const registros = [
      reg({ id: "a", preco_dinheiro: "250,00" as unknown as number }),
      reg({ id: "b", preco_dinheiro: "R$ 1.320,00" as unknown as number }),
    ];
    const r = montarResultadoConhecimento({ registros });
    expect(r.knowledge_status).toBe("conflict");
  });
});
