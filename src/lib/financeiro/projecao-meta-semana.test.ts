import { describe, expect, it } from "bun:test";
import {
  atendimentosPorDiaDaSemana,
  diasQueFaltam,
  interpretarMeta,
  type DiaReceita,
} from "./projecao-meta-semana";

const base = { mesAnterior: 500000, nomeMesAnterior: "setembro de 2026" };

describe("interpretarMeta", () => {
  it.each([
    ["600 mil", 600000],
    ["QUERO FECHAR 600 MIL ATÉ DIA 30", 600000],
    ["R$ 650.000,00", 650000],
    ["650.000", 650000],
    ["650000", 650000],
    ["1,2 milhão", 1200000],
    ["1.5 milhoes", 1500000],
    ["700k", 700000],
  ])('"%s" vira %d', (texto, esperado) => {
    const r = interpretarMeta(texto, base);
    expect(r.ok && r.valor).toBe(esperado);
  });

  it("percentual vira crescimento sobre o mês anterior", () => {
    const r = interpretarMeta("10% acima do mês passado", base);
    expect(r.ok && r.valor).toBe(550000);
    expect(r.ok && r.explicacao).toContain("setembro de 2026");
  });

  it("valor em reais vence o percentual", () => {
    const r = interpretarMeta("uns 10% a mais, 560 mil", base);
    expect(r.ok && r.valor).toBe(560000);
  });

  it("percentual sem mês anterior pede o valor em reais", () => {
    const r = interpretarMeta("10%", { mesAnterior: 0, nomeMesAnterior: "setembro" });
    expect(r.ok).toBe(false);
  });

  it("texto sem valor não inventa meta", () => {
    expect(interpretarMeta("bater a meta", base).ok).toBe(false);
    expect(interpretarMeta("dia 30", base).ok).toBe(false);
    expect(interpretarMeta("", base).ok).toBe(false);
  });
});

describe("diasQueFaltam", () => {
  it("outubro/2026 a partir de 07/10: sem domingos e sem o feriado de 12/10", () => {
    const f = diasQueFaltam("2026-10-07", "2026-10-31");
    // 25 dias − 3 domingos − 12/10 (segunda).
    expect(f.total).toBe(21);
    expect(f.feriados).toEqual(["2026-10-12"]);
    expect(f.porDiaSemana.get(1)).toBe(2);
    expect(f.porDiaSemana.get(3)).toBe(4);
  });
});

