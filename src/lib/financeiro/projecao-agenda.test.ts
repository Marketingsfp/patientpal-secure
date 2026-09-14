import { describe, expect, it } from "bun:test";
import {
  agendasPorVolume,
  classificarTempo,
  diagnosticoEspecialidades,
  faixaDoVolume,
  contextoComparacao,
  diasDoMes,
  diasValidos,
  impactoDoClima,
  prognosticoDoMes,
  rankingEspecialidades,
  type LinhaAgendaDia,
} from "./projecao-agenda";
import { ociosidadeEOportunidade } from "./projecao-melhorias";

const linha = (p: Partial<LinhaAgendaDia> & { dia: string }): LinhaAgendaDia => ({
  agenda_id: "a1",
  agenda_nome: "CONSULTAS",
  ordem_chegada: false,
  medico_id: "m1",
  medico_nome: "DR TESTE",
  especialidade: "CARDIOLOGIA",
  vagas: 0,
  marcados: 0,
  compareceu: 0,
  ...p,
});

describe("classificarTempo", () => {
  it("separa estável, chuva e tempestade", () => {
    expect(classificarTempo({ precipitacao_mm: 0.4, weather_code: 3 })).toBe("estavel");
    expect(classificarTempo({ precipitacao_mm: 4, weather_code: 61 })).toBe("chuva");
    expect(classificarTempo({ precipitacao_mm: 22, weather_code: 63 })).toBe("tempestade");
    expect(classificarTempo({ precipitacao_mm: 3, weather_code: 95 })).toBe("tempestade");
    expect(classificarTempo({ precipitacao_mm: null, weather_code: null })).toBeNull();
  });
});

describe("impactoDoClima", () => {
  // Seis semanas de terça e sábado; metade de cada com chuva e 20% a menos de
  // gente (terça 100 → 80, sábado 50 → 40).
  const tercas = [
    "2026-07-07",
    "2026-07-14",
    "2026-07-21",
    "2026-07-28",
    "2026-08-04",
    "2026-08-11",
  ];
  const sabados = [
    "2026-07-11",
    "2026-07-18",
    "2026-07-25",
    "2026-08-01",
    "2026-08-08",
    "2026-08-15",
  ];
  const chuvosos = new Set([...tercas.slice(0, 3), ...sabados.slice(0, 3)]);
  const linhas: LinhaAgendaDia[] = [
    ...tercas.map((dia) => linha({ dia, marcados: 110, compareceu: chuvosos.has(dia) ? 80 : 100 })),
    ...sabados.map((dia) => linha({ dia, marcados: 55, compareceu: chuvosos.has(dia) ? 40 : 50 })),
    // Dia atípico (sistema parado): não pode contaminar a média.
    linha({ dia: "2026-08-18", marcados: 110, compareceu: 5 }),
    // Domingo e hoje ficam fora.
    linha({ dia: "2026-08-16", marcados: 10, compareceu: 1 }),
    linha({ dia: "2026-08-20", marcados: 110, compareceu: 30 }),
  ];
  const clima = new Map(
    [...tercas, ...sabados, "2026-08-18"].map((d) => [
      d,
      { precipitacao_mm: chuvosos.has(d) ? 8 : 0, weather_code: chuvosos.has(d) ? 61 : 1 },
    ]),
  );

  it("mede a queda contra o normal do mesmo dia da semana", () => {
    const r = impactoDoClima(linhas, clima, "2026-08-20");
    const estavel = r.grupos.find((g) => g.tipo === "estavel")!;
    const chuva = r.grupos.find((g) => g.tipo === "chuva")!;
    expect(r.diasDescartados).toBe(1);
    expect(estavel.dias).toBe(6);
    expect(chuva.dias).toBe(6);
    // Normal de terça = mediana(80,80,80,100,100,100) = 90 — o dia parado
    // (5 comparecimentos) sai antes da conta; sábado = 45.
    // Chuva: índice 80/90 = 0,889; estável: 100/90 = 1,111. Queda de 20%.
    expect(chuva.variacao).toBe(-20);
    expect(r.confiavel).toBe(true);
  });

  it("taxa de falta por tipo de tempo", () => {
    const r = impactoDoClima(linhas, clima, "2026-08-20");
    const chuva = r.grupos.find((g) => g.tipo === "chuva")!;
    // (30×3 + 15×3) / (110×3 + 55×3)
    expect(chuva.taxaFalta).toBe(27.3);
  });

  it("prognóstico só estima perda com histórico confiável", () => {
    const r = impactoDoClima(linhas, clima, "2026-08-20");
    const prev = [
      { data: "2026-09-15", precipitacao_mm: 10, probabilidade_chuva: 80, weather_code: 63 },
      { data: "2026-09-16", precipitacao_mm: 5, probabilidade_chuva: 30, weather_code: 61 },
      { data: "2026-09-20", precipitacao_mm: 20, probabilidade_chuva: 90, weather_code: 65 }, // domingo
    ];
    const p = prognosticoDoMes(prev, r, 300, "2026-09-14", "2026-09-30");
    // 15 a 30/09/2026, sem os domingos 20 e 27.
    expect(p.diasRestantes).toBe(14);
    expect(p.diasComPrevisao).toBe(2);
    expect(p.diasChuva).toBe(1);
    expect(p.perdaEstimada).toBe(60);
    const semBase = prognosticoDoMes(
      prev,
      { ...r, confiavel: false },
      300,
      "2026-09-14",
      "2026-09-30",
    );
    expect(semBase.perdaEstimada).toBe(0);
  });
});

