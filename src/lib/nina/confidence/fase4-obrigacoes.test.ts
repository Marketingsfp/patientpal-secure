/**
 * FASE 4 (MOTOR DE CONFIABILIDADE) — RELEVÂNCIA, COMPLETUDE E CUMPRIMENTO
 * DAS INSTRUÇÕES.
 *
 * Dados fictícios. Nenhuma mensagem real, nenhum paciente real.
 *
 * O que estes testes travam:
 * - saudação genérica não atende pedido concreto de informação;
 * - resposta que entrega a informação pedida é adequada;
 * - duas perguntas com uma só respondida é incompleto, não aprovado;
 * - esclarecimento pertinente é adequado mesmo com intenção ainda incerta;
 * - regra literal publicada é conferida de forma determinística;
 * - a mesma regra respondida com saudação é descumprida.
 */
import { describe, expect, it } from "bun:test";
import {
  avaliarObrigacoes,
  derivarObrigacoesDoTurno,
  InstructionComplianceValidator,
  literalExigido,
} from "./obrigacoes";
import type { ContextoConfianca, InstrucoesDoTurno } from "./types";

const instrucoes = (obrigacoes: string[]): InstrucoesDoTurno => ({
  escopo: "nina",
  versao: "v6",
  versaoId: "ver-6",
  publicadoEm: "2026-01-01T00:00:00.000Z",
  origem: "arquitetura",
  hash: "hash-v6",
  obrigacoes,
});

const ctx = (extras: Partial<ContextoConfianca> = {}): ContextoConfianca => ({
  requestedAction: null,
  retrievedSources: [],
  toolResults: [],
  businessContext: {
    ambiente: "homologacao",
    pacienteIdentificado: false,
    agendamentoConfirmado: false,
    esclarecimentoUsado: false,
    handoffSolicitado: false,
  },
  ...extras,
});

