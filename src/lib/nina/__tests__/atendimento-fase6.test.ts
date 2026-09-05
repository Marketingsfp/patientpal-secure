import { describe, it, expect } from "bun:test";
import { estadoVazio, type EstadoFluxoNina } from "../fluxo-estado.server";
import { blocoPromptFase6, derivarEtapa, pediuAtendenteHumano } from "../atendimento-fase6";

function comEstado(patch: {
  patient?: Partial<EstadoFluxoNina["patient"]>;
  appointment?: Partial<EstadoFluxoNina["appointment"]>;
}): EstadoFluxoNina {
  const base = estadoVazio();
  return {
    ...base,
    patient: { ...base.patient, ...(patch.patient ?? {}) },
    appointment: { ...base.appointment, ...(patch.appointment ?? {}) },
  };
}

const identificado = {
  id: "p1",
  first_name: "Ana",
  identified: true,
  validated: true,
};

function ctx(over: Partial<Parameters<typeof derivarEtapa>[0]> = {}) {
  return {
    mensagem: "oi",
    estado: estadoVazio(),
    primeiraMensagem: false,
    intencoes: [] as string[],
    ...over,
  };
}

describe("fase 6 — pedido de humano", () => {
  it("reconhece pedidos explícitos", () => {
    expect(pediuAtendenteHumano("quero falar com um atendente")).toBe(true);
    expect(pediuAtendenteHumano("me passa para uma pessoa")).toBe(true);
    expect(pediuAtendenteHumano("quanto custa cardiologia?")).toBe(false);
  });
});

describe("fase 6 — máquina de estados", () => {
  it("saudação na primeira mensagem", () => {
    expect(derivarEtapa(ctx({ primeiraMensagem: true }))).toBe("GREETING");
  });

  it("intenção ambígua vira identificação de intenção", () => {
    expect(derivarEtapa(ctx({ mensagem: "bom dia" }))).toBe("INTENT_IDENTIFICATION");
  });

  it("dúvida factual responde informação, sem agendar", () => {
    expect(derivarEtapa(ctx({ mensagem: "quanto custa?", intencoes: ["valor"] }))).toBe(
      "INFORMATION_RESPONSE",
    );
  });

  it("interesse em agendar fica pendente de confirmação", () => {
    expect(
      derivarEtapa(ctx({ mensagem: "tem vaga?", intencoes: ["agendamento"] })),
    ).toBe("BOOKING_INTENT_PENDING");
  });

  it("confirmado sem dados do paciente coleta dados", () => {
    const estado = comEstado({ appointment: { intent_confirmed: true } });
    expect(derivarEtapa(ctx({ estado }))).toBe("COLLECTING_PATIENT_DATA");
  });

  it("com paciente pronto e sem preferências, coleta preferências", () => {
    const estado = comEstado({
      patient: identificado,
      appointment: { intent_confirmed: true },
    });
    expect(derivarEtapa(ctx({ estado }))).toBe("COLLECTING_BOOKING_PREFERENCES");
  });

  it("com resumo pronto espera confirmação final e não cria", () => {
    const estado = comEstado({
      patient: identificado,
      appointment: {
        intent_confirmed: true,
        procedure: "Cardiologia",
        doctor_name: "Dr. João",
        date: "2026-09-08",
        time: "09:00",
        slot_inicio: "2026-09-08T09:00:00",
      },
    });
    expect(derivarEtapa(ctx({ estado }))).toBe("WAITING_FINAL_CONFIRMATION");
  });

  it("após confirmação explícita entra em criação", () => {
    const estado = comEstado({
      patient: identificado,
      appointment: {
        intent_confirmed: true,
        slot_confirmed_by_patient: true,
        date: "2026-09-08",
        time: "09:00",
        slot_inicio: "2026-09-08T09:00:00",
      },
    });
    expect(derivarEtapa(ctx({ estado }))).toBe("CREATING_APPOINTMENT");
  });

  it("agendamento criado vira estado confirmado", () => {
    const estado = comEstado({ appointment: { appointment_id: "a1" } });
    expect(derivarEtapa(ctx({ estado }))).toBe("APPOINTMENT_CONFIRMED");
  });

  it("pedido de humano e falha sem recuperação viram handoff", () => {
    expect(derivarEtapa(ctx({ mensagem: "quero falar com um atendente" }))).toBe("HANDOFF");
    expect(derivarEtapa(ctx({ falhaSemRecuperacao: true }))).toBe("HANDOFF");
  });
});

describe("fase 6 — prompt", () => {
  it("proíbe pular etapas e não vira script", () => {
    const bloco = blocoPromptFase6(ctx({ primeiraMensagem: true }));
    expect(bloco).toMatch(/etapa atual: GREETING/);
    expect(bloco).toMatch(/proibido pular etapa crítica/i);
    expect(bloco).toMatch(/linguagem continua natural/);
  });

  it("handoff pede resumo interno e nunca mostra ao paciente", () => {
    const bloco = blocoPromptFase6(ctx({ mensagem: "quero um atendente humano" }));
    expect(bloco).toMatch(/etapa atual: HANDOFF/);
    expect(bloco).toMatch(/NUNCA envie esse resumo ao paciente/);
    expect(bloco).toMatch(/transfira agora/);
  });

  it("não transfere por falta de dado do paciente", () => {
    const estado = comEstado({ appointment: { intent_confirmed: true } });
    const bloco = blocoPromptFase6(ctx({ estado }));
    expect(bloco).toMatch(/NÃO é motivo de transferência/);
  });
});
