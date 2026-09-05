import { describe, expect, it } from "bun:test";
import {
  TIMEOUT_RESPOSTA_PACIENTE_PADRAO_MINUTOS,
  avaliarEsperaPaciente,
  calcularPrazoEspera,
  prazoVencido,
  timeoutAindaValido,
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

describe("FASE 2 — resposta do paciente cancela o prazo", () => {
  const dez = (m: number) => new Date(`2026-09-05T10:${String(m).padStart(2, "0")}:00Z`);
  const prazo = calcularPrazoEspera(dez(0), 30).patient_response_deadline; // 10:30

  it("resposta em 5 minutos: prazo já foi limpo, nenhum timeout", () => {
    expect(
      timeoutAindaValido({ deadlineAtual: null, deadlineEsperado: prazo, agora: dez(5) }),
    ).toBe(false);
  });

  it("resposta em 29 minutos: nenhum timeout", () => {
    expect(
      timeoutAindaValido({ deadlineAtual: null, deadlineEsperado: prazo, agora: dez(29) }),
    ).toBe(false);
  });

  it("corrida 10:29:59 x 10:30:00 — resposta chegou primeiro, sem timeout", () => {
    expect(
      timeoutAindaValido({
        deadlineAtual: null,
        deadlineEsperado: prazo,
        agora: new Date("2026-09-05T10:30:00Z"),
      }),
    ).toBe(false);
  });

  it("ninguém respondeu: timeout válido no vencimento", () => {
    expect(
      timeoutAindaValido({ deadlineAtual: prazo, deadlineEsperado: prazo, agora: dez(30) }),
    ).toBe(true);
    expect(
      timeoutAindaValido({ deadlineAtual: prazo, deadlineEsperado: prazo, agora: dez(29) }),
    ).toBe(false);
  });

  it("nova pergunta cria novo ciclo e invalida o prazo antigo", () => {
    const novo = calcularPrazoEspera(dez(15), 30); // 10:15 -> 10:45
    expect(novo.awaiting_patient_since).toBe("2026-09-05T10:15:00.000Z");
    expect(novo.patient_response_deadline).toBe("2026-09-05T10:45:00.000Z");
    expect(
      timeoutAindaValido({
        deadlineAtual: novo.patient_response_deadline,
        deadlineEsperado: prazo,
        agora: dez(31),
      }),
    ).toBe(false);
  });

  it("eventos duplicados não geram dois estados", () => {
    const a = calcularPrazoEspera(dez(15), 30);
    const b = calcularPrazoEspera(dez(15), 30);
    expect(a).toEqual(b);
  });
});

describe("FASE 3 — motivo estruturado do timeout", () => {
  it("usa o motivo padronizado e o texto interno com o prazo configurado", async () => {
    const { MOTIVO_TIMEOUT_PACIENTE, textoInternoTimeout } = await import(
      "./espera-timeout-motivo"
    );
    expect(MOTIVO_TIMEOUT_PACIENTE).toBe("patient_response_timeout");
    expect(textoInternoTimeout(30)).toBe(
      "Paciente sem resposta por 30 minutos — transferido automaticamente pela Nina.",
    );
  });
});

// ---------------------------------------------------------------------------
// FASE 4 — contexto do resumo e invalidação dos estados de agendamento
// ---------------------------------------------------------------------------
import { estadoVazio } from "./fluxo-estado-normalizar";
import { encerrarEstadosTransacionais, etapaTransacional } from "./sessao";
import { informacoesEstado, pendenciasTimeout, rotuloEtapa } from "./timeout-resumo";
import { normalizarResumo, blocosVisiveis } from "@/lib/atendimento/handoff-resumo";

function estadoAguardandoConfirmacao() {
  const e = estadoVazio();
  e.patient.first_name = "João";
  e.patient.identified = true;
  e.appointment.specialty = "Cardiologia";
  e.appointment.doctor_name = "Dra. Ana";
  e.appointment.date = "2026-09-12";
  e.appointment.time = "09:00";
  e.appointment.slot_inicio = "2026-09-12T09:00:00Z";
  e.appointment.intent_confirmed = true;
  e.flow.stage = "WAITING_FINAL_CONFIRMATION";
  return e;
}

describe("FASE 4 — resumo do timeout", () => {
  it("descreve a etapa em que o fluxo parou", () => {
    expect(rotuloEtapa("WAITING_FINAL_CONFIRMATION")).toBe(
      "Aguardando confirmação final do agendamento",
    );
  });

  it("pede revalidação de disponibilidade quando havia horário pendente", () => {
    const p = pendenciasTimeout(estadoAguardandoConfirmacao());
    expect(p.some((t) => /revalidar a disponibilidade/i.test(t))).toBe(true);
    expect(p.some((t) => /ainda tem interesse/i.test(t))).toBe(true);
  });

  it("reaproveita dados já conversados", () => {
    const i = informacoesEstado(estadoAguardandoConfirmacao());
    expect(i).toContain("Especialidade: Cardiologia");
    expect(i).toContain("Profissional: Dra. Ana");
  });

  it("invalida os estados de confirmação e agendamento", () => {
    const e = encerrarEstadosTransacionais(estadoAguardandoConfirmacao());
    expect(e.appointment.intent_confirmed).toBe(false);
    expect(e.appointment.slot_confirmed_by_patient).toBe(false);
    expect(e.appointment.date).toBeNull();
    expect(e.appointment.time).toBeNull();
    expect(e.appointment.slot_inicio).toBeNull();
    expect(etapaTransacional(e.flow.stage)).toBe(false);
    // Contexto permanece: especialidade e profissional não são apagados.
    expect(e.appointment.specialty).toBe("Cardiologia");
    expect(e.patient.first_name).toBe("João");
  });

  it("um 'sim' tardio não encontra nenhuma vaga confirmada para executar", () => {
    const e = encerrarEstadosTransacionais(estadoAguardandoConfirmacao());
    const podeAgendar =
      e.appointment.intent_confirmed &&
      e.appointment.slot_confirmed_by_patient &&
      Boolean(e.appointment.slot_inicio);
    expect(podeAgendar).toBe(false);
  });

  it("o resumo mostra a última pergunta, a etapa e o motivo do handoff", () => {
    const r = normalizarResumo(
      { intencao: "agendamento", motivo_contato: "Agendamento de Cardiologia" },
      {
        motivoHandoff: "patient_response_timeout",
        ultimaPergunta: "Posso confirmar o horário das 09:00?",
        etapaInterrompida: "Aguardando confirmação final do agendamento",
        pendenciasExtras: ["Confirmar se o paciente ainda tem interesse"],
        informacoesExtras: ["Especialidade: Cardiologia"],
      },
    );
    expect(r.ultima_pergunta).toBe("Posso confirmar o horário das 09:00?");
    expect(r.etapa_interrompida).toBe("Aguardando confirmação final do agendamento");
    expect(r.motivo_handoff).toBe("patient_response_timeout");
    expect(r.pendencias).toContain("Confirmar se o paciente ainda tem interesse");
    expect(r.informacoes).toContain("Especialidade: Cardiologia");
    const titulos = blocosVisiveis(r).map((b) => b.titulo);
    expect(titulos).toContain("Última pergunta da Nina");
    expect(titulos).toContain("Etapa em que parou");
  });

  it("nunca inventa agendamento confirmado a partir da IA", () => {
    const r = normalizarResumo({ agendamento_confirmado: { medico: "Dr. X" } });
    expect(r.agendamento_confirmado).toBeNull();
  });
});
