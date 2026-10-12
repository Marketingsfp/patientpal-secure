import { describe, expect, it } from "bun:test";
import { montarOferta, textoResumoComValor } from "../oferta-completa";
import { estadoVazio } from "../fluxo-estado-normalizar";

function estado(over: Partial<ReturnType<typeof estadoVazio>["appointment"]> = {}) {
  const e = estadoVazio();
  e.appointment = { ...e.appointment, ...over };
  return e;
}

const base = { estado: estado(), nomeUnidade: "Policlínica Menino Jesus", baseAtiva: true };

describe("montagem da oferta", () => {
  it("Teste 4 — organiza por médico", () => {
    const r = montarOferta({
      titulo: "Ortopedia",
      valor: "R$ 150,00",
      unidade: "Policlínica Menino Jesus",
      slots: [
        { medico: "Dr. João", data: "07/09", hora: "09:00" },
        { medico: "Dr. João", data: "07/09", hora: "10:00" },
        { medico: "Dr. Paulo", data: "08/09", hora: "14:00" },
      ],
    });
    expect(r.linhas[1]).toBe("Valor: R$ 150,00");
    expect(r.linhas).toContain("Dr. João");
    expect(r.linhas).toContain("Dr. Paulo");
    expect(r.linhas.at(-1)).toBe("Unidade: Policlínica Menino Jesus");
  });

  it("Teste 8 — limita a quantidade de horários", () => {
    const slots = Array.from({ length: 20 }, (_, i) => ({
      medico: "Dr. Paulo",
      data: "05/09",
      hora: `1${i % 10}:00`,
    }));
    const r = montarOferta({ titulo: "Ortopedia", slots });
    expect(r.temMaisHorarios).toBe(true);
  });

  it("Teste 5 — sem valor cadastrado, nenhuma linha de preço", () => {
    const r = montarOferta({
      titulo: "Ortopedia",
      valor: null,
      slots: [{ medico: "Dr. Paulo", data: "05/09", hora: "14:00" }],
    });
    expect(r.linhas.some((l) => l.startsWith("Valor"))).toBe(false);
  });

  it("Teste 6 — só entram os horários vindos da agenda", () => {
    const r = montarOferta({
      titulo: "Ortopedia",
      slots: [{ medico: "Dr. Paulo", data: "05/09", hora: "14:00" }],
    });
    expect(r.linhas.join("\n")).toContain("14:00");
    expect(r.linhas.join("\n")).not.toContain("09:00");
  });
});

describe("resumo final", () => {
  it("Testes 7 e 16 — resumo inclui o valor", () => {
    const t = textoResumoComValor({
      paciente: "João Silva",
      atendimento: "Ortopedia",
      valor: "R$ 150,00",
      medico: "Dr. Paulo",
      data: "05/09/2026",
      hora: "14:30",
      unidade: "Policlínica Menino Jesus",
    });
    expect(t).toContain("Valor: R$ 150,00");
    expect(t).toContain("Horário: 14:30");
  });
});
