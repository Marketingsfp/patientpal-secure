import { describe, it, expect } from "bun:test";
import {
  detectarIntencoes,
  intencaoAmbigua,
  perguntaGeralSobreAtendimento,
  querAgendar,
  saudacaoPorHorario,
} from "../atendimento-fase1";

const noServidor = (hora: number, minuto = 0) => new Date(2026, 8, 5, hora, minuto);

describe("saudação pelo relógio atual do servidor", () => {
  it("usa noite até 04:59", () => expect(saudacaoPorHorario(noServidor(4, 59))).toBe("Boa noite"));
  it("usa manhã das 05:00 às 11:59", () => {
    expect(saudacaoPorHorario(noServidor(5))).toBe("Bom dia");
    expect(saudacaoPorHorario(noServidor(11, 59))).toBe("Bom dia");
  });
  it("usa tarde das 12:00 às 17:59", () => {
    expect(saudacaoPorHorario(noServidor(12))).toBe("Boa tarde");
    expect(saudacaoPorHorario(noServidor(17, 59))).toBe("Boa tarde");
  });
  it("usa noite a partir das 18:00", () =>
    expect(saudacaoPorHorario(noServidor(18))).toBe("Boa noite"));
});

describe("identificação de intenção", () => {
  it("valor", () => expect(detectarIntencoes("Quanto custa a consulta?")).toContain("valor"));
  it("médico", () => expect(detectarIntencoes("Tem cardiologista?")).toContain("medico"));
  it("endereço", () => expect(detectarIntencoes("Onde fica a clínica?")).toContain("endereco"));
  it("cancelamento", () =>
    expect(detectarIntencoes("Quero cancelar minha consulta")).toContain("cancelamento"));
  it("humano", () =>
    expect(detectarIntencoes("Quero falar com uma atendente")).toContain("falar_humano"));

  it("múltiplas intenções são preservadas", () => {
    const i = detectarIntencoes("Quanto custa Cardiologia e tem vaga sábado?");
    expect(i).toContain("valor");
    expect(i).toContain("disponibilidade");
  });

  it("aceite contextual pelo primeiro horário disponível", () => {
    const i = detectarIntencoes("quero com a dra elair no sabado msm, o mais cedo q tiver");
    expect(i).toContain("disponibilidade");
  });
});

describe("pergunta simples não é agendamento", () => {
  it("preço não agenda", () => expect(querAgendar(detectarIntencoes("Quanto custa?"))).toBe(false));
  it("médico não agenda", () =>
    expect(querAgendar(detectarIntencoes("Quais médicos atendem?"))).toBe(false));
  it("marcar agenda", () =>
    expect(querAgendar(detectarIntencoes("Quero marcar uma consulta"))).toBe(true));
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
  it.each([
    "Tem cardiologista?",
    "vcs tem cardiologista?",
    "Vocês têm cardiologistas e quais dias eles atendem?",
    "Quais os horários habituais dos médicos?",
  ])("pergunta informativa geral é clara: %s", (m) => {
    expect(perguntaGeralSobreAtendimento(m)).toBe(true);
    expect(intencaoAmbigua(m, detectarIntencoes(m))).toBe(false);
    expect(querAgendar(detectarIntencoes(m))).toBe(false);
  });
  it.each(["cardiologia", "cardiologista?", "ultrassom"])(
    "assunto isolado continua ambíguo: %s",
    (m) => {
      expect(perguntaGeralSobreAtendimento(m)).toBe(false);
      expect(intencaoAmbigua(m, detectarIntencoes(m))).toBe(true);
    },
  );
  it.each([
    "Tem vaga com cardiologista?",
    "Quero agendar cardiologia",
    "Tem cardiologista disponível amanhã?",
    "Vocês têm cardiologista no dia 21?",
    "Quais dias o Dr. Alex atende?",
  ])("pedido delimitado não é lista geral: %s", (m) => {
    expect(perguntaGeralSobreAtendimento(m)).toBe(false);
  });
});

describe("FASE 6 — nenhum bloco comportamental neste módulo", () => {
  it("blocoPromptFase1 não existe mais", async () => {
    const mod = (await import("../atendimento-fase1")) as Record<string, unknown>;
    expect(mod["blocoPromptFase1"]).toBeUndefined();
  });
});
