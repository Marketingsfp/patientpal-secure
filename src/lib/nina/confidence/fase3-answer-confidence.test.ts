/**
 * FASE 3 — a confiança da RESPOSTA mede a mensagem deste turno.
 *
 * Não mede o que ainda vai acontecer na conversa: campos que só serão
 * coletados adiante não podem derrubar uma resposta correta. E o tipo do
 * turno decide apenas QUAIS critérios se aplicam — nunca dá nota de graça.
 */
import { describe, expect, it } from "bun:test";
import { detectarIntencoes, intencaoAmbigua } from "../atendimento-fase1";
import { montarContextoCanonicoTurno } from "./contexto-turno";
import {
  decidirNoTurno,
  verificarRespostaFinalDoTurno,
  type EstadoDoTurno,
} from "./runtime";
import type { EtapaFluxoNina } from "../fluxo-estado-normalizar";

const deps = { detectarIntencoes, intencaoAmbigua };

function avaliar(
  mensagem: string,
  texto: string,
  extra: Partial<EstadoDoTurno> = {},
  stage?: EtapaFluxoNina,
) {
  const c = montarContextoCanonicoTurno(
    { mensagemPaciente: mensagem, podeAgendar: true, ...(stage ? { stage } : {}) },
    deps,
  );
  const estado: EstadoDoTurno = {
    texto,
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
  return {
    contexto: c,
    // Confiança da RESPOSTA: a nota da mensagem que o paciente vai receber.
    resultado: verificarRespostaFinalDoTurno(estado, texto),
    // Segurança da AÇÃO: avaliada à parte, no caminho do runtime.
    acao: decidirNoTurno(estado),
  };
}

describe("CENÁRIO 1 — saudação correta pode alcançar confiança alta", () => {
  const { contexto, resultado } = avaliar(
    "oi",
    "Olá, bom dia! 😊 Sou a Nina, assistente virtual da clínica. Como posso te ajudar hoje?",
  );

  it("o turno é saudação, sem ação avaliada", () => {
    expect(contexto.turnType).toBe("SAUDACAO");
    expect(contexto.requestedAction).toBeNull();
  });

  it("a nota é alta e a segurança da ação não se aplica", () => {
    expect(resultado.score).toBeGreaterThanOrEqual(85);
    expect(resultado.actionSafety?.status).toBe("NOT_APPLICABLE");
    expect(resultado.hardBlockers ?? []).toEqual([]);
  });
});

describe("CENÁRIO 2 — saudação com resposta factual inventada tem confiança baixa", () => {
  const { contexto, resultado } = avaliar("oi", "Seu exame custa R$ 500,00.");

  it("continua sendo turno de saudação (o tipo não dá nota)", () => {
    expect(contexto.turnType).toBe("SAUDACAO");
  });

  it("a afirmação de valor sem fonte derruba a confiança da resposta", () => {
    expect(resultado.score).toBeLessThan(60);
    expect((resultado.hardBlockers ?? []).length).toBeGreaterThan(0);
  });
});

describe("CENÁRIO 3 — esclarecimento não é penalizado por dados futuros", () => {
  const { contexto, resultado } = avaliar(
    "quero marcar",
    "Claro. Qual consulta ou exame você gostaria de agendar?",
    { requiredFields: ["especialidade", "medico", "horario"], entities: {} },
  );

  it("é esclarecimento sem ação executável", () => {
    expect(contexto.requestedAction).toBeNull();
  });

  it("campos que ainda serão coletados ficam pendentes, não reprovados", () => {
    const v = (resultado.validators ?? []).find((x) => x.validator === "RequiredDataValidator");
    expect(v?.status).toBe("PENDING");
    expect(resultado.score).toBeGreaterThanOrEqual(85);
    expect(resultado.hardBlockers ?? []).toEqual([]);
  });
});

describe("CENÁRIO 4 — informação factual sem fonte continua penalizada", () => {
  const { resultado } = avaliar(
    "Qual o valor da neurologia?",
    "A consulta de neurologia custa R$ 300,00.",
  );

  it("a nota cai e há bloqueio objetivo", () => {
    expect(resultado.score).toBeLessThan(60);
    expect(resultado.hardBlockers ?? []).toContain("MISSING_REQUIRED_OFFICIAL_SOURCE");
  });
});

describe("CENÁRIO 5 — ação bloqueada não zera uma mensagem de recuperação correta", () => {
  const { resultado, acao } = avaliar(
    "quero agendar amanhã às 10h",
    "Esse horário ainda precisa ser confirmado. Vou verificar antes de concluir.",
    {},
    "CREATING_APPOINTMENT",
  );

  it("a segurança da ação e a confiança da resposta são coisas diferentes", () => {
    expect(acao.decision).not.toBe("ALLOW");
    expect(resultado.score).toBeGreaterThanOrEqual(70);
    expect(resultado.hardBlockers ?? []).toEqual([]);
  });
});
