import { describe, it, expect } from "bun:test";
import { vaosEntreHorarios, vaosDaGrade, rotuloDoVao, type FaixaGrade } from "../intervalos-grade";

const ficha = (inicio: string, fim: string) => ({ inicio, fim });

describe("vaosEntreHorarios", () => {
  it("acha o almoço entre a última ficha da manhã e a primeira da tarde", () => {
    // Fichas fora de ordem de propósito: a função ordena antes de comparar.
    const dia = [
      ficha("11:40", "12:00"),
      ficha("09:40", "10:00"),
      ficha("13:20", "13:40"),
      ficha("10:00", "10:20"),
      ficha("13:40", "14:00"),
      ficha("10:20", "11:40"),
    ];
    expect(vaosEntreHorarios(dia)).toEqual([{ inicio: "12:00", fim: "13:20", minutos: 80 }]);
  });

  it("dia corrido não tem intervalo", () => {
    const dia = [ficha("09:40", "10:00"), ficha("10:00", "10:20"), ficha("10:20", "10:40")];
    expect(vaosEntreHorarios(dia)).toEqual([]);
  });

  it("aceita hora com segundos, como vem do banco", () => {
    const dia = [ficha("08:00:00", "12:00:00"), ficha("14:00:00", "18:00:00")];
    expect(vaosEntreHorarios(dia)).toEqual([{ inicio: "12:00", fim: "14:00", minutos: 120 }]);
  });

  it("uma ficha só não abre intervalo", () => {
    expect(vaosEntreHorarios([ficha("09:00", "17:00")])).toEqual([]);
  });

  it("ficha encaixada por cima de outra não inventa intervalo", () => {
    const dia = [ficha("09:00", "12:00"), ficha("10:00", "17:00")];
    expect(vaosEntreHorarios(dia)).toEqual([]);
  });

  it("folga curta entre fichas não vira intervalo", () => {
    const dia = [ficha("08:00", "12:00"), ficha("12:10", "17:00")];
    expect(vaosEntreHorarios(dia)).toEqual([]);
  });

  it("dois intervalos no mesmo dia saem em ordem", () => {
    const dia = [ficha("07:00", "10:00"), ficha("11:00", "12:00"), ficha("13:00", "17:00")];
    expect(vaosEntreHorarios(dia)).toEqual([
      { inicio: "10:00", fim: "11:00", minutos: 60 },
      { inicio: "12:00", fim: "13:00", minutos: 60 },
    ]);
  });

  it("horário de fim menor que o de início é descartado", () => {
    const dia = [ficha("08:00", "12:00"), ficha("15:00", "15:00"), ficha("16:00", "17:00")];
    expect(vaosEntreHorarios(dia)).toEqual([{ inicio: "12:00", fim: "16:00", minutos: 240 }]);
  });
});

describe("rotuloDoVao", () => {
  it("buraco no meio do dia é almoço", () => {
    expect(rotuloDoVao({ inicio: "12:00", fim: "13:20", minutos: 80 })).toBe("Horário de almoço");
  });

  it("buraco fora da faixa do almoço é só intervalo", () => {
    expect(rotuloDoVao({ inicio: "15:00", fim: "16:00", minutos: 60 })).toBe("Intervalo");
  });
});

describe("vaosDaGrade", () => {
  const faixa = (
    dia_semana: number,
    hora_inicio: string,
    hora_fim: string,
    vigencia_inicio: string | null = null,
    vigencia_fim: string | null = null,
  ): FaixaGrade => ({ dia_semana, hora_inicio, hora_fim, vigencia_inicio, vigencia_fim });

  it("manhã e tarde cadastradas viram o almoço", () => {
    const grade = [faixa(4, "09:40:00", "11:40:00"), faixa(4, "13:40:00", "17:00:00")];
    expect(vaosDaGrade(grade, "2026-09-10", 4)).toEqual([
      { inicio: "11:40", fim: "13:40", minutos: 120 },
    ]);
  });

  it("dia cadastrado corrido não tem almoço", () => {
    expect(vaosDaGrade([faixa(4, "09:40:00", "17:00:00")], "2026-09-10", 4)).toEqual([]);
  });

  it("ignora faixa de outro dia da semana", () => {
    const grade = [faixa(1, "08:00:00", "12:00:00"), faixa(1, "14:00:00", "18:00:00")];
    expect(vaosDaGrade(grade, "2026-09-10", 4)).toEqual([]);
  });

  it("faixa fora da vigência não abre almoço", () => {
    const grade = [
      faixa(4, "08:00:00", "12:00:00"),
      faixa(4, "14:00:00", "18:00:00", null, "2026-08-31"),
    ];
    expect(vaosDaGrade(grade, "2026-09-10", 4)).toEqual([]);
  });
});
