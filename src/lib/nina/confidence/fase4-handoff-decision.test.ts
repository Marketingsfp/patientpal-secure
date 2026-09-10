/**
 * FASE 4 — baixa confiança não é, sozinha, motivo de transferência.
 *
 * Cada teste parte do turno real (mensagem do paciente + estado), passa pelo
 * motor de confiança e só então pela decisão de handoff.
 */
import { describe, expect, it } from "bun:test";
import { detectarIntencoes, intencaoAmbigua } from "../atendimento-fase1";
import { montarContextoCanonicoTurno } from "./contexto-turno";
import { decidirHandoff, POLITICA_RECUPERACAO_PADRAO } from "./handoff-decision";
import { decidirNoTurno, type EstadoDoTurno } from "./runtime";
import type { EtapaFluxoNina } from "../fluxo-estado-normalizar";

const deps = { detectarIntencoes, intencaoAmbigua };

function turno(
  mensagem: string,
  extra: Partial<EstadoDoTurno> = {},
  stage?: EtapaFluxoNina,
) {
  const c = montarContextoCanonicoTurno(
    { mensagemPaciente: mensagem, podeAgendar: true, ...(stage ? { stage } : {}) },
    deps,
  );
  const estado: EstadoDoTurno = {
    texto: "",
    ferramentas: [],
    catalogoEncontrou: false,
    agendamentoConfirmado: false,
    pacienteIdentificado: false,
    esclarecimentoUsado: false,
    handoffSolicitado: false,
    intent: c.intent,
    acao: c.requestedAction,
    tipoTurno: c.turnType,
    mensagemPaciente: mensagem,
    intentAmbiguo: c.intentAmbiguo,
    ...extra,
  };
  const avaliacaoAcao = decidirNoTurno(estado);
  return { contexto: c, avaliacaoAcao };
}

describe("TESTE A — saudação continua com a Nina", () => {
  const { contexto, avaliacaoAcao } = turno("oi", {
    texto: "Olá! Sou a Nina. Como posso ajudar?",
  });
  const plano = decidirHandoff({
    avaliacaoAcao,
    decisaoEfetiva: avaliacaoAcao.decision,
    tipoTurno: contexto.turnType,
  });

  it("não transfere e registra o motivo", () => {
    expect(plano.decision).toBe("CONTINUE");
    expect(plano.reason).toBe("GREETING");
  });
});

describe("TESTE B — pedido genérico vira pergunta, não transferência", () => {
  const { contexto, avaliacaoAcao } = turno("quero uma informação");
  const plano = decidirHandoff({
    avaliacaoAcao,
    decisaoEfetiva: avaliacaoAcao.decision,
    tipoTurno: contexto.turnType,
    tentativasEsclarecimento: 0,
  });

  it("esclarece na primeira ambiguidade", () => {
    expect(plano.decision).toBe("CLARIFY");
    expect(plano.reason).toBe("MISSING_PATIENT_CONTEXT");
    expect(plano.recuperavel).toBe(true);
  });
});

describe("TESTE C — informação factual sem fonte oficial vai para humano", () => {
  const { contexto, avaliacaoAcao } = turno("qual o valor da consulta de neurologia?", {
    texto: "A consulta custa R$ 300,00.",
    ferramentas: [
      {
        nome: "buscar_catalogo",
        capacidade: "searchKnowledgeBase",
        fonte: "catalogo",
        success: true,
      },
    ],
    catalogoEncontrou: false,
  });
  const plano = decidirHandoff({
    avaliacaoAcao,
    decisaoEfetiva: avaliacaoAcao.decision,
    tipoTurno: contexto.turnType,
  });

  it("transfere por falta de respaldo, sem inventar", () => {
    expect(plano.decision).toBe("HANDOFF");
    expect(plano.reason).toBe("MISSING_REQUIRED_SOURCE");
    expect(plano.recuperavel).toBe(false);
  });
});

describe("TESTE D — ação crítica bloqueada com dado que dá para pedir", () => {
  const { contexto, avaliacaoAcao } = turno(
    "quero agendar amanhã às 10h",
    {
      texto: "Vou confirmar antes.",
      requiredFields: ["nome_completo", "data_nascimento"],
      entities: {},
    },
    "CREATING_APPOINTMENT",
  );
  const plano = decidirHandoff({
    avaliacaoAcao,
    decisaoEfetiva: avaliacaoAcao.decision,
    tipoTurno: contexto.turnType,
    tentativasEsclarecimento: 0,
  });

  it("suspende a ação e pergunta, sem executar e sem transferir", () => {
    expect(avaliacaoAcao.actionSafety?.status).toBe("BLOCKED");
    expect(plano.decision).toBe("BLOCK_ACTION");
    expect(plano.clarify).toBe(true);
    expect(plano.reason).toBe("CRITICAL_ACTION_BLOCKED");
  });
});

describe("TESTE E — ação crítica sem recuperação automática", () => {
  const { contexto, avaliacaoAcao } = turno(
    "confirma meu agendamento de amanhã às 10h",
    {
      texto: "Confirmado para amanhã às 10h.",
      ferramentas: [
        {
          nome: "criar_agendamento",
          capacidade: "createAppointment",
          fonte: "agenda",
          success: false,
          erro: "indisponível",
        },
      ],
    },
    "CREATING_APPOINTMENT",
  );
  const plano = decidirHandoff({
    avaliacaoAcao,
    decisaoEfetiva: avaliacaoAcao.decision,
    tipoTurno: contexto.turnType,
    tentativasEsclarecimento: POLITICA_RECUPERACAO_PADRAO.maxTentativasEsclarecimento,
  });

  it("vai para o atendente e não executa a ação", () => {
    expect(plano.decision).toBe("HANDOFF");
    expect(plano.clarify).toBe(false);
  });
});

describe("TESTE F — pedido explícito por atendente", () => {
  const { contexto, avaliacaoAcao } = turno("quero falar com atendente");
  const plano = decidirHandoff({
    avaliacaoAcao,
    decisaoEfetiva: avaliacaoAcao.decision,
    tipoTurno: contexto.turnType,
    pedidoHumanoExplicito: true,
  });

  it("transfere pela regra própria, sem depender de confiança", () => {
    expect(plano.decision).toBe("HANDOFF");
    expect(plano.reason).toBe("EXPLICIT_HUMAN_REQUEST");
  });
});

describe("REGRA — baixa confiança sozinha não transfere", () => {
  const { contexto, avaliacaoAcao } = turno("preciso de ajuda com um exame");
  const plano = decidirHandoff({
    avaliacaoAcao,
    decisaoEfetiva: "HANDOFF",
    tipoTurno: contexto.turnType,
  });

  it("situação recuperável vira esclarecimento", () => {
    expect(plano.decision).toBe("CLARIFY");
  });

  it("mas o loop de esclarecimento tem fim", () => {
    const repetido = decidirHandoff({
      avaliacaoAcao,
      decisaoEfetiva: "CLARIFY",
      tipoTurno: contexto.turnType,
      tentativasEsclarecimento: POLITICA_RECUPERACAO_PADRAO.maxTentativasEsclarecimento,
    });
    expect(repetido.decision).toBe("HANDOFF");
    expect(repetido.reason).toBe("REPEATED_CLARIFICATION_FAILURE");
  });
});
