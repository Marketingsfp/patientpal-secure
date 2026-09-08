import { describe, expect, it } from "bun:test";
import {
  ambienteDaExecucao,
  cruzarResultadoConfianca,
  resumirConfiancaExecucao,
} from "../confianca-execucao";

describe("resumirConfiancaExecucao", () => {
  it("sem snapshots devolve resumo vazio (nunca score inventado)", () => {
    const r = resumirConfiancaExecucao([]);
    expect(r.amostras).toBe(0);
    expect(r.media).toBeNull();
    expect(r.min).toBeNull();
    expect(r.max).toBeNull();
    expect(r.nivelMinimo).toBeNull();
    expect(r.traceIds).toEqual([]);
  });

  it("agrega média, extremos, níveis e traces sem duplicar", () => {
    const r = resumirConfiancaExecucao([
      { score: 94, nivel: "HIGH", trace_id: "t1" },
      { score: 80, nivel: "MEDIUM", trace_id: "t1" },
      { score: 60, nivel: "LOW", trace_id: "t2" },
    ]);
    expect(r.amostras).toBe(3);
    expect(r.media).toBe(78);
    expect(r.min).toBe(60);
    expect(r.max).toBe(94);
    expect(r.niveis).toEqual({ HIGH: 1, MEDIUM: 1, LOW: 1 });
    expect(r.nivelMinimo).toBe("LOW");
    expect(r.traceIds.sort()).toEqual(["t1", "t2"]);
  });

  it("ignora snapshots sem score mas mantém o nível quando existe", () => {
    const r = resumirConfiancaExecucao([
      { score: null, nivel: "HIGH" },
      { score: 90, nivel: "HIGH" },
    ]);
    expect(r.amostras).toBe(1);
    expect(r.media).toBe(90);
    expect(r.niveis["HIGH"]).toBe(2);
  });
});

describe("cruzarResultadoConfianca", () => {
  it("marca superconfiança quando o cenário falha com confiança alta", () => {
    const resumo = resumirConfiancaExecucao([{ score: 96, nivel: "HIGH" }]);
    const c = cruzarResultadoConfianca("FAIL", resumo);
    expect(c.superconfianca).toBe(true);
    expect(c.nivelPredominante).toBe("HIGH");
    expect(c.avaliada).toBe(true);
  });

  it("PASS com confiança alta não é superconfiança", () => {
    const resumo = resumirConfiancaExecucao([{ score: 96, nivel: "HIGH" }]);
    expect(cruzarResultadoConfianca("PASS", resumo).superconfianca).toBe(false);
  });

  it("cenário sem avaliação fica marcado como não avaliado", () => {
    const c = cruzarResultadoConfianca("PASS", resumirConfiancaExecucao([]));
    expect(c.avaliada).toBe(false);
    expect(c.nivelPredominante).toBeNull();
  });
});

describe("ambienteDaExecucao", () => {
  it("separa produção, homologação e teste automatizado", () => {
    expect(ambienteDaExecucao({ teste: false })).toBe("producao");
    expect(ambienteDaExecucao({ teste: true })).toBe("homologacao");
    expect(ambienteDaExecucao({ teste: true, simulacaoAtiva: true })).toBe("teste_automatizado");
  });
});
