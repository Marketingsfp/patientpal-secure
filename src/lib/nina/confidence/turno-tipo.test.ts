/**
 * FASE 1 — classificar o tipo do turno ANTES de aplicar validadores.
 *
 * O caso real: o paciente escreveu "oi", a Nina cumprimentou corretamente e o
 * Confidence Engine devolveu ~65% (BAIXA) com INTENCAO_AMBIGUA,
 * NECESSIDADE_DE_FONTE_INDETERMINADA e SEM_CONSULTA_PARA_ACAO_QUE_EXIGE_DADO.
 */
import { describe, expect, it } from "bun:test";
import { detectarIntencoes, intencaoAmbigua } from "../atendimento-fase1";
import { montarContextoCanonicoTurno } from "./contexto-turno";
import { decidirNoTurno, type EstadoDoTurno } from "./runtime";
import { aplicabilidadeDoTurno } from "./turno-tipo";

const deps = { detectarIntencoes, intencaoAmbigua };

function canonico(mensagem: string, over: { podeAgendar?: boolean; stage?: never } = {}) {
  return montarContextoCanonicoTurno(
    { mensagemPaciente: mensagem, podeAgendar: over.podeAgendar ?? true },
    deps,
  );
}

function estado(over: Partial<EstadoDoTurno> = {}): EstadoDoTurno {
  return {
    texto: "resposta",
    ferramentas: [],
    catalogoEncontrou: false,
    agendamentoConfirmado: false,
    pacienteIdentificado: false,
    esclarecimentoUsado: false,
    handoffSolicitado: false,
    ...over,
  };
}

describe("TESTE 1 — saudação", () => {
  for (const m of ["oi", "olá", "Bom dia", "boa tarde", "Boa noite!", "oi bom dia"]) {
    it(`"${m}" é SAUDACAO sem ação`, () => {
      const c = canonico(m);
      expect(c.turnType).toBe("SAUDACAO");
      expect(c.requestedAction).toBeNull();
      const a = aplicabilidadeDoTurno(c.turnType);
      expect(a.requiresSource).toBe(false);
      expect(a.requiresTool).toBe(false);
      expect(a.requiresActionSafety).toBe(false);
    });
  }

  it("saudação não é mais tratada como ação desconhecida no motor", () => {
    const c = canonico("oi");
    const r = decidirNoTurno(
      estado({
        texto: "Olá, bom dia! Sou a Nina. Como posso te ajudar hoje?",
        intent: c.intent,
        acao: c.requestedAction,
        tipoTurno: c.turnType,
        intentAmbiguo: c.intentAmbiguo,
      }),
    );
    const codigos = (r.validators ?? []).map((v) => v.reasonCode);
    expect(codigos).not.toContain("INTENCAO_AMBIGUA");
    expect(codigos).not.toContain("NECESSIDADE_DE_FONTE_INDETERMINADA");
    expect(codigos).not.toContain("SEM_CONSULTA_PARA_ACAO_QUE_EXIGE_DADO");
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.actionSafety?.status).toBe("NOT_APPLICABLE");
  });
});

describe("TESTE 2 — esclarecimento", () => {
  for (const m of ["queria uma informação", "quero marcar", "preciso fazer um exame"]) {
    it(`"${m}" não tem ação executável`, () => {
      const c = canonico(m);
      expect(c.turnType).toBe("ESCLARECIMENTO");
      expect(c.requestedAction).toBeNull();
      expect(aplicabilidadeDoTurno(c.turnType).requiresActionSafety).toBe(false);
    });
  }

  it("mensagem ilegível continua sendo ação DESCONHECIDA (não vira null)", () => {
    const c = canonico("...");
    expect(c.requestedAction).toBe("desconhecida");
  });
});

describe("TESTE 3 — informação factual", () => {
  it("pergunta de valor exige fonte oficial", () => {
    const c = canonico("qual o valor da consulta de neurologia?");
    expect(c.turnType).toBe("INFORMACAO");
    expect(c.requestedAction).toBe("informar_valor");
    const a = aplicabilidadeDoTurno(c.turnType);
    expect(a.requiresSource).toBe(true);
    expect(a.requiresTool).toBe(true);
  });
});

describe("TESTE 4 — operação", () => {
  it("só o estágio real de criação vira OPERACAO/criar_agendamento", () => {
    const desejo = canonico("quero agendar uma consulta");
    expect(desejo.turnType).not.toBe("OPERACAO");
    expect(desejo.requestedAction).toBeNull();

    const executando = montarContextoCanonicoTurno(
      { mensagemPaciente: "sim, pode confirmar", podeAgendar: true, stage: "CREATING_APPOINTMENT" },
      deps,
    );
    expect(executando.turnType).toBe("OPERACAO");
    expect(executando.requestedAction).toBe("criar_agendamento");
    expect(aplicabilidadeDoTurno(executando.turnType).requiresActionSafety).toBe(true);
  });
});

describe("HANDOFF", () => {
  it("pedido de humano é turno de transferência", () => {
    const c = canonico("quero falar com uma atendente");
    expect(c.turnType).toBe("HANDOFF");
    expect(c.requestedAction).toBe("transferir_humano");
  });
});
