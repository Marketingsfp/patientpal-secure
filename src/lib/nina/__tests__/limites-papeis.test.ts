/**
 * FASE 12 — Limites por execução e separação de papéis dos modelos.
 */
import { describe, expect, it } from "bun:test";
import {
  LIMITES_MAXIMOS,
  LIMITES_PADRAO,
  MODELO_TERRA,
  custoEstimado,
  normalizarLimites,
  podeContinuar,
} from "@/lib/nina/simulador-terra";
import {
  MODELO_LUNA,
  custoEstimadoCarga,
  estourouOrcamento,
  normalizarConfig,
} from "@/lib/nina/carga";
import { MODELO_SOL } from "@/lib/nina/avaliador-sol";
import { garantirPapel, papelDoModelo, PAPEIS_MODELOS } from "@/lib/nina/papeis-modelos";

const estadoBase = (over: Partial<any> = {}) => ({
  status: "executando",
  turnos: 0,
  mensagens: 0,
  inputTokens: 0,
  outputTokens: 0,
  iniciadaEm: 1000,
  limites: LIMITES_PADRAO,
  ...over,
});

describe("limites do paciente simulado", () => {
  it("aplica tetos e nunca aceita valor acima do máximo", () => {
    const l = normalizarLimites({
      maxTurnos: 9999,
      maxMensagens: 9999,
      maxTokens: 10_000_000,
      maxCustoCreditos: 999999,
      creditosPorMilTokens: 999,
    });
    expect(l.maxTurnos).toBe(LIMITES_MAXIMOS.maxTurnos);
    expect(l.maxMensagens).toBe(LIMITES_MAXIMOS.maxMensagens);
    expect(l.maxTokens).toBe(LIMITES_MAXIMOS.maxTokens);
    expect(l.maxCustoCreditos).toBe(LIMITES_MAXIMOS.maxCustoCreditos);
    expect(l.creditosPorMilTokens).toBe(LIMITES_MAXIMOS.creditosPorMilTokens);
  });

  it("interrompe por turnos, mensagens, duração, tokens e custo", () => {
    expect(podeContinuar(estadoBase({ turnos: 8 }), 1000)).toEqual({
      ok: false,
      motivo: "limite_turnos",
    });
    expect(podeContinuar(estadoBase({ mensagens: 40 }), 1000)).toEqual({
      ok: false,
      motivo: "limite_mensagens",
    });
    expect(podeContinuar(estadoBase(), 1000 + 300_000)).toEqual({
      ok: false,
      motivo: "limite_duracao",
    });
    expect(podeContinuar(estadoBase({ inputTokens: 20000 }), 1000)).toEqual({
      ok: false,
      motivo: "limite_tokens",
    });
    const comCusto = estadoBase({
      inputTokens: 5000,
      limites: normalizarLimites({ maxCustoCreditos: 1, creditosPorMilTokens: 1 }),
    });
    expect(podeContinuar(comCusto, 1000)).toEqual({ ok: false, motivo: "limite_custo" });
  });

  it("não limita por custo quando a taxa não foi declarada", () => {
    const estado = estadoBase({
      inputTokens: 5000,
      limites: normalizarLimites({ maxCustoCreditos: 1, creditosPorMilTokens: 0 }),
    });
    expect(podeContinuar(estado, 1000)).toEqual({ ok: true });
    expect(custoEstimado(5000, 0)).toBe(0);
    expect(custoEstimado(2000, 1.5)).toBe(3);
  });

  it("permite continuar quando está dentro de todos os limites", () => {
    expect(podeContinuar(estadoBase({ turnos: 1, mensagens: 3 }), 1500)).toEqual({ ok: true });
  });
});

describe("limites do teste de carga", () => {
  it("normaliza tokens e custo dentro dos tetos", () => {
    const c = normalizarConfig({
      perfil: "leve",
      maxTokens: 99_000_000,
      maxCustoCreditos: -5,
      creditosPorMilTokens: 500,
    } as any);
    expect(c.maxTokens).toBe(2_000_000);
    expect(c.maxCustoCreditos).toBe(0);
    expect(c.creditosPorMilTokens).toBe(100);
  });

  it("estoura o orçamento por tokens e por custo estimado", () => {
    const c = normalizarConfig({ perfil: "leve", maxTokens: 10_000 } as any);
    expect(estourouOrcamento(c, 9_999).estourou).toBe(false);
    expect(estourouOrcamento(c, 10_000)).toEqual({ estourou: true, motivo: "limite_tokens" });

    const comCusto = normalizarConfig({
      perfil: "leve",
      maxTokens: 1_000_000,
      maxCustoCreditos: 2,
      creditosPorMilTokens: 1,
    } as any);
    expect(estourouOrcamento(comCusto, 1_000).estourou).toBe(false);
    expect(estourouOrcamento(comCusto, 2_000)).toEqual({ estourou: true, motivo: "limite_custo" });
    expect(custoEstimadoCarga(2_000, 1)).toBe(2);
  });
});

describe("papéis dos modelos", () => {
  it("cada papel tem um modelo distinto", () => {
    expect(PAPEIS_MODELOS.paciente.modelo).toBe(MODELO_TERRA);
    expect(PAPEIS_MODELOS.carga.modelo).toBe(MODELO_LUNA);
    expect(PAPEIS_MODELOS.avaliador.modelo).toBe(MODELO_SOL);
    const modelos = [MODELO_TERRA, MODELO_LUNA, MODELO_SOL];
    expect(new Set(modelos).size).toBe(3);
  });

  it("impede que um modelo assuma o papel de outro", () => {
    expect(() => garantirPapel("paciente", MODELO_SOL)).toThrow();
    expect(() => garantirPapel("avaliador", MODELO_TERRA)).toThrow();
    expect(() => garantirPapel("carga", MODELO_SOL)).toThrow();
    expect(garantirPapel("paciente", MODELO_TERRA)).toBe(MODELO_TERRA);
  });

  it("a Nina exige um modelo informado e não é confundida com os demais", () => {
    expect(() => garantirPapel("nina", "")).toThrow();
    expect(garantirPapel("nina", "google/gemini-3.7-flash")).toBe("google/gemini-3.7-flash");
    expect(papelDoModelo("google/gemini-3.7-flash")).toBeNull();
    expect(papelDoModelo(MODELO_LUNA)).toBe("carga");
  });
});
