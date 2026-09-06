import { describe, expect, it } from "bun:test";
import {
  assuntoSugerido,
  chaveAgrupamento,
  prioridadeSugerida,
  rotuloCausaRaiz,
  rotuloPrioridade,
} from "../feedback-diagnostico";

describe("prioridade sugerida", () => {
  it("invenção de informação é sempre crítica", () => {
    expect(prioridadeSugerida("hallucination", "resposta_incompleta")).toBe("critico");
  });
  it("falha de ferramenta (ex.: falso agendamento) é crítica", () => {
    expect(prioridadeSugerida("tool_error", "outro")).toBe("critico");
  });
  it("valor/médico/unidade incorretos são críticos", () => {
    expect(prioridadeSugerida("retrieval_error", "valor_incorreto")).toBe("critico");
    expect(prioridadeSugerida("retrieval_error", "medico_incorreto")).toBe("critico");
    expect(prioridadeSugerida("knowledge_error", "unidade_incorreta")).toBe("critico");
  });
  it("busca, catálogo e fluxo ficam em alto", () => {
    expect(prioridadeSugerida("retrieval_error", "informacao_nao_encontrada")).toBe("alto");
    expect(prioridadeSugerida("workflow_error", "handoff_deveria_ocorrer")).toBe("alto");
    expect(prioridadeSugerida("knowledge_missing", "informacao_inexistente")).toBe("alto");
  });
  it("resposta incompleta sem causa apontada fica normal", () => {
    expect(prioridadeSugerida(null, "resposta_incompleta")).toBe("normal");
  });
});

describe("agrupamento", () => {
  it("mesma categoria e mesmo assunto geram a mesma chave", () => {
    const a = chaveAgrupamento("valor_incorreto", "Valor da Consulta de Cardiologia");
    const b = chaveAgrupamento("valor_incorreto", "valor da consulta de cardiología");
    expect(a).toBe(b);
  });
  it("assuntos diferentes geram chaves diferentes", () => {
    expect(chaveAgrupamento("valor_incorreto", "Cardiologia")).not.toBe(
      chaveAgrupamento("valor_incorreto", "Dermatologia"),
    );
  });
  it("usa o item do catálogo quando existe", () => {
    expect(assuntoSugerido("Consulta Cardiologia", "quanto custa?")).toBe("Consulta Cardiologia");
    expect(assuntoSugerido(null, "quanto custa a consulta de cardiologia mesmo")).toBe(
      "quanto custa a consulta de cardiologia",
    );
  });
});

describe("rótulos", () => {
  it("traduz causa e prioridade", () => {
    expect(rotuloCausaRaiz("retrieval_error")).toBe("Falha na busca");
    expect(rotuloCausaRaiz(null)).toBe("Sem diagnóstico");
    expect(rotuloPrioridade("critico")).toBe("Crítico");
  });
});
