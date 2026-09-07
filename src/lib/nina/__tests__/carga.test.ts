import { describe, expect, it } from "bun:test";
import {
  LIMITE_ABSOLUTO,
  LIMITE_CONFIRMACAO,
  PERFIS,
  calcularMetricas,
  exigeConfirmacao,
  extrairVariacoes,
  intervaloEfetivoMs,
  normalizarConfig,
  percentil,
  planoDeMensagens,
  validarDisparo,
  variacoesFallback,
} from "@/lib/nina/carga";

describe("perfis e limites do teste de carga", () => {
  it("perfil leve tem 5 conversas e 20 mensagens", () => {
    expect(PERFIS.leve.conversasSimultaneas).toBe(5);
    expect(PERFIS.leve.totalMensagens).toBe(20);
  });

  it("perfil médio tem 10 conversas e 100 mensagens", () => {
    expect(PERFIS.medio.conversasSimultaneas).toBe(10);
    expect(PERFIS.medio.totalMensagens).toBe(100);
  });

  it("nunca ultrapassa os tetos do motor", () => {
    const c = normalizarConfig({
      perfil: "customizado",
      totalMensagens: 99999,
      conversasSimultaneas: 500,
      leadsAtivos: 90,
      mensagensPorMinuto: 100000,
      timeoutS: 9999,
      retriesMax: 99,
    });
    expect(c.totalMensagens).toBe(LIMITE_ABSOLUTO.totalMensagens);
    expect(c.leadsAtivos).toBe(LIMITE_ABSOLUTO.leadsAtivos);
    expect(c.conversasSimultaneas).toBe(LIMITE_ABSOLUTO.conversasSimultaneas);
    expect(c.timeoutS).toBe(LIMITE_ABSOLUTO.timeoutS);
    expect(c.retriesMax).toBe(LIMITE_ABSOLUTO.retriesMax);
  });

  it("conversas simultâneas nunca passam do número de leads ativos", () => {
    const c = normalizarConfig({ perfil: "customizado", leadsAtivos: 3, conversasSimultaneas: 10 });
    expect(c.conversasSimultaneas).toBe(3);
  });

  it("volume alto exige confirmação explícita", () => {
    const c = normalizarConfig({ perfil: "customizado", totalMensagens: LIMITE_CONFIRMACAO + 1 });
    expect(exigeConfirmacao(c)).toBe(true);
    expect(validarDisparo(c, false).ok).toBe(false);
    expect(validarDisparo(c, true).ok).toBe(true);
  });

  it("volume pequeno dispara sem confirmação", () => {
    const c = normalizarConfig({ perfil: "leve" });
    expect(validarDisparo(c, false).ok).toBe(true);
  });
});

describe("pacing e plano de mensagens", () => {
  it("intervalo respeita o ritmo por minuto", () => {
    const c = normalizarConfig({
      perfil: "customizado",
      mensagensPorMinuto: 60,
      conversasSimultaneas: 5,
      leadsAtivos: 5,
      intervaloMs: 0,
    });
    expect(intervaloEfetivoMs(c)).toBe(5000);
  });

  it("distribui as mensagens conforme os pesos e intercala cenários", () => {
    const c = normalizarConfig({
      perfil: "customizado",
      totalMensagens: 10,
      conversasSimultaneas: 2,
      leadsAtivos: 2,
      distribuicao: [
        { cenario: "A", peso: 1 },
        { cenario: "B", peso: 1 },
      ],
    });
    const plano = planoDeMensagens(c);
    expect(plano).toHaveLength(10);
    expect(plano.filter((p) => p.cenario === "A")).toHaveLength(5);
    expect(plano[0]!.cenario).toBe("A");
    expect(plano[1]!.cenario).toBe("B");
    expect(new Set(plano.map((p) => p.slot))).toEqual(new Set([0, 1]));
  });
});

describe("métricas medidas", () => {
  it("percentil interpola corretamente", () => {
    expect(percentil([10, 20, 30, 40], 50)).toBe(25);
    expect(percentil([], 50)).toBeNull();
  });

  it("p95 e p99 só aparecem com volume suficiente", () => {
    const poucas = calcularMetricas([100, 200, 300], 60_000);
    expect(poucas.p50).toBe(200);
    expect(poucas.p95).toBeNull();
    expect(poucas.p99).toBeNull();

    const muitas = calcularMetricas(
      Array.from({ length: 100 }, (_, i) => i + 1),
      60_000,
    );
    expect(muitas.p95).not.toBeNull();
    expect(muitas.p99).not.toBeNull();
    expect(muitas.mensagensPorMinutoReal).toBe(100);
  });
});

describe("variações de linguagem", () => {
  it("limpa numeração, aspas e duplicidade", () => {
    const lista = extrairVariacoes('1. "Tem cardio amanhã?"\n- Tem cardio amanhã?\n\nQueria consulta de coração');
    expect(lista).toEqual(["Tem cardio amanhã?", "Queria consulta de coração"]);
  });

  it("descarta linhas longas demais", () => {
    expect(extrairVariacoes("x".repeat(200))).toEqual([]);
  });

  it("fallback sempre devolve variações utilizáveis", () => {
    expect(variacoesFallback("Quero marcar cardiologista").length).toBeGreaterThan(1);
  });
});
