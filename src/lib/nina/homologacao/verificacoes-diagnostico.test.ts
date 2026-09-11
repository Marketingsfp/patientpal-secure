/**
 * DIAGNÓSTICOS DA HOMOLOGAÇÃO — igualdade literal e resultados separados.
 * Módulo puro: sem banco, sem rede, sem modelo, sem produção.
 */
import { describe, expect, it } from "bun:test";
import {
  avaliarAderenciaFonte,
  PARTES_NAO_PERCORRIDAS_FONTE,
  ESCOPO_DA_PROVA_FONTE,
  type ParMarcador,
} from "./verificacoes";

const par: ParMarcador = {
  id: "par-a",
  gatilho: "TESTE-ARQUITETURA-9381",
  marcador: "ARQUITETURA_CONFIRMADA_9381",
};
const payload = `responda exatamente ${par.marcador} e nada mais`;

describe("aderência da fonte — igualdade literal", () => {
  it("aprova apenas o texto exato exigido", () => {
    const r = avaliarAderenciaFonte({ par, payload, primeiraResposta: par.marcador });
    expect(r.primeiraRespostaCumpriu).toBe(true);
    expect(r.entregaCumpriu).toBe(true);
    expect(r.regraChegouAoPayload).toBe(true);
  });

  it("reprova resposta com saudação antes do marcador", () => {
    const r = avaliarAderenciaFonte({
      par,
      payload,
      primeiraResposta: `Olá! ${par.marcador}`,
    });
    expect(r.primeiraRespostaCumpriu).toBe(false);
    expect(r.motivo).toBe("RESPOSTA_COM_TEXTO_ALEM_DO_MARCADOR_EXIGIDO");
  });

  it("reprova diferença de caixa: caixa e acentuação são preservadas", () => {
    const r = avaliarAderenciaFonte({
      par,
      payload,
      primeiraResposta: par.marcador.toLowerCase(),
    });
    expect(r.primeiraRespostaCumpriu).toBe(false);
  });

  it("separa o que o modelo fez do que o sistema entregou", () => {
    const r = avaliarAderenciaFonte({
      par,
      payload,
      primeiraResposta: `Bom dia! ${par.marcador}`,
      textoEntregue: par.marcador,
    });
    // Marcador produzido depois pelo sistema não prova obediência do modelo.
    expect(r.primeiraRespostaCumpriu).toBe(false);
    expect(r.sistemaAlterouTexto).toBe(true);
    expect(r.entregaCumpriu).toBe(true);
  });

  it("encaminhamento humano nunca conta como cumprimento", () => {
    const r = avaliarAderenciaFonte({
      par,
      payload,
      primeiraResposta: par.marcador,
      origemResposta: "transferencia",
    });
    expect(r.primeiraRespostaCumpriu).toBe(false);
    expect(r.entregaCumpriu).toBe(false);
    expect(r.motivo).toBe("ENCAMINHAMENTO_OU_FALLBACK_NAO_CUMPRE_A_REGRA");
  });

  it("declara o escopo isolado e o que não percorre", () => {
    expect(ESCOPO_DA_PROVA_FONTE).toContain("ISOLADO");
    expect(PARTES_NAO_PERCORRIDAS_FONTE.length).toBeGreaterThan(0);
  });
});
