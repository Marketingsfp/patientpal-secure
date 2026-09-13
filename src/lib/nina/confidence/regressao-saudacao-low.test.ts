/**
 * REGRESSÃO — saudação simples não pode ser classificada como LOW.
 *
 * Defeito reproduzido (produção, prompt publicado v15):
 *   paciente: "ola bom dia"
 *   Nina:     "Olá! Bom dia! Eu sou a Nina, atendente virtual da Policlínica
 *              Menino Jesus. Como posso te ajudar hoje?"
 *   resultado: índice 74, nível LOW, decisão HANDOFF, cobertura 50%.
 *
 * Origem: o texto publicado gera exigências de LINGUAGEM em texto aberto que
 * o motor não consegue conferir sozinho. Elas caíam como "não sei" na
 * dimensão de cumprimento das instruções, derrubavam a cobertura e limitavam
 * a nota — exatamente o que o item 2 do prompt publicado proíbe.
 *
 * O que este teste protege:
 *  1. saudação correta não vira LOW nem HANDOFF;
 *  2. a limitação de linguagem continua DECLARADA (não é aprovação silenciosa);
 *  3. regra publicada conferível descumprida continua reprovando.
 */
import { describe, expect, it } from "bun:test";
import { montarInstrucoesDoTurno } from "./contexto-avaliacao";
import { montarContextoDoTurno } from "./runtime";
import { verificarRespostaFinal } from "./final-answer";
import { InstructionComplianceValidator } from "./obrigacoes";
import { PROMPT_PUBLICADO_V15 } from "./fixtures/prompt-publicado-v15";
import type { EstadoDoTurno } from "./runtime";

const RESPOSTA =
  "Olá! Bom dia! Eu sou a Nina, atendente virtual da Policlínica Menino Jesus. Como posso te ajudar hoje?";

const instrucoes = montarInstrucoesDoTurno({
  escopo: "whatsapp",
  texto: PROMPT_PUBLICADO_V15,
  versao: "15",
  versaoId: "e8ecc58b-7186-42ce-8e3f-a90c42c25c1a",
});

const estado = (over: Partial<EstadoDoTurno> = {}): EstadoDoTurno => ({
  texto: RESPOSTA,
  mensagemPaciente: "ola bom dia",
  acao: "responder_informacao",
  tipoTurno: "SAUDACAO",
  ferramentas: [],
  catalogoEncontrou: false,
  agendamentoConfirmado: false,
  pacienteIdentificado: false,
  esclarecimentoUsado: false,
  handoffSolicitado: false,
  apresentacaoJaFeita: false,
  ambiente: "producao",
  conversaId: "conv-regressao",
  messageId: "msg-regressao",
  instrucoes,
  ...over,
});

describe("regressão: saudação com o prompt publicado v15", () => {
  it("o texto publicado realmente produz exigências de linguagem aberta", () => {
    expect((instrucoes.regras ?? []).length).toBeGreaterThan(0);
    expect(instrucoes.limitacoes).toContain(
      "REGRA_DE_LINGUAGEM_ABERTA_NAO_VERIFICADA_AUTOMATICAMENTE",
    );
  });

  it("não classifica a saudação como LOW nem transfere", () => {
    const ctx = montarContextoDoTurno(estado());
    const r = verificarRespostaFinal({ ctx, textoFinal: RESPOSTA });

    expect(r.blockers).toEqual([]);
    expect(r.hardBlockers).toEqual([]);
    expect(r.level).not.toBe("LOW");
    expect(r.decision).not.toBe("HANDOFF");
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.evidenceCoverage ?? 100).toBeGreaterThanOrEqual(90);
  });

  it("a limitação de linguagem aberta continua declarada na evidência", () => {
    const ctx = montarContextoDoTurno(estado());
    const v = InstructionComplianceValidator({ ...ctx, draftText: RESPOSTA });

    expect(["NOT_APPLICABLE", "PASS"]).toContain(v.status);
    // O código agregado pode ser OBRIGACOES_CUMPRIDAS quando há obrigação
    // conferível cumprida no turno (identidade publicada). O que precisa
    // continuar valendo é a limitação DECLARADA logo abaixo.
    expect(v.reasonCode).toMatch(/LINGUAGEM_ABERTA|OBRIGACOES_CUMPRIDAS/);
    expect((v.evidence as { limitacoes?: string[] }).limitacoes).toContain(
      "OBRIGACAO_DE_LINGUAGEM_ABERTA_NAO_VERIFICADA",
    );
  });

  it("regra publicada conferível descumprida continua reprovando", () => {
    const literal = montarInstrucoesDoTurno({
      escopo: "whatsapp",
      texto: 'Quando o paciente disser "teste 9381", responda EXATAMENTE: ARQUITETURA OK 9381',
      versao: "teste",
      versaoId: "teste",
    });
    const ctx = montarContextoDoTurno(
      estado({ mensagemPaciente: 'o paciente disser "teste 9381"', instrucoes: literal }),
    );
    const v = InstructionComplianceValidator({ ...ctx, draftText: RESPOSTA });

    expect(v.status).toBe("FAIL");
  });
});
