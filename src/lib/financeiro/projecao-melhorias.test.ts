import { describe, expect, it } from "bun:test";
import type { LinhaAgendaDia } from "./projecao-agenda";
import { diagnosticarQuedas, type LinhaReceitaDia } from "./projecao-melhorias";

const rec = (p: Partial<LinhaReceitaDia> & { dia: string }): LinhaReceitaDia => ({
  medico_id: "m1",
  medico_nome: "DRA CARDIO",
  especialidade: "CARDIOLOGIA",
  cartao: false,
  pagamentos: 0,
  receita: 0,
  ...p,
});

const ag = (p: Partial<LinhaAgendaDia> & { dia: string }): LinhaAgendaDia => ({
  agenda_id: "a1",
  agenda_nome: "CONSULTAS",
  ordem_chegada: false,
  medico_id: "m1",
  medico_nome: "DRA CARDIO",
  especialidade: "CARDIOLOGIA",
  vagas: 0,
  marcados: 0,
  compareceu: 0,
  cancelados: 0,
  ...p,
});

/** Um dia normal de terça: cardiologia R$ 10 mil, ortopedia R$ 5 mil. */
const tercaNormal = (dia: string) => [
  rec({ dia, receita: 8000, pagamentos: 80 }),
  rec({ dia, receita: 2000, pagamentos: 20, cartao: true }),
  rec({
    dia,
    medico_id: "m2",
    medico_nome: "DR ORTO",
    especialidade: "ORTOPEDIA",
    receita: 5000,
    pagamentos: 50,
  }),
];
const agendaNormal = (dia: string) => [
  ag({ dia, vagas: 120, marcados: 100, compareceu: 95 }),
  ag({
    dia,
    agenda_id: "a2",
    medico_id: "m2",
    medico_nome: "DR ORTO",
    especialidade: "ORTOPEDIA",
    vagas: 60,
    marcados: 50,
    compareceu: 48,
  }),
];

/** Sábados: meio expediente, sempre ~metade de uma terça. */
const sabado = (dia: string, receita: number) => [rec({ dia, receita, pagamentos: 60 })];

const hist = ["2026-08-18", "2026-08-25", "2026-09-01"];
const p = { inicioMes: "2026-09-01", hoje: "2026-09-14" };

describe("diagnosticarQuedas", () => {
  it("sábado no normal dos sábados não é queda (caso 05/09/2026)", () => {
    const receitas = [
      ...hist.flatMap(tercaNormal),
      ...sabado("2026-08-22", 25483),
      ...sabado("2026-08-29", 26211),
      ...sabado("2026-09-05", 23318),
      ...sabado("2026-09-12", 28863),
    ];
    const r = diagnosticarQuedas(receitas, [], null, p);
    expect(r.quedas.map((q) => q.dia)).not.toContain("2026-09-05");
  });

  it("explica a queda: médico sem agenda, faltas e Cartão", () => {
    const dia = "2026-09-08";
    const receitas = [
      ...hist.flatMap(tercaNormal),
      // Ortopedia não atendeu; cardiologia com poucos pacientes do Cartão.
      rec({ dia, receita: 8000, pagamentos: 80 }),
      rec({ dia, receita: 400, pagamentos: 4, cartao: true }),
    ];
    const agenda = [
      ...hist.flatMap(agendaNormal),
      ag({ dia, vagas: 120, marcados: 100, compareceu: 70, cancelados: 6 }),
    ];
    const clima = new Map([[dia, { precipitacao_mm: 30, weather_code: 63 }]]);
    const { quedas } = diagnosticarQuedas(receitas, agenda, clima, p);
    const q = quedas.find((x) => x.dia === dia)!;
    expect(q.normal).toBe(15000);
    expect(q.receita).toBe(8400);
    expect(q.queda).toBe(44);

    const orto = q.medicos.find((m) => m.nome === "DR ORTO")!;
    expect(orto.ausente).toBe(true);
    expect(orto.agenda).toBe("sem_agenda");
    expect(q.especialidades[0].nome).toBe("ORTOPEDIA");

    expect(q.faltas).toEqual({ noDia: 30, normal: 4.7 });
    expect(q.cancelados).toEqual({ noDia: 6, normal: 0 });
    expect(q.cartao.variacao).toBe(-80);
    expect(q.tempo).toBe("tempestade");

    const texto = q.motivos.join(" ");
    expect(texto).toContain("DR ORTO");
    expect(texto).toContain("Faltas acima do normal");
    expect(texto).toContain("cancelamento");
    expect(texto).toContain("Dia de chuva forte");
  });

  it("dia quase sem movimento vai para atípicos, não para queda", () => {
    const receitas = [
      ...hist.flatMap(tercaNormal),
      rec({ dia: "2026-09-08", receita: 900, pagamentos: 9 }),
    ];
    const r = diagnosticarQuedas(receitas, [], null, p);
    expect(r.quedas).toHaveLength(0);
    expect(r.atipicos.map((a) => a.dia)).toEqual(["2026-09-08"]);
  });

  it("sem dois dias iguais de referência, não diagnostica", () => {
    const receitas = [
      ...tercaNormal("2026-09-01"),
      rec({ dia: "2026-09-08", receita: 8000, pagamentos: 80 }),
    ];
    expect(diagnosticarQuedas(receitas, [], null, p).quedas).toHaveLength(0);
  });
});
