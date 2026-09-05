import { describe, it, expect } from "bun:test";
import {
  blocoPromptFase1,
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

describe("bloco de prompt", () => {
  it("primeira mensagem gera saudação e apresentação", () => {
    const p = blocoPromptFase1({
      nomeCurtoUnidade: "Policlínica Menino Jesus",
      jaSeApresentou: false,
      mensagem: "Quanto custa cardiologia?",
      now: em("2026-09-05T18:00:00Z"),
    });
    expect(p).toContain("boa tarde");
    expect(p).toContain("Policlínica Menino Jesus");
    expect(p).toContain("NÃO peça nome, CPF");
  });

  it("não repete apresentação depois da primeira resposta", () => {
    const p = blocoPromptFase1({
      nomeCurtoUnidade: "Policlínica Menino Jesus",
      jaSeApresentou: true,
      mensagem: "E o endereço?",
      now: em("2026-09-05T18:00:00Z"),
    });
    expect(p).toContain("NÃO repita a apresentação");
    expect(p).not.toContain("Sou a Nina, assistente virtual");
  });

  it("mensagem ambígua pede clarificação", () => {
    const p = blocoPromptFase1({
      nomeCurtoUnidade: "Policlínica Menino Jesus",
      jaSeApresentou: false,
      mensagem: "cardiologia",
      now: em("2026-09-05T13:00:00Z"),
    });
    expect(p).toContain("AMBIGUIDADE");
  });

  it("mudança de assunto está prevista no prompt", () => {
    const p = blocoPromptFase1({
      nomeCurtoUnidade: "X",
      jaSeApresentou: true,
      mensagem: "e onde fica?",
      now: em("2026-09-05T13:00:00Z"),
    });
    expect(p).toContain("MUDANÇA DE ASSUNTO");
  });
});
