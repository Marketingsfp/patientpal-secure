import { describe, expect, it } from "bun:test";
import { extrairEvidencia } from "./evidencia-extrator";
import { decidirNoTurno, verificarRespostaFinalDoTurno, type EstadoDoTurno } from "./runtime";

const evidencia = extrairEvidencia({
  ferramenta: "consultar_base_conhecimento",
  capacidade: "searchKnowledgeBase",
  fonte: "base_conhecimento",
  success: true,
  dados: {
    records: [
      {
        id: "profissional-teste",
        medico: "Carlos Silva",
        procedimento: "Consulta Cardiologia",
        dia: "Segunda 09:30h",
        extras: { horarios: [{ dia: "Segunda", inicio: "09:30", observacao: "Agendado" }] },
      },
    ],
  },
});
const texto =
  "Dr. Carlos Silva: segunda-feira a partir de 09:30h (agendado). Gostaria de verificar as vagas na agenda desse profissional?";
function turno(textoResposta = texto): EstadoDoTurno {
  return {
    texto: textoResposta,
    mensagemPaciente: "vcs tem cardiologista?",
    intent: "informacao",
    acao: "informar_profissional",
    ambiente: "homologacao",
    pacienteIdentificado: false,
    agendamentoConfirmado: false,
    esclarecimentoUsado: false,
    handoffSolicitado: false,
    catalogoEncontrou: true,
    fatos: evidencia.fatos,
    consultas: [evidencia.consulta],
    ferramentas: [
      {
        nome: "consultar_base_conhecimento",
        capacidade: "searchKnowledgeBase",
        fonte: "base_conhecimento",
        success: true,
      },
    ],
    estadoOperacional: {
      workflowState: "GREETING",
      appointmentCreated: false,
      appointmentAttempted: false,
      appointmentToolCalled: false,
    },
  };
}

describe("motor distingue modalidade agendado de operação de reserva", () => {
  it("action_safety e answer_confidence aprovam a informação publicada sem exigir reserva", () => {
    const t = turno();
    for (const r of [decidirNoTurno(t), verificarRespostaFinalDoTurno(t, texto)]) {
      expect(r.score).toBe(100);
      expect(r.decision).toBe("ALLOW");
      expect(r.hardBlockers).toEqual([]);
      expect(r.checks.some((c) => c.id === "agendamento_confirmado")).toBe(false);
    }
  });

  it.each([
    "Sua consulta está agendada.",
    "Agendei sua consulta.",
    "Consulta agendada para amanhã às 10h.",
    "Vou agendar para você agora.",
  ])("continua bloqueando resultado ou promessa sem prova: %s", (resposta) => {
    const t = turno(resposta);
    for (const r of [decidirNoTurno(t), verificarRespostaFinalDoTurno(t, resposta)]) {
      expect(r.level).toBe("LOW");
      expect(r.decision).not.toBe("ALLOW");
    }
  });

  it.each(["criar_agendamento", "cancelar_agendamento"])(
    "ação %s exige comprovação mesmo sem texto",
    (acao) => {
      const t = { ...turno(""), acao };
      const r = decidirNoTurno(t);
      expect(r.checks.find((c) => c.id === "agendamento_confirmado")?.aprovado).toBe(false);
      expect(r.hardBlockers).toContain("UNSUPPORTED_OPERATIONAL_CLAIM");
    },
  );

  it.each([
    "Dr. Carlos Silva atende segunda às 17h (agendado).",
    "Temos vaga segunda às 09:30 com Dr. Carlos Silva.",
    "Dr. Carlos Silva: segunda às 09:30 (20 vagas).",
  ])("preserva fonte específica de horário e vagas: %s", (resposta) => {
    const t = turno(resposta);
    for (const r of [decidirNoTurno(t), verificarRespostaFinalDoTurno(t, resposta)]) {
      expect(r.hardBlockers).toContain("UNGROUNDED_CLAIM");
      expect(r.decision).not.toBe("ALLOW");
    }
  });
});
