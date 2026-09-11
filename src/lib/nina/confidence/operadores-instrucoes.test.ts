/**
 * ADERÊNCIA ÀS INSTRUÇÕES PUBLICADAS — operadores de verificação.
 *
 * Dados fictícios de homologação. Nenhuma mensagem real, nenhum paciente real.
 *
 * Todos os casos passam pela cadeia REAL de extração e montagem das instruções
 * (`montarInstrucoesDoTurno`). Nenhuma obrigação é injetada à mão.
 */
import { describe, expect, it } from "bun:test";
import { montarInstrucoesDoTurno } from "./contexto-avaliacao";
import { avaliarObrigacoes, InstructionComplianceValidator } from "./obrigacoes";
import type { ContextoConfianca } from "./types";

const TEXTO_V6 = `
TESTE TEMPORÁRIO DE FONTE DO PROMPT — HOMOLOGAÇÃO

Somente quando a mensagem recebida do paciente for EXATAMENTE:

TESTE-ARQUITETURA-9381

responda EXATAMENTE:

ARQUITETURA_CONFIRMADA_9381

Não acrescente saudação, emoji, explicação, pergunta, despedida ou qualquer
outro texto nessa resposta específica.

Esta regra existe exclusivamente para teste em homologação.`;

/** Regra aberta: exige conduta que só a revisão semântica pode conferir. */
const TEXTO_ABERTO = `
ATENDIMENTO — HOMOLOGAÇÃO

Sempre mantenha um tom acolhedor e adequado ao contexto do paciente.`;

const instrucoes = (texto: string, versao = "6") =>
  montarInstrucoesDoTurno({
    escopo: "whatsapp",
    versao,
    versaoId: "c0b813b7-2574-4365-8fc2-13556ad6e2b0",
    publicadoEm: "2026-09-10T19:29:12.273Z",
    origem: "publicada",
    texto,
  });

const ctx = (
  draftText: string,
  o: { mensagem?: string; texto?: string; ambiente?: "homologacao" | "producao" } = {},
): ContextoConfianca => ({
  requestedAction: null,
  retrievedSources: [],
  toolResults: [],
  mensagemPaciente: o.mensagem ?? "TESTE-ARQUITETURA-9381",
  instrucoes: instrucoes(o.texto ?? TEXTO_V6),
  draftText,
  businessContext: {
    ambiente: o.ambiente ?? "homologacao",
    pacienteIdentificado: false,
    agendamentoConfirmado: false,
    esclarecimentoUsado: false,
    handoffSolicitado: false,
  },
});

describe("operadores da verificação de instruções publicadas", () => {
  it("resposta exata cumpre a exigência literal", () => {
    const c = ctx("ARQUITETURA_CONFIRMADA_9381");
    const r = avaliarObrigacoes(c, c.draftText!);
    expect(r.estadoRestricoes).toBe("cumpridas");
    expect(r.restricoesCumpridas).toBe(true);
    expect(InstructionComplianceValidator(c).status).toBe("PASS");
  });

  it("saudação genérica não satisfaz exigência de resposta literal", () => {
    const c = ctx("Olá! Como posso ajudar?");
    const r = avaliarObrigacoes(c, c.draftText!);
    expect(r.restricoesCumpridas).toBe(false);
    expect(r.estadoRestricoes).toBe("descumpridas");
    const v = InstructionComplianceValidator(c);
    expect(v.status).toBe("FAIL");
    expect(v.reasonCode).toBe("RESTRICAO_PUBLICADA_DESCUMPRIDA");
  });

  it("marcador acompanhado de saudação é descumprimento, não PASS", () => {
    const c = ctx("Olá! ARQUITETURA_CONFIRMADA_9381");
    const r = avaliarObrigacoes(c, c.draftText!);
    expect(r.restricoesCumpridas).toBe(false);
    expect(InstructionComplianceValidator(c).status).toBe("FAIL");
  });

  it("marcador acompanhado de emoji é descumprimento", () => {
    const c = ctx("ARQUITETURA_CONFIRMADA_9381 🙂");
    expect(avaliarObrigacoes(c, c.draftText!).restricoesCumpridas).toBe(false);
    expect(InstructionComplianceValidator(c).status).toBe("FAIL");
  });

  it("diferença de caixa e acentuação não é ignorada na correspondência literal", () => {
    const c = ctx("arquitetura_confirmada_9381");
    expect(avaliarObrigacoes(c, c.draftText!).restricoesCumpridas).toBe(false);
  });

  it("condição não acionada: a regra não bloqueia outro turno", () => {
    const c = ctx("Bom dia! Posso ajudar com seu agendamento?", {
      mensagem: "Quero marcar uma consulta",
    });
    const r = avaliarObrigacoes(c, c.draftText!);
    expect(r.regrasNaoAplicaveis).toBeGreaterThan(0);
    expect(r.restricoesCumpridas).toBeNull();
    expect(["nenhuma_regra_aplicavel", "cumpridas", "indeterminadas"]).toContain(
      r.estadoRestricoes,
    );
    expect(InstructionComplianceValidator(c).status).not.toBe("FAIL");
  });

  it("lista vazia de restrições não vira restricoesCumpridas=true", () => {
    const c = ctx("Bom dia!", { mensagem: "oi", texto: "Atendimento cordial." });
    expect(avaliarObrigacoes(c, c.draftText!).restricoesCumpridas).not.toBe(true);
  });

  it("regra aberta sem revisão disponível fica indeterminada, nunca aprovada", () => {
    const c = ctx("Segue a informação solicitada.", {
      mensagem: "qual o endereço?",
      texto: TEXTO_ABERTO,
    });
    const r = avaliarObrigacoes(c, c.draftText!);
    const abertas = r.avaliacoes.filter((a) => a.obrigacao.origem === "instrucoes_publicadas");
    expect(abertas.every((a) => a.status !== "cumprida")).toBe(true);
    expect(r.restricoesCumpridas).not.toBe(true);
    expect(r.limitacoes).toContain("OBRIGACAO_DE_LINGUAGEM_ABERTA_NAO_VERIFICADA");
  });

  it("a revisão semântica recebe contexto suficiente para avaliar a condição", () => {
    const c = ctx("Segue a informação solicitada.", {
      mensagem: "qual o endereço?",
      texto: TEXTO_ABERTO,
    });
    const vistos: Array<string | null | undefined> = [];
    avaliarObrigacoes(c, c.draftText!, (e) => {
      vistos.push(e.mensagemPaciente, e.ambiente, e.trechoPublicado);
      return "cumprida";
    });
    expect(vistos).toContain("qual o endereço?");
    expect(vistos).toContain("homologacao");
  });
});
