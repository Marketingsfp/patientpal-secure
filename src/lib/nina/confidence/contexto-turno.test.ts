/**
 * FASE 2 — o motor passa a receber o estado real do turno.
 * Cobre o gate de saída: intenção conhecida, desconhecida, informação simples,
 * agendamento, clínica com agenda habilitada + pedido de preço, e ausência total
 * de sinais.
 */
import { describe, expect, it } from "bun:test";
import { detectarIntencoes, intencaoAmbigua } from "../atendimento-fase1";
import { montarContextoCanonicoTurno } from "./contexto-turno";
import { montarContextoDoTurno, decidirNoTurno, type EstadoDoTurno } from "./runtime";
import { montarRegistroAuditoria } from "./auditoria";

const deps = { detectarIntencoes, intencaoAmbigua };

function canonico(mensagem: string, podeAgendar: boolean) {
  return montarContextoCanonicoTurno({ mensagemPaciente: mensagem, podeAgendar }, deps);
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

describe("FASE 2 — contexto canônico do turno", () => {
  it("intenção real conhecida vira ação correspondente", () => {
    const c = canonico("qual o valor da ultrassonografia?", false);
    expect(c.intencoes).toContain("valor");
    expect(c.requestedAction).toBe("informar_valor");
    expect(c.intent).not.toBeNull();
  });

  // FASE 1 (refatoração) — INTENT ≠ STAGE ≠ AÇÃO EXECUTÁVEL.
  // Antes este teste afirmava "intenção de agendamento vira criar_agendamento";
  // isso estava conceitualmente errado e foi corrigido.
  it("intenção de agendamento NÃO vira criar_agendamento", () => {
    const c = canonico("quero agendar uma consulta para semana que vem", true);
    expect(c.intencoes).toContain("agendamento");
    expect(c.requestedAction).not.toBe("criar_agendamento");
    expect(c.requestedAction).toBeNull();
  });

  it("clínica com Agenda habilitada + paciente pedindo preço NÃO vira agendamento", () => {
    const c = canonico("quanto custa a consulta de cardiologia?", true);
    expect(c.capacidades.podeAgendar).toBe(true);
    expect(c.requestedAction).toBe("informar_valor");
    expect(c.requestedAction).not.toBe("criar_agendamento");
  });

  it("capacidade nunca contamina a ação, nem sem intenção legível", () => {
    const c = canonico("...", true);
    expect(c.capacidades.podeAgendar).toBe(true);
    expect(c.requestedAction).toBe("desconhecida");
  });

  it("ausência de sinais mantém intenção UNKNOWN e ação desconhecida", () => {
    const c = canonico("", false);
    expect(c.intent).toBeNull();
    expect(c.requestedAction).toBe("desconhecida");
    expect(c.intentAmbiguo).toBe(true);
  });

  it("pedido de humano vira transferir_humano", () => {
    const c = canonico("quero falar com um atendente", false);
    expect(c.requestedAction).toBe("transferir_humano");
  });
});

describe("FASE 2 — motor e auditoria leem a mesma verdade", () => {
  it("a ação enviada ao motor é a mesma registrada na auditoria", () => {
    const c = canonico("quanto custa o ultrassom?", true);
    const r = decidirNoTurno(estado({ intent: c.intent, acao: c.requestedAction }));
    const registro = montarRegistroAuditoria(r, {
      intencao: c.intent,
      acaoSolicitada: c.requestedAction,
    });
    expect(registro.acaoSolicitada).toBe(c.requestedAction);
    expect(registro.acaoSolicitada).toBe("informar_valor");
  });

  it("sem ação informada, a auditoria registra desconhecida (não presume informação)", () => {
    const r = decidirNoTurno(estado({ acao: "desconhecida", intent: null }));
    expect(montarRegistroAuditoria(r, {}).acaoSolicitada).toBe("desconhecida");
  });

  it("o messageId da mensagem de entrada chega ao contexto do motor", () => {
    const ctx = montarContextoDoTurno(estado({ messageId: "wamid.123" }));
    expect(ctx.messageId).toBe("wamid.123");
  });
});

describe("FASE 2 — ausência de ação não é mais PASS 100", () => {
  it("ação ausente não vira responder_informacao no contexto do motor", () => {
    const ctx = montarContextoDoTurno(estado());
    expect(ctx.requestedAction).toBe("desconhecida");
  });

  it("ação desconhecida sem consulta continua reprovando a clareza de intenção", () => {
    const r = decidirNoTurno(estado({ acao: "desconhecida", intent: null }));
    const v = (r.validators ?? []).find((x) => x.validator === "IntentClarityValidator");
    expect(v?.status).toBe("FAIL");
    expect(v?.reasonCode).toBe("ACAO_NAO_DEFINIDA");
    expect(r.score).toBeLessThan(100);
  });

  it("ferramenta bem-sucedida NÃO tira a intenção do denominador (era o falso 100%)", () => {
    const r = decidirNoTurno(
      estado({
        acao: "desconhecida",
        intent: null,
        ferramentas: [
          { nome: "buscar_medicos", capacidade: "listProfessionals", fonte: "agenda", success: true },
        ],
      }),
    );
    const v = (r.validators ?? []).find((x) => x.validator === "IntentClarityValidator");
    expect(v?.status).toBe("WARNING");
    expect(v?.reasonCode).toBe("ACAO_NAO_DEFINIDA");
    expect(v?.status).not.toBe("NOT_APPLICABLE");
    expect(r.score).toBeLessThan(100);
  });

  it("informação simples com intenção clara continua podendo pontuar alto", () => {
    const c = canonico("qual o endereço da clínica?", false);
    const r = decidirNoTurno(estado({ intent: c.intent, acao: c.requestedAction }));
    const v = (r.validators ?? []).find((x) => x.validator === "IntentClarityValidator");
    expect(v?.status).toBe("PASS");
  });
});
