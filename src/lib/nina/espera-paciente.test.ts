import { describe, expect, it } from "bun:test";
import {
  TIMEOUT_RESPOSTA_PACIENTE_PADRAO_MINUTOS,
  avaliarEsperaPaciente,
  calcularPrazoEspera,
  prazoVencido,
  timeoutRespostaPacienteMinutos,
} from "./espera-paciente";

describe("prazo configurável", () => {
  it("usa 30 minutos por padrão", () => {
    expect(TIMEOUT_RESPOSTA_PACIENTE_PADRAO_MINUTOS).toBe(30);
    expect(timeoutRespostaPacienteMinutos({})).toBe(30);
  });

  it("respeita a configuração do ambiente", () => {
    expect(timeoutRespostaPacienteMinutos({ NINA_PATIENT_RESPONSE_TIMEOUT_MINUTES: "45" })).toBe(45);
    expect(timeoutRespostaPacienteMinutos({ NINA_PATIENT_RESPONSE_TIMEOUT_MINUTES: "0" })).toBe(30);
    expect(timeoutRespostaPacienteMinutos({ NINA_PATIENT_RESPONSE_TIMEOUT_MINUTES: "x" })).toBe(30);
  });

  it("calcula o deadline a partir do início da espera", () => {
    const agora = new Date("2026-09-05T12:00:00Z");
    const p = calcularPrazoEspera(agora, 30);
    expect(p.awaiting_patient_since).toBe("2026-09-05T12:00:00.000Z");
    expect(p.patient_response_deadline).toBe("2026-09-05T12:30:00.000Z");
  });

  it("reconhece prazo vencido", () => {
    expect(prazoVencido("2026-09-05T12:30:00Z", new Date("2026-09-05T12:29:59Z"))).toBe(false);
    expect(prazoVencido("2026-09-05T12:30:00Z", new Date("2026-09-05T12:30:00Z"))).toBe(true);
    expect(prazoVencido(null, new Date())).toBe(false);
  });
});

describe("quando a Nina realmente aguarda o paciente", () => {
  const abre = [
    "Qual sua data de nascimento?",
    "Qual exame você deseja realizar?",
    "Qual horário você prefere: 09:00, 10:30 ou 14:00?",
    "Você possui preferência por algum médico?",
    "Posso confirmar esse agendamento?",
    "Para seguir, me informe seu nome completo, CPF e data de nascimento.",
    "Você quis dizer ultrassom de abdome ou de tireoide?",
  ];
  for (const texto of abre) {
    it(`abre espera: ${texto.slice(0, 40)}`, () => {
      expect(avaliarEsperaPaciente(texto).aguardando).toBe(true);
    });
  }

  const naoAbre = [
    "O endereço da clínica é Rua das Flores, 100, Centro.",
    "O valor da consulta é R$ 150,00 no dinheiro ou pix.",
    "Funcionamos de segunda a sexta, das 7h às 18h.",
    "Seu agendamento está confirmado para quinta-feira às 10h.",
    "Qualquer coisa é só chamar. Tenha um ótimo dia!",
    "Estou à disposição, tenha uma ótima tarde!",
    "",
  ];
  for (const texto of naoAbre) {
    it(`não abre espera: ${texto.slice(0, 40) || "(vazio)"}`, () => {
      expect(avaliarEsperaPaciente(texto).aguardando).toBe(false);
    });
  }

  it("pergunta de cortesia sozinha não segura o atendimento", () => {
    expect(avaliarEsperaPaciente("O endereço é Rua X, 10. Posso ajudar em mais alguma coisa?")
      .aguardando).toBe(false);
  });

  it("classifica o motivo da espera", () => {
    expect(avaliarEsperaPaciente("Qual sua data de nascimento?").motivo).toBe("DADO_OBRIGATORIO");
    expect(avaliarEsperaPaciente("Posso confirmar esse agendamento?").motivo).toBe(
      "ESCOLHA_OU_CONFIRMACAO",
    );
    expect(avaliarEsperaPaciente("Você já realizou esse exame antes?").motivo).toBe(
      "PERGUNTA_DIRETA",
    );
  });
});
