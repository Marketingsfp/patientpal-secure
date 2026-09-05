import { describe, it, expect } from "bun:test";
import { estadoVazio, type EstadoFluxoNina } from "../fluxo-estado.server";
import {
  avaliarIntencaoAgendar,
  blocoPromptFase3,
  dadosFaltantes,
} from "../atendimento-fase3";

function estado(mod: (e: EstadoFluxoNina) => void = () => {}): EstadoFluxoNina {
  const e = estadoVazio();
  mod(e);
  return e;
}

describe("confirmação de intenção de agendar", () => {
  it("pergunta de valor não confirma", () => {
    expect(avaliarIntencaoAgendar("Quanto custa Cardiologia?", estado()).confirmado).toBe(false);
  });
  it('"quero agendar" confirma', () => {
    expect(avaliarIntencaoAgendar("Quero agendar", estado()).confirmado).toBe(true);
  });
  it('"pode marcar" confirma', () => {
    expect(avaliarIntencaoAgendar("Pode marcar", estado()).confirmado).toBe(true);
  });
  it('"quero esse horário" confirma', () => {
    expect(avaliarIntencaoAgendar("Quero esse horário", estado()).confirmado).toBe(true);
  });
  it('"gostaria de fazer o agendamento" confirma', () => {
    expect(avaliarIntencaoAgendar("Gostaria de fazer o agendamento", estado()).confirmado).toBe(true);
  });
  it('"sim" só confirma quando existe vaga na mesa', () => {
    expect(avaliarIntencaoAgendar("sim", estado()).confirmado).toBe(false);
    const comVaga = estado((e) => {
      e.appointment.slot_inicio = "2026-09-10T14:00:00Z";
    });
    expect(avaliarIntencaoAgendar("sim", comVaga).confirmado).toBe(true);
  });
  it("perguntar disponibilidade é interesse, não confirmação", () => {
    const r = avaliarIntencaoAgendar("Tem vaga no sábado?", estado());
    expect(r.confirmado).toBe(false);
    expect(r.interesse).toBe(true);
  });
});

describe("coleta de dados", () => {
  it("pergunta de valor não pede dados", () => {
    const p = blocoPromptFase3({ mensagem: "Quanto custa Cardiologia?", estado: estado() });
    expect(p).toContain("PROIBIDO pedir nome");
  });

  it("interesse gera a pergunta de verificação de disponibilidade", () => {
    const p = blocoPromptFase3({ mensagem: "Tem vaga no sábado?", estado: estado() });
    expect(p).toContain("verificasse a disponibilidade");
  });

  it("confirmação pede os obrigatórios de uma vez", () => {
    const p = blocoPromptFase3({ mensagem: "Quero agendar", estado: estado() });
    expect(p).toContain("BOOKING_INTENT_CONFIRMED");
    expect(p).toContain("nome completo");
    expect(p).toContain("data de nascimento");
  });

  it("nome já informado → pede só o que falta", () => {
    const e = estado((s) => {
      s.patient.pending.nome = "Maria Souza";
      s.patient.pending.cpf = "12345678901";
    });
    expect(dadosFaltantes(e)).toEqual(["data_nascimento"]);
    const p = blocoPromptFase3({ mensagem: "Quero agendar", estado: e });
    expect(p).toContain("SOMENTE o que falta: data de nascimento");
    expect(p).toContain("NÃO recomece a coleta");
  });

  it("cadastro já existente é reaproveitado, sem pedir dados", () => {
    const e = estado((s) => {
      s.patient.id = "abc";
      s.patient.identified = true;
      s.patient.first_name = "Maria";
    });
    expect(dadosFaltantes(e)).toEqual([]);
    const p = blocoPromptFase3({ mensagem: "Quero agendar", estado: e });
    expect(p).toContain("NÃO peça dados de novo");
    expect(p).toContain("NÃO crie cadastro novo");
  });

  it("procedimento/médico/data já definidos não são perguntados de novo", () => {
    const e = estado((s) => {
      s.appointment.procedure = "Cardiologia";
      s.appointment.doctor_name = "Dr. João";
      s.appointment.date = "2026-09-12";
    });
    const p = blocoPromptFase3({ mensagem: "Quero agendar", estado: e });
    expect(p).toContain("NÃO pergunte de novo");
    expect(p).toContain("Cardiologia");
    expect(p).toContain("Dr. João");
  });
});