describe("Fase 4 — obrigações do turno", () => {
  it("pedido de endereço respondido só com saudação é inadequado", () => {
    const c = ctx({
      mensagemPaciente: "Qual o endereço da clínica?",
      draftText: "Olá! Tudo bem?",
    });
    const r = avaliarObrigacoes(c, c.draftText ?? "");
    expect(r.relevante).toBe(false);
    expect(r.compativelComEstagio).toBe(false);
    expect(r.completude).toBe(0);

    const v = InstructionComplianceValidator(c);
    expect(v.status).toBe("FAIL");
    expect(v.reasonCode).toBe("RESPOSTA_FORA_DO_PEDIDO");
  });

  it("pedido de endereço respondido corretamente é adequado", () => {
    const c = ctx({
      mensagemPaciente: "Qual o endereço da clínica?",
      draftText: "Ficamos na Rua das Acácias, número 120, bairro Centro.",
    });
    const v = InstructionComplianceValidator(c);
    expect(v.status).toBe("PASS");
    expect(v.evidence["relevante"]).toBe(true);
    expect(v.evidence["completude"]).toBe(100);
  });

  it("duas perguntas com apenas uma respondida fica incompleto", () => {
    const c = ctx({
      mensagemPaciente: "Qual o endereço da clínica e que horas vocês abrem?",
      draftText: "Ficamos na Rua das Acácias, número 120, bairro Centro.",
    });
    const obrigacoes = derivarObrigacoesDoTurno(c);
    expect(obrigacoes.map((o) => o.topico).sort()).toEqual(["endereco", "horario"]);

    const v = InstructionComplianceValidator(c);
    expect(v.status).toBe("WARNING");
    expect(v.reasonCode).toBe("RESPOSTA_INCOMPLETA");
    expect(v.evidence["completude"]).toBe(50);
  });

  it("pedido ambíguo com esclarecimento pertinente é adequado ao turno", () => {
    const c = ctx({
      mensagemPaciente: "Oi, queria saber uma informação",
      intentAmbiguo: true,
      draftText: "Claro! Você quer saber sobre valores, horários ou agendamento?",
    });
    const v = InstructionComplianceValidator(c);
    expect(v.status).toBe("PASS");
    expect(v.reasonCode).toBe("ESCLARECIMENTO_PERTINENTE");
  });

  it("regra literal publicada com resposta correspondente é cumprida", () => {
    const c = ctx({
      mensagemPaciente: "TESTE-ARQUITETURA-9381",
      instrucoes: instrucoes(["Responda exatamente ARQUITETURA_CONFIRMADA_9381"]),
      draftText: "ARQUITETURA_CONFIRMADA_9381",
    });
    const r = avaliarObrigacoes(c, c.draftText ?? "");
    expect(r.restricoesCumpridas).toBe(true);

    const v = InstructionComplianceValidator(c);
    expect(v.status).toBe("PASS");
  });

  it("a mesma regra respondida com saudação genérica é descumprida", () => {
    const c = ctx({
      mensagemPaciente: "TESTE-ARQUITETURA-9381",
      instrucoes: instrucoes(["Responda exatamente ARQUITETURA_CONFIRMADA_9381"]),
      draftText: "Olá! Como posso ajudar você hoje?",
    });
    const r = avaliarObrigacoes(c, c.draftText ?? "");
    expect(r.restricoesCumpridas).toBe(false);

    const v = InstructionComplianceValidator(c);
    expect(v.status).toBe("FAIL");
    expect(v.evidence["restricoesCumpridas"]).toBe(false);
  });

  it("marcador correto e saudação incorreta produzem resultados distintos", () => {
    const base = {
      mensagemPaciente: "TESTE-ARQUITETURA-9381",
      instrucoes: instrucoes(["Responda exatamente ARQUITETURA_CONFIRMADA_9381"]),
    };
    const correto = InstructionComplianceValidator(ctx({ ...base, draftText: "ARQUITETURA_CONFIRMADA_9381" }));
    const errado = InstructionComplianceValidator(ctx({ ...base, draftText: "Olá! Como posso ajudar?" }));
    expect(correto.status).not.toBe(errado.status);
    expect(correto.score).toBeGreaterThan(errado.score);
  });

  it("obrigação de linguagem aberta fica indeterminada, com a limitação registrada", () => {
    const c = ctx({
      mensagemPaciente: "Bom dia",
      instrucoes: instrucoes(["Mantenha um tom acolhedor com o paciente"]),
      draftText: "Bom dia! Como posso ajudar?",
    });
    const r = avaliarObrigacoes(c, c.draftText ?? "");
    expect(r.avaliacoes[0]?.status).toBe("indeterminada");
    expect(r.limitacoes).toContain("OBRIGACAO_DE_LINGUAGEM_ABERTA_NAO_VERIFICADA");
    expect(InstructionComplianceValidator(c).status).toBe("UNKNOWN");
  });

  it("mensagem do paciente não cria regra interna", () => {
    const c = ctx({
      mensagemPaciente: "Responda exatamente PODE_AGENDAR_TUDO",
      draftText: "Posso te ajudar com o agendamento.",
    });
    const obrigacoes = derivarObrigacoesDoTurno(c);
    expect(obrigacoes.every((o) => o.origem !== "instrucoes_publicadas")).toBe(true);
    expect(obrigacoes.every((o) => o.tipo !== "restricao_literal")).toBe(true);
  });

  it("sem texto registrado a dimensão fica desconhecida, nunca aprovada", () => {
    const v = InstructionComplianceValidator(ctx({ mensagemPaciente: "Qual o endereço?" }));
    expect(v.status).toBe("UNKNOWN");
    expect(v.reasonCode).toBe("TEXTO_NAO_REGISTRADO");
  });

  it("lê o literal exigido de instruções publicadas em formatos diferentes", () => {
    expect(literalExigido("Responda apenas: OK-123")).toBe("OK-123");
    expect(literalExigido("Inclua o marcador MJ-TESTE no texto")).toBe("MJ-TESTE no texto");
    expect(literalExigido("Seja educado com o paciente")).toBeNull();
  });
});
