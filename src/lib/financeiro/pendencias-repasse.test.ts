import { describe, expect, it } from "bun:test";
import {
  agruparPendencias,
  diasDeAtraso,
  janelaDePendencias,
  JANELA_PADRAO_DIAS,
} from "./pendencias-repasse";

describe("janelaDePendencias", () => {
  it("olha os sete dias anteriores e nunca inclui hoje", () => {
    // Hoje = 09/09/2026 → 02/09 a 08/09.
    expect(janelaDePendencias("2026-09-09")).toEqual({ de: "2026-09-02", ate: "2026-09-08" });
  });

  it("na segunda-feira a janela alcança o sábado anterior", () => {
    // 07/09/2026 é uma segunda; a janela precisa pegar 05/09 (sábado).
    const { de, ate } = janelaDePendencias("2026-09-07");
    expect(de <= "2026-09-05").toBe(true);
    expect(ate).toBe("2026-09-06");
  });

  it("atravessa a virada de mês sem quebrar", () => {
    expect(janelaDePendencias("2026-09-03")).toEqual({ de: "2026-08-27", ate: "2026-09-02" });
  });

  it("aceita uma janela diferente da padrão", () => {
    expect(janelaDePendencias("2026-09-09", 1)).toEqual({ de: "2026-09-08", ate: "2026-09-08" });
    expect(JANELA_PADRAO_DIAS).toBe(7);
  });
});

describe("agruparPendencias", () => {
  it("agrupa por dia, conta médicos distintos e ordena do mais novo ao mais antigo", () => {
    const r = agruparPendencias([
      { data: "2026-09-08", medico_id: "m1", valor: 100 },
      { data: "2026-09-08", medico_id: "m1", valor: "50.50" },
      { data: "2026-09-02", medico_id: "m2", valor: 80 },
      { data: "2026-09-02", medico_id: "m3", valor: 20 },
    ]);
    expect(r.dias.map((d) => d.dia)).toEqual(["2026-09-08", "2026-09-02"]);
    expect(r.dias[0]).toEqual({
      dia: "2026-09-08",
      atendimentos: 2,
      medicos: 1,
      valorBruto: 150.5,
    });
    expect(r.dias[1].medicos).toBe(2);
    expect(r.totalAtendimentos).toBe(4);
    expect(r.diaMaisAntigo).toBe("2026-09-02");
  });

  it("atendimento sem médico amarrado conta na fila mas não infla a contagem de médicos", () => {
    const r = agruparPendencias([
      { data: "2026-09-08", medico_id: null, valor: 100 },
      { data: "2026-09-08", valor: 100 },
    ]);
    expect(r.dias[0].atendimentos).toBe(2);
    expect(r.dias[0].medicos).toBe(0);
  });

  it("valor ausente ou inválido vale zero em vez de quebrar a soma", () => {
    const r = agruparPendencias([
      { data: "2026-09-08", valor: null },
      { data: "2026-09-08", valor: "abc" },
      { data: "2026-09-08", valor: 30 },
    ]);
    expect(r.dias[0].valorBruto).toBe(30);
  });

  it("linha sem data é ignorada", () => {
    expect(agruparPendencias([{ data: "", valor: 10 }]).totalAtendimentos).toBe(0);
  });

  it("lista vazia devolve fila vazia", () => {
    expect(agruparPendencias([])).toEqual({
      dias: [],
      totalAtendimentos: 0,
      diaMaisAntigo: null,
    });
  });
});

describe("diasDeAtraso", () => {
  it("mede o atraso da pendência mais antiga", () => {
    expect(diasDeAtraso("2026-09-02", "2026-09-09")).toBe(7);
    expect(diasDeAtraso("2026-09-08", "2026-09-09")).toBe(1);
  });

  it("sem pendência não há atraso", () => {
    expect(diasDeAtraso(null, "2026-09-09")).toBe(0);
  });

  it("nunca devolve atraso negativo", () => {
    expect(diasDeAtraso("2026-09-10", "2026-09-09")).toBe(0);
  });
});