describe("diasDoMes", () => {
  it("conta dias de funcionamento fechados até ontem e os que faltam", () => {
    // Setembro/2026: 26 dias de seg a sáb; de 01 a 13 são 11.
    expect(
      diasDoMes({ inicioMes: "2026-09-01", fimMes: "2026-09-30", hoje: "2026-09-14" }),
    ).toEqual({ totais: 26, decorridos: 11, restantes: 15 });
    expect(
      diasDoMes({ inicioMes: "2026-09-01", fimMes: "2026-09-30", hoje: "2026-09-01" }).decorridos,
    ).toBe(0);
  });
});

/** Todos os dias de seg a sáb entre as duas datas. */
function diasUteis(de: string, ate: string): string[] {
  const out: string[] = [];
  const d = new Date(`${de}T00:00:00Z`);
  while (d.toISOString().slice(0, 10) <= ate) {
    if (d.getUTCDay() !== 0) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe("especialidades e agendas (cenário de produção: sistema parado no começo de agosto)", () => {
  const periodo = {
    inicioMes: "2026-09-01",
    fimMes: "2026-09-30",
    hoje: "2026-09-14",
    mesAnteriorDe: "2026-08-01",
    mesAnteriorAte: "2026-08-31",
  };
  const base = { agenda_id: "a0", medico_id: "m0", especialidade: "CLINICO GERAL" };
  const lacuna = diasUteis("2026-08-03", "2026-08-15");
  const agostoNormal = diasUteis("2026-08-17", "2026-08-31");
  // 07/09 é feriado: nenhuma linha na agenda.
  const setembro = diasUteis("2026-09-01", "2026-09-12").filter((d) => d !== "2026-09-07");

  const linhas: LinhaAgendaDia[] = [
    // De 03 a 15/08 a recepção usou o sistema antigo: quase nada aqui.
    ...lacuna.map((dia) => linha({ dia, ...base, marcados: 5, compareceu: 5 })),
    ...lacuna.map((dia) =>
      linha({ dia, especialidade: "CARDIOLOGIA", marcados: 1, compareceu: 1 }),
    ),
    ...agostoNormal.map((dia) => linha({ dia, ...base, marcados: 100, compareceu: 100 })),
    ...agostoNormal.map((dia) =>
      linha({ dia, especialidade: "CARDIOLOGIA", marcados: 10, compareceu: 10 }),
    ),
    ...setembro.map((dia) => linha({ dia, ...base, marcados: 100, compareceu: 100 })),
    ...setembro.map((dia) =>
      linha({ dia, especialidade: "CARDIOLOGIA", vagas: 100, marcados: 10, compareceu: 5 }),
    ),
    ...setembro.map((dia) =>
      linha({
        dia,
        agenda_id: "a2",
        medico_id: "m2",
        especialidade: "PEDIATRIA",
        vagas: 20,
        marcados: 19,
        compareceu: 19,
      }),
    ),
    // Ordem de chegada não entra na ocupação.
    linha({
      dia: "2026-09-11",
      agenda_id: "a3",
      medico_id: "m2",
      especialidade: "PEDIATRIA",
      ordem_chegada: true,
      vagas: 500,
      compareceu: 10,
    }),
    // Hoje, ainda acontecendo.
    linha({
      dia: "2026-09-14",
      especialidade: "CARDIOLOGIA",
      vagas: 10,
      marcados: 5,
      compareceu: 3,
    }),
  ];

  it("descarta os dias em que a agenda não foi usada", () => {
    const v = diasValidos(linhas, periodo.hoje);
    expect(v.descartados).toBe(lacuna.length);
    const ctx = contextoComparacao(v, periodo);
    expect(ctx.diasValidosAnterior).toBe(agostoNormal.length);
    expect(ctx.diasValidosMes).toBe(setembro.length);
  });

  it("compara média por dia válido, não total bruto", () => {
    const r = rankingEspecialidades(linhas, periodo);
    const cardio = r.find((e) => e.especialidade === "CARDIOLOGIA")!;
    expect(cardio.mediaDia).toBe(5);
    expect(cardio.mediaDiaAnterior).toBe(10);
    expect(cardio.variacao).toBe(-50);
    // 50 até ontem + 5 por dia × 15 dias que faltam (hoje incluso).
    expect(cardio.atendidos).toBe(53);
    expect(cardio.projetado).toBe(125);
    expect(cardio.taxaFalta).toBe(50);
    expect(cardio.ocupacao).toBe(10.4);
    const pedi = r.find((e) => e.especialidade === "PEDIATRIA")!;
    expect(pedi.ocupacao).toBe(95);
    // Sem base em agosto, não inventa crescimento.
    expect(pedi.variacao).toBeNull();
  });

  it("aponta queda de procura e faltas altas", () => {
    const d = diagnosticoEspecialidades(rankingEspecialidades(linhas, periodo), "agosto");
    const ids = d.map((x) => x.id);
    expect(ids).toContain("queda-CARDIOLOGIA");
    expect(ids).toContain("faltas-CARDIOLOGIA");
    // Sem base em agosto, Pediatria não "cresce".
    expect(ids).not.toContain("alta-PEDIATRIA");
    expect(d.find((x) => x.id === "queda-CARDIOLOGIA")!.acao).toContain("agosto");
  });

  it("ociosidade e oportunidade de expansão pela ocupação da grade", () => {
    const r = ociosidadeEOportunidade(linhas, periodo, diasValidos(linhas, periodo.hoje));
    expect(r.ociosas.map((o) => o.especialidade)).toContain("CARDIOLOGIA");
    const pedi = r.oportunidades.find((o) => o.especialidade === "PEDIATRIA")!;
    expect(pedi.ocupacao).toBe(95);
    // A agenda por ordem de chegada (500 vagas) não diluiu a ocupação.
    expect(pedi.vagas).toBe(200);
  });

  it("agendas ordenadas por volume e faixas", () => {
    const a = agendasPorVolume(linhas, periodo);
    expect(a[0].especialidade).toBe("CLINICO GERAL");
    expect(a.find((x) => x.ordemChegada)?.ocupacao).toBeNull();
    expect(faixaDoVolume(300)).toBe("300");
    expect(faixaDoVolume(150)).toBe("100");
    expect(faixaDoVolume(29)).toBe("0");
  });
});
