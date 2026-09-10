/**
 * FASE 2 — "não se aplica" nunca pode ser lido como "falhou".
 *
 * Casos de aceite A–D do pedido: saudação, esclarecimento simples, pergunta
 * factual sem fonte (continua reprovando) e ação crítica sem confirmação
 * (continua bloqueada).
 */
import { describe, expect, it } from "bun:test";
import { detectarIntencoes, intencaoAmbigua } from "../atendimento-fase1";
import { montarContextoCanonicoTurno } from "./contexto-turno";
import { decidirNoTurno, type EstadoDoTurno } from "./runtime";
import { linhasConfiabilidade } from "./auditoria";
import type { EtapaFluxoNina } from "../fluxo-estado-normalizar";

const deps = { detectarIntencoes, intencaoAmbigua };

function avaliar(mensagem: string, texto: string, stage?: EtapaFluxoNina) {
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
  };
  return { contexto: c, resultado: decidirNoTurno(estado) };
}

const status = (r: ReturnType<typeof avaliar>["resultado"], nome: string) =>
  (r.validators ?? []).find((v) => v.validator === nome)?.status;

describe("TESTE A — saudação não recebe erro de fonte, ferramenta ou ação", () => {
  const { contexto, resultado } = avaliar(
    "oi",
    "Olá, bom dia! 😊 Sou a Nina, assistente virtual da clínica. Como posso te ajudar hoje?",
  );

  it("o turno é saudação e não tem ação executável", () => {
    expect(contexto.turnType).toBe("SAUDACAO");
    expect(contexto.requestedAction).toBeNull();
  });

  it("nenhum validador reprova", () => {
    const reprovados = (resultado.validators ?? []).filter(
      (v) => v.status === "FAIL" || v.status === "BLOCK" || v.status === "UNKNOWN",
    );
    expect(reprovados).toEqual([]);
  });

  it("fonte, consulta e segurança de ação ficam como não aplicáveis", () => {
    expect(status(resultado, "OfficialSourceValidator")).toBe("NOT_APPLICABLE");
    expect(status(resultado, "ToolIntegrityValidator")).toBe("NOT_APPLICABLE");
    expect(resultado.actionSafety?.status).toBe("NOT_APPLICABLE");
  });

  it("não há bloqueio objetivo e a nota não é penalizada", () => {
    expect(resultado.hardBlockers ?? []).toEqual([]);
    expect(resultado.score).toBeGreaterThanOrEqual(90);
  });

  it("o que não se aplica nem aparece como linha no painel", () => {
    const linhas = linhasConfiabilidade({
      validadores: (resultado.validators ?? []).map((v) => ({
        validator: v.validator,
        status: v.status,
        reasonCode: v.reasonCode,
        evidence: v.evidence ?? {},
      })) as never,
      ferramentas: [],
      fontes: [],
    });
    expect(linhas.some((l) => l.estado === "falha")).toBe(false);
  });
});

describe("TESTE B — esclarecimento simples não é penalizado por falta de fonte", () => {
  const { contexto, resultado } = avaliar(
    "quero uma informação",
    "Claro. Sobre qual consulta ou exame você quer saber?",
  );

  it("é esclarecimento sem ação executável", () => {
    expect(contexto.turnType).toBe("ESCLARECIMENTO");
    expect(contexto.requestedAction).toBeNull();
  });

  it("fonte e consulta não se aplicam e a intenção não reprova", () => {
    expect(status(resultado, "OfficialSourceValidator")).toBe("NOT_APPLICABLE");
    expect(status(resultado, "ToolIntegrityValidator")).toBe("NOT_APPLICABLE");
    expect(status(resultado, "IntentClarityValidator")).toBe("PASS");
    expect(resultado.hardBlockers ?? []).toEqual([]);
  });
});

describe("TESTE C — pergunta factual respondida sem fonte continua reprovando", () => {
  const { contexto, resultado } = avaliar(
    "Qual o valor da ressonância?",
    "A ressonância custa R$ 450,00.",
  );

  it("é informação com ação de informar valor", () => {
    expect(contexto.turnType).toBe("INFORMACAO");
    expect(contexto.requestedAction).toBe("informar_valor");
  });

  it("a falta de fonte oficial continua sendo bloqueio", () => {
    expect(status(resultado, "OfficialSourceValidator")).toBe("BLOCK");
    expect(resultado.hardBlockers ?? []).toContain("MISSING_REQUIRED_OFFICIAL_SOURCE");
    expect(resultado.score).toBeLessThan(60);
  });
});

describe("TESTE D — agendamento sem confirmação continua bloqueado", () => {
  const { contexto, resultado } = avaliar(
    "quero agendar",
    "Pronto! Seu agendamento foi confirmado para amanhã às 10h.",
    "CREATING_APPOINTMENT",
  );

  it("é operação de criação de agendamento", () => {
    expect(contexto.turnType).toBe("OPERACAO");
    expect(contexto.requestedAction).toBe("criar_agendamento");
  });

  it("a segurança da ação continua bloqueada", () => {
    expect(resultado.actionSafety?.status).toBe("BLOCKED");
    expect((resultado.hardBlockers ?? []).length).toBeGreaterThan(0);
  });
});
