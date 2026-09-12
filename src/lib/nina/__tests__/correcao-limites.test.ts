/**
 * FASE 3 — limites, repetição e estado técnico da correção assistida.
 */
import { describe, expect, it } from "bun:test";
import {
  MAX_TENTATIVAS,
  ROTULO_RESULTADO_FINAL,
  TEMPO_MAXIMO_MS,
  chaveIdempotencia,
  podeExecutar,
  prazoExcedido,
  registrarOperacao,
} from "../correcao-limites";
import { integracaoCodigoDisponivel } from "../executor-codigo.server";

const base = {
  feedbackId: "fb-1",
  analiseId: "an-1",
  assinaturaProposta: "as-1",
  pacoteHash: "ph-1",
};

describe("chave de repetição", () => {
  it("a mesma autorização produz a mesma chave", () => {
    expect(chaveIdempotencia(base)).toBe(chaveIdempotencia({ ...base }));
  });

  it("proposta diferente produz chave diferente", () => {
    expect(chaveIdempotencia(base)).not.toBe(
      chaveIdempotencia({ ...base, assinaturaProposta: "as-2" }),
    );
  });

  it("evidências diferentes produzem chave diferente", () => {
    expect(chaveIdempotencia(base)).not.toBe(chaveIdempotencia({ ...base, pacoteHash: "ph-2" }));
  });

  it("análise diferente produz chave diferente", () => {
    expect(chaveIdempotencia(base)).not.toBe(chaveIdempotencia({ ...base, analiseId: "an-2" }));
  });
});

describe("teto de operações reais", () => {
  it("uma única gravação de catálogo por correção", () => {
    let c = {};
    expect(podeExecutar(c, "gravar_item_catalogo").ok).toBe(true);
    c = registrarOperacao(c, "gravar_item_catalogo");
    const segunda = podeExecutar(c, "gravar_item_catalogo");
    expect(segunda.ok).toBe(false);
    expect(segunda.motivo).toContain("Limite");
  });

  it("uma única publicação de prompt por correção", () => {
    const c = registrarOperacao({}, "publicar_prompt");
    expect(podeExecutar(c, "publicar_prompt").ok).toBe(false);
  });

  it("teste em homologação pode repetir dentro do teto", () => {
    let c = {};
    c = registrarOperacao(c, "testar_em_homologacao");
    c = registrarOperacao(c, "testar_em_homologacao");
    expect(podeExecutar(c, "testar_em_homologacao").ok).toBe(true);
    c = registrarOperacao(c, "testar_em_homologacao");
    expect(podeExecutar(c, "testar_em_homologacao").ok).toBe(false);
  });

  it("leitura não bloqueia a gravação", () => {
    const c = registrarOperacao({}, "ler_catalogo");
    expect(podeExecutar(c, "gravar_item_catalogo").ok).toBe(true);
  });
});

describe("tempo e tentativas", () => {
  it("dentro do prazo não interrompe", () => {
    expect(prazoExcedido(1000, 1000 + TEMPO_MAXIMO_MS - 1)).toBe(false);
  });

  it("acima do prazo interrompe", () => {
    expect(prazoExcedido(1000, 1000 + TEMPO_MAXIMO_MS + 1)).toBe(true);
  });

  it("teto de tentativas é finito", () => {
    expect(MAX_TENTATIVAS).toBeGreaterThan(0);
    expect(MAX_TENTATIVAS).toBeLessThanOrEqual(5);
  });
});

describe("estado técnico separado", () => {
  it("preparado, aplicado, aguardando publicação e verificado são distintos", () => {
    const rotulos = new Set(Object.values(ROTULO_RESULTADO_FINAL));
    expect(rotulos.size).toBe(5);
    expect(ROTULO_RESULTADO_FINAL.preparado).not.toBe(ROTULO_RESULTADO_FINAL.aplicado);
    expect(ROTULO_RESULTADO_FINAL.aplicado).not.toBe(ROTULO_RESULTADO_FINAL.verificado);
  });
});

describe("camada de código", () => {
  it("sem serviço configurado, a integração não é declarada disponível", () => {
    delete process.env["NINA_EXECUTOR_CODIGO_URL"];
    delete process.env["NINA_EXECUTOR_CODIGO_TOKEN"];
    expect(integracaoCodigoDisponivel()).toBe(false);
  });
});
