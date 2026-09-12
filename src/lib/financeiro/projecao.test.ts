import { describe, expect, it } from "bun:test";
import { projetarMes, type DiaCaixa } from "./projecao";

const dia = (data: string, receita: number, despesa = 0, atendimentos = 10): DiaCaixa => ({
  data,
  receita,
  despesa,
  atendimentos,
});

describe("projetarMes", () => {
  it("usa o ritmo dos dias com movimento para estimar o fechamento", () => {
    const r = projetarMes({
      inicio: "2026-09-01",
      fim: "2026-09-30",
      hoje: "2026-09-10",
      dias: [
        dia("2026-09-01", 1000, 200),
        dia("2026-09-02", 1000, 200),
        dia("2026-09-03", 1000, 200),
        dia("2026-09-04", 1000, 200),
        dia("2026-09-05", 1000, 200),
        dia("2026-09-06", 0, 0, 0),
        dia("2026-09-07", 0, 0, 0),
        dia("2026-09-08", 1000, 200),
        dia("2026-09-09", 1000, 200),
        dia("2026-09-10", 1000, 200),
      ],
    });

    expect(r.realizado.receita).toBe(8000);
    expect(r.realizado.despesa).toBe(1600);
    expect(r.realizado.saldo).toBe(6400);
    expect(r.realizado.diasComMovimento).toBe(8);
    expect(r.diasCorridos).toBe(10);
    expect(r.diasRestantes).toBe(20);
    expect(r.mediaDiaria).toBe(1000);
    // 20 dias restantes × 80% de dias produtivos = 16 dias × R$ 1.000.
    expect(r.projetado.receita).toBe(24000);
    expect(r.projetado.despesa).toBe(4800);
    expect(r.projetado.saldo).toBe(19200);
    expect(r.projetado.atendimentos).toBe(240);
    expect(r.confianca).toBe("media");
  });

  it("sem movimento, a projeção é o próprio realizado e a confiança é baixa", () => {
    const r = projetarMes({
      inicio: "2026-09-01",
      fim: "2026-09-30",
      hoje: "2026-09-03",
      dias: [dia("2026-09-01", 0, 0, 0), dia("2026-09-02", 0, 0, 0), dia("2026-09-03", 0, 0, 0)],
    });
    expect(r.projetado.receita).toBe(0);
    expect(r.projetado.atendimentos).toBe(0);
    expect(r.confianca).toBe("baixa");
    expect(r.meta).toBeNull();
  });

  it("calcula quanto falta por dia para bater a meta", () => {
    const r = projetarMes({
      inicio: "2026-09-01",
      fim: "2026-09-30",
      hoje: "2026-09-10",
      dias: Array.from({ length: 10 }, (_, i) =>
        dia(`2026-09-${String(i + 1).padStart(2, "0")}`, 1000, 100, 10),
      ),
      meta: 40000,
    });
    expect(r.meta?.falta).toBe(30000);
    // 20 dias restantes, todos produtivos.
    expect(r.meta?.porDiaRestante).toBe(1500);
    expect(r.meta?.atendimentosPorDia).toBe(15);
    expect(r.meta?.alcancavel).toBe(false);
  });

  it("aponta dias parados, dias fracos e despesa alta", () => {
    const r = projetarMes({
      inicio: "2026-09-01",
      fim: "2026-09-30",
      hoje: "2026-09-06",
      dias: [
        dia("2026-09-01", 1000, 900),
        dia("2026-09-02", 1000, 900),
        dia("2026-09-03", 100, 80, 5),
        dia("2026-09-04", 0, 0, 0),
        dia("2026-09-05", 1000, 900),
        dia("2026-09-06", 1000, 900),
      ],
    });
    const ids = r.pontos.map((p) => p.id);
    expect(ids).toContain("dias-parados");
    expect(ids).toContain("dias-fracos");
    expect(ids).toContain("despesa-alta");
  });

  it("ignora lançamentos fora do período", () => {
    const r = projetarMes({
      inicio: "2026-09-01",
      fim: "2026-09-30",
      hoje: "2026-09-05",
      dias: [dia("2026-09-05", 500, 0, 5), dia("2026-09-20", 9999, 0, 99)],
    });
    expect(r.realizado.receita).toBe(500);
    expect(r.realizado.atendimentos).toBe(5);
  });
});