describe("atendimentosPorDiaDaSemana", () => {
  // Semana de referência (setembro/2026): segunda 14/09 a sábado 19/09.
  // Seg a sex: R$ 10.000 em 100 pagamentos; sábado: R$ 4.000 em 50.
  const historico: DiaReceita[] = [
    { dia: "2026-09-14", receita: 10000, pagamentos: 100 },
    { dia: "2026-09-15", receita: 10000, pagamentos: 100 },
    { dia: "2026-09-16", receita: 10000, pagamentos: 100 },
    { dia: "2026-09-17", receita: 10000, pagamentos: 100 },
    { dia: "2026-09-18", receita: 10000, pagamentos: 100 },
    { dia: "2026-09-19", receita: 4000, pagamentos: 50 },
    { dia: "2026-09-20", receita: 999, pagamentos: 9 }, // domingo: fora
  ];

  // Hoje = segunda 28/09; faltam 28, 29, 30/09 (seg, ter, qua).
  const entrada = { historico, hoje: "2026-09-28", fimMes: "2026-09-30" };

  it("no ritmo normal, pede o mesmo que cada dia já faz", () => {
    const r = atendimentosPorDiaDaSemana({ ...entrada, meta: 130000, realizadoAteOntem: 100000 });
    expect(r.diasRestantes).toBe(3);
    expect(r.falta).toBe(30000);
    expect(r.rendeNoRitmo).toBe(30000);
    expect(r.esforcoPercentual).toBe(0);
    expect(r.linhas.map((l) => l.nome)).toEqual(["Segunda", "Terça", "Quarta"]);
    expect(r.linhas.every((l) => l.atendimentosNecessarios === 100)).toBe(true);
  });

  it("meta acima do ritmo sobe cada dia na mesma proporção", () => {
    const r = atendimentosPorDiaDaSemana({ ...entrada, meta: 136000, realizadoAteOntem: 100000 });
    expect(r.esforcoPercentual).toBe(20);
    expect(r.linhas[0].atendimentosHoje).toBe(100);
    expect(r.linhas[0].atendimentosNecessarios).toBe(120);
    expect(r.linhas[0].receitaNecessaria).toBe(12000);
  });

  it("sábado mantém o peso menor dele", () => {
    // Hoje = sexta 25/09; faltam sex 25, sáb 26, seg 28, ter 29, qua 30.
    const r = atendimentosPorDiaDaSemana({
      historico,
      hoje: "2026-09-25",
      fimMes: "2026-09-30",
      meta: 100000 + 44000 * 1.5,
      realizadoAteOntem: 100000,
    });
    const sab = r.linhas.find((l) => l.nome === "Sábado");
    const seg = r.linhas.find((l) => l.nome === "Segunda");
    expect(sab?.atendimentosNecessarios).toBe(75);
    expect(seg?.atendimentosNecessarios).toBe(150);
  });

  it("meta já batida até ontem pede zero", () => {
    const r = atendimentosPorDiaDaSemana({ ...entrada, meta: 90000, realizadoAteOntem: 100000 });
    expect(r.falta).toBe(0);
    expect(r.linhas.every((l) => l.atendimentosNecessarios === 0)).toBe(true);
  });

  it("dia da semana sem histórico é avisado, não inventado", () => {
    const r = atendimentosPorDiaDaSemana({
      historico: historico.filter((d) => d.dia !== "2026-09-16"),
      ...{ hoje: "2026-09-28", fimMes: "2026-09-30" },
      meta: 120000,
      realizadoAteOntem: 100000,
    });
    expect(r.semHistorico).toEqual(["Quarta"]);
    // Sem reserva (média do mês), a quarta não tem como ser estimada.
    expect(r.linhas.map((l) => l.nome)).toEqual(["Segunda", "Terça"]);
  });

  it("dia sem histórico usa a média do mês, e não zero", () => {
    const r = atendimentosPorDiaDaSemana({
      historico: historico.filter((d) => d.dia !== "2026-09-16"),
      hoje: "2026-09-28",
      fimMes: "2026-09-30",
      meta: 130000,
      realizadoAteOntem: 100000,
      reserva: { receita: 10000, pagamentos: 100 },
    });
    expect(r.rendeNoRitmo).toBe(30000);
    expect(r.linhas.map((l) => l.nome)).toEqual(["Segunda", "Terça", "Quarta"]);
  });

  it("dia muito abaixo do normal (implantação, meio feriado) não entra na média", () => {
    const r = atendimentosPorDiaDaSemana({
      historico: [
        ...historico,
        { dia: "2026-09-21", receita: 10000, pagamentos: 100 },
        { dia: "2026-08-31", receita: 500, pagamentos: 5 }, // segunda de implantação
      ],
      ...{ hoje: "2026-09-28", fimMes: "2026-09-30" },
      meta: 130000,
      realizadoAteOntem: 100000,
    });
    const seg = r.linhas.find((l) => l.nome === "Segunda");
    expect(seg?.amostra).toBe(2);
    expect(seg?.atendimentosHoje).toBe(100);
  });

  it("o histórico nunca usa o dia de hoje", () => {
    const r = atendimentosPorDiaDaSemana({
      historico: [...historico, { dia: "2026-09-28", receita: 50, pagamentos: 1 }],
      ...{ hoje: "2026-09-28", fimMes: "2026-09-30" },
      meta: 130000,
      realizadoAteOntem: 100000,
    });
    expect(r.linhas[0].amostra).toBe(1);
    expect(r.linhas[0].atendimentosHoje).toBe(100);
  });
});
