import { describe, expect, it } from "bun:test";
import {
  blocoPromptOfertaCompleta,
  lerPedidoOferta,
  montarOferta,
  textoResumoComValor,
} from "../oferta-completa";
import { estadoVazio } from "../fluxo-estado-normalizar";
import { textoResumo } from "../atendimento-fase4";

function estado(over: Partial<ReturnType<typeof estadoVazio>["appointment"]> = {}) {
  const e = estadoVazio();
  e.appointment = { ...e.appointment, ...over };
  return e;
}

const base = { estado: estado(), nomeUnidade: "Policlínica Menino Jesus", baseAtiva: true };

describe("leitura do pedido", () => {
  it("Teste 1 — pedido de informação sobre a especialidade", () => {
    const l = lerPedidoOferta("Quero informações sobre Ortopedia");
    expect(l.pedeInfoConsulta).toBe(true);
    expect(l.pedeDisponibilidade).toBe(false);
  });

  it("Teste 2 — pedido de disponibilidade", () => {
    const l = lerPedidoOferta("Tem ortopedista hoje?");
    expect(l.pedeDisponibilidade).toBe(true);
    expect(l.preferencias).toContain("hoje");
  });

  it("Teste 3 — intenção de agendar", () => {
    const l = lerPedidoOferta("Quero agendar Ortopedia");
    expect(l.pedeAgendamento).toBe(true);
    expect(l.pedeDisponibilidade).toBe(true);
  });

  it("Teste 14 — preferência de dia e período", () => {
    const l = lerPedidoOferta("Quero sábado de manhã");
    expect(l.preferencias).toEqual(expect.arrayContaining(["sábado", "manhã"]));
  });
});

describe("prompt da oferta", () => {
  it("informação: pede valor, médicos, dias e horários da base", () => {
    const t = blocoPromptOfertaCompleta({ ...base, mensagem: "Informações sobre Ortopedia" });
    expect(t).toContain("consultar_base_conhecimento");
    expect(t).toContain("valor da consulta");
  });

  it("disponibilidade: exige as duas fontes e agrupamento por médico", () => {
    const t = blocoPromptOfertaCompleta({ ...base, mensagem: "Tem ortopedista hoje?" });
    expect(t).toContain("consultar_disponibilidade");
    expect(t).toContain("POR MÉDICO");
  });

  it("Testes 5, 6, 10, 11 e 12 — nunca inventar valor nem vaga", () => {
    const t = blocoPromptOfertaCompleta({ ...base, mensagem: "Tem ortopedista hoje?" });
    expect(t).toContain("não é vaga");
    expect(t).toContain("jamais estime");
  });

  it("preferência do paciente é priorizada", () => {
    const t = blocoPromptOfertaCompleta({ ...base, mensagem: "Quero sábado de manhã" });
    expect(t).toContain("sábado");
  });
});

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

  it("resumo da Fase 4 também traz o valor quando existe", () => {
    const comValor = textoResumo(
      estado({ procedure: "Ortopedia", doctor_name: "Dr. Paulo", date: "05/09/2026", time: "14:30", price: "R$ 150,00" }) as never,
      "Policlínica Menino Jesus",
    );
    expect(comValor).toContain("Valor: R$ 150,00");

    const semValor = textoResumo(
      estado({ procedure: "Ortopedia", doctor_name: "Dr. Paulo" }) as never,
      "Policlínica Menino Jesus",
    );
    expect(semValor).not.toContain("Valor:");
  });
});
