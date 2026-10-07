import { describe, expect, it } from "bun:test";
import {
  projetarMes,
  serieTendencia,
  simularCrescimento,
  type DiaCaixa,
  type EntradaProjecao,
} from "./projecao";

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
    // Hoje (10) está em andamento: o ritmo sai dos 9 dias fechados, 7 com movimento.
    expect(r.realizado.diasComMovimento).toBe(7);
    expect(r.realizado.receitaFechada).toBe(7000);
    expect(r.diasCorridos).toBe(9);
    // De 10 a 30/09 são 21 dias; sem os domingos 13, 20 e 27, sobram 18.
    expect(r.diasRestantes).toBe(18);
    expect(r.mediaDiaria).toBe(1000);
    // Sem histórico, cada dia que falta vale a média do mês: 7.000 + 18 × 1.000.
    expect(r.projetado.receita).toBe(25000);
    expect(r.projetado.despesa).toBe(5000);
    expect(r.projetado.saldo).toBe(20000);
    expect(r.projetado.atendimentos).toBe(250);
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
    // Falta conta o que já entrou hoje; o ritmo parte do fechado até ontem
    // (R$ 9.000) e divide pelos 18 dias de atendimento que faltam.
    expect(r.meta?.falta).toBe(30000);
    expect(r.meta?.porDiaRestante).toBe(1722.22);
    expect(r.meta?.atendimentosPorDia).toBe(18);
    expect(r.meta?.alcancavel).toBe(false);
  });

  it("aponta dias parados e despesa alta", () => {
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
    // Dia fraco agora é medido contra o mesmo dia da semana (projecao-melhorias).
    expect(ids).not.toContain("dias-fracos");
    expect(ids).toContain("despesa-alta");
  });

  it("o dia de hoje pela metade não derruba o ritmo (média só até ontem)", () => {
    const r = projetarMes({
      inicio: "2026-09-01",
      fim: "2026-09-30",
      hoje: "2026-09-05",
      dias: [
        dia("2026-09-01", 1000, 0, 10),
        dia("2026-09-02", 1000, 0, 10),
        dia("2026-09-03", 1000, 0, 10),
        dia("2026-09-04", 1000, 0, 10),
        // Manhã de hoje: só R$ 100 até agora.
        dia("2026-09-05", 100, 0, 1),
      ],
    });
    expect(r.mediaDiaria).toBe(1000);
    expect(r.mediaAtendimentosDia).toBe(10);
    expect(r.realizado.receita).toBe(4100);
    expect(r.realizado.ticket).toBe(100);
    // 4.000 fechados + 21 dias de atendimento (5 a 30/09 sem domingos e sem
    // o feriado de 07/09) × R$ 1.000.
    expect(r.diasRestantes).toBe(21);
    expect(r.feriados).toEqual(["2026-09-07"]);
    expect(r.projetado.receita).toBe(25000);
  });

  it("cada dia que falta rende o que o seu dia da semana costuma fazer", () => {
    // Hoje = sexta 25/09; faltam sex 25, sáb 26, seg 28, ter 29, qua 30.
    // Histórico: dias úteis fazem R$ 10.000; sábado, R$ 4.000.
    const historico = [
      { dia: "2026-09-14", receita: 10000, pagamentos: 100 },
      { dia: "2026-09-15", receita: 10000, pagamentos: 100 },
      { dia: "2026-09-16", receita: 10000, pagamentos: 100 },
      { dia: "2026-09-18", receita: 10000, pagamentos: 100 },
      { dia: "2026-09-19", receita: 4000, pagamentos: 50 },
    ];
    const r = projetarMes({
      inicio: "2026-09-01",
      fim: "2026-09-30",
      hoje: "2026-09-25",
      dias: [dia("2026-09-24", 9000, 0, 90)],
      historico,
    });
    expect(r.diasRestantes).toBe(5);
    expect(r.rendeNoRitmo).toBe(44000);
    expect(r.projetado.receita).toBe(53000);
    expect(r.projetado.atendimentos).toBe(90 + 450);
  });

  it("hoje acima do ritmo nunca deixa a projeção abaixo do realizado", () => {
    const r = projetarMes({
      inicio: "2026-09-01",
      fim: "2026-09-02",
      hoje: "2026-09-02",
      dias: [dia("2026-09-01", 1000, 0, 10), dia("2026-09-02", 5000, 0, 50)],
    });
    expect(r.projetado.receita).toBe(6000);
    expect(r.projetado.atendimentos).toBe(60);
  });

  it("primeiro dia do mês: sem dia fechado, projeção é o realizado", () => {
    const r = projetarMes({
      inicio: "2026-09-01",
      fim: "2026-09-30",
      hoje: "2026-09-01",
      dias: [dia("2026-09-01", 800, 0, 8)],
    });
    expect(r.diasCorridos).toBe(0);
    expect(r.mediaDiaria).toBe(0);
    expect(r.projetado.receita).toBe(800);
    expect(r.confianca).toBe("baixa");
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

/**
 * Mês de setembro com 10 dias corridos, todos com movimento, R$ 1.000 por dia.
 * Realizado: R$ 10.000; ritmo: R$ 1.000/dia; 20 dias pela frente.
 */
const entradaBase: EntradaProjecao = {
  inicio: "2026-09-01",
  fim: "2026-09-30",
  hoje: "2026-09-10",
  dias: Array.from({ length: 10 }, (_, i) =>
    dia(`2026-09-${String(i + 1).padStart(2, "0")}`, 1000, 0, 10),
  ),
};

describe("simularCrescimento", () => {
  it("calcula o alvo de cada percentual sobre o mês anterior", () => {
    const r = projetarMes(entradaBase);
    const metas = simularCrescimento(r, { baseMesAnterior: 20000 });
    expect(metas.map((m) => m.rotulo)).toEqual(["+5%", "+10%", "+15%"]);
    expect(metas[0].alvo).toBe(21000);
    expect(metas[1].alvo).toBe(22000);
    expect(metas[2].alvo).toBe(23000);
  });

  it("divide o que falta pelos dias de movimento que ainda vêm", () => {
    const r = projetarMes(entradaBase);
    const [cinco] = simularCrescimento(r, { baseMesAnterior: 20000 });
    // Faltam 11.000 para 21.000; o ritmo parte do fechado até ontem (9.000)
    // e divide os 12.000 pelos 18 dias de atendimento que faltam.
    expect(cinco.falta).toBe(11000);
    expect(cinco.porDiaRestante).toBe(666.67);
    // 12.000 contra 18.000 que os dias rendem no ritmo: dá para ir mais devagar.
    expect(cinco.esforcoPercentual).toBe(-33);
    expect(cinco.alcancavel).toBe(true);
  });

  it("marca como inalcançável a meta acima do ritmo de hoje", () => {
    const r = projetarMes(entradaBase);
    const metas = simularCrescimento(r, { baseMesAnterior: 100000 });
    expect(metas.every((m) => m.alcancavel)).toBe(false);
    expect(metas[0].esforcoPercentual).toBeGreaterThan(0);
  });

  it("sem mês anterior, só simula a meta digitada", () => {
    const r = projetarMes(entradaBase);
    const metas = simularCrescimento(r, { baseMesAnterior: 0, metaCustomizada: 50000 });
    expect(metas).toHaveLength(1);
    expect(metas[0].rotulo).toBe("Meta digitada");
    expect(metas[0].alvo).toBe(50000);
  });

  it("sem base nenhuma, não inventa meta", () => {
    const r = projetarMes(entradaBase);
    expect(simularCrescimento(r, { baseMesAnterior: 0 })).toEqual([]);
  });

  it("meta já batida mostra falta zero", () => {
    const r = projetarMes(entradaBase);
    const [m] = simularCrescimento(r, { baseMesAnterior: 0, metaCustomizada: 5000 });
    expect(m.falta).toBe(0);
  });
});

describe("serieTendencia", () => {
  it("tem um ponto por dia do mês", () => {
    const r = projetarMes(entradaBase);
    expect(serieTendencia(entradaBase, r)).toHaveLength(30);
  });

  it("o realizado acumula até hoje e depois some", () => {
    const r = projetarMes(entradaBase);
    const s = serieTendencia(entradaBase, r);
    expect(s[0].realizado).toBe(1000);
    expect(s[9].realizado).toBe(10000);
    expect(s[10].realizado).toBeNull();
    expect(s[29].realizado).toBeNull();
  });

  it("as duas linhas se encontram em ontem e a projeção segue o ritmo", () => {
    const r = projetarMes(entradaBase);
    const s = serieTendencia(entradaBase, r);
    expect(s[8].projetado).toBe(s[8].realizado ?? 0);
    expect(s[29].projetado).toBe(27000); // 9 dias fechados + 18 dias de atendimento
    expect(s[29].projetado).toBe(r.projetado.receita);
  });

  it("domingo e feriado deixam a curva reta", () => {
    const r = projetarMes(entradaBase);
    const s = serieTendencia(entradaBase, r);
    expect(s[12].projetado).toBe(s[11].projetado); // domingo 13/09
  });

  it("a curva projetada nunca desce", () => {
    const r = projetarMes(entradaBase);
    const s = serieTendencia(entradaBase, r);
    for (let i = 1; i < s.length; i++) {
      expect(s[i].projetado).toBeGreaterThanOrEqual(s[i - 1].projetado);
    }
  });
});
