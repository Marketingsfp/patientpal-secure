import { describe, it, expect } from "bun:test";
import {
  
  detectarIntencoes,
  intencaoAmbigua,
  querAgendar,
  saudacaoPorHorario,
} from "../atendimento-fase1";

const em = (isoUtc: string) => new Date(isoUtc);

describe("saudação por horário (fuso da clínica)", () => {
  it("manhã", () => expect(saudacaoPorHorario(undefined, em("2026-09-05T12:00:00Z"))).toBe("Bom dia"));
  it("tarde", () => expect(saudacaoPorHorario(undefined, em("2026-09-05T18:00:00Z"))).toBe("Boa tarde"));
  it("noite", () => expect(saudacaoPorHorario(undefined, em("2026-09-05T23:00:00Z"))).toBe("Boa noite"));
});

describe("identificação de intenção", () => {
  it("valor", () => expect(detectarIntencoes("Quanto custa a consulta?")).toContain("valor"));
  it("médico", () => expect(detectarIntencoes("Tem cardiologista?")).toContain("medico"));
  it("endereço", () => expect(detectarIntencoes("Onde fica a clínica?")).toContain("endereco"));
  it("cancelamento", () => expect(detectarIntencoes("Quero cancelar minha consulta")).toContain("cancelamento"));
  it("humano", () => expect(detectarIntencoes("Quero falar com uma atendente")).toContain("falar_humano"));

  it("múltiplas intenções são preservadas", () => {
    const i = detectarIntencoes("Quanto custa Cardiologia e tem vaga sábado?");
    expect(i).toContain("valor");
    expect(i).toContain("disponibilidade");
  });
});

describe("pergunta simples não é agendamento", () => {
  it("preço não agenda", () => expect(querAgendar(detectarIntencoes("Quanto custa?"))).toBe(false));
  it("médico não agenda", () => expect(querAgendar(detectarIntencoes("Quais médicos atendem?"))).toBe(false));
  it("marcar agenda", () => expect(querAgendar(detectarIntencoes("Quero marcar uma consulta"))).toBe(true));
});

describe("ambiguidade", () => {
  it("assunto solto é ambíguo", () => {
    const m = "cardiologia";
    expect(intencaoAmbigua(m, detectarIntencoes(m))).toBe(true);
  });
  it("pergunta clara não é ambígua", () => {
    const m = "Quanto custa a consulta de cardiologia?";
    expect(intencaoAmbigua(m, detectarIntencoes(m))).toBe(false);
  });
});

describe("FASE 6 — nenhum bloco comportamental neste módulo", () => {
  it("blocoPromptFase1 não existe mais", async () => {
    const mod = (await import("../atendimento-fase1")) as Record<string, unknown>;
    expect(mod["blocoPromptFase1"]).toBeUndefined();
  });
});
