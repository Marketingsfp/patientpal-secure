/**
 * ADERÊNCIA ÀS INSTRUÇÕES PUBLICADAS — leitura e representação das regras.
 *
 * Dados fictícios de homologação. Nenhuma mensagem real, nenhum paciente real.
 *
 * O primeiro teste reproduz o defeito relatado usando o TEXTO PUBLICADO
 * COMPLETO da versão 6, exatamente como foi digitado, passando pela montagem
 * real das instruções do turno — nenhuma lista de obrigações é fornecida à mão.
 */
import { describe, expect, it } from "bun:test";
import { montarInstrucoesDoTurno, obrigacoesDoPrompt } from "./contexto-avaliacao";
import { avaliarObrigacoes, InstructionComplianceValidator } from "./obrigacoes";
import { extrairRegrasPublicadas, regraSeAplica } from "./regras-publicadas";
import type { ContextoConfianca } from "./types";

/** Texto publicado da versão 6 (escopo whatsapp), como está no banco. */
const TEXTO_V6 = `
TESTE TEMPORÁRIO DE FONTE DO PROMPT — HOMOLOGAÇÃO

Somente quando a mensagem recebida do paciente for EXATAMENTE:

TESTE-ARQUITETURA-9381

responda EXATAMENTE:

ARQUITETURA_CONFIRMADA_9381

Não acrescente saudação, emoji, explicação, pergunta, despedida ou qualquer
outro texto nessa resposta específica.

Esta regra existe exclusivamente para teste em homologação.`;

const instrucoesV6 = () =>
  montarInstrucoesDoTurno({
    escopo: "whatsapp",
    versao: "6",
    versaoId: "c0b813b7-2574-4365-8fc2-13556ad6e2b0",
    publicadoEm: "2026-09-10T19:29:12.273Z",
    origem: "publicada",
    texto: TEXTO_V6,
  });

const ctx = (draftText: string, extras: Partial<ContextoConfianca> = {}): ContextoConfianca => ({
  requestedAction: null,
  retrievedSources: [],
  toolResults: [],
  mensagemPaciente: "TESTE-ARQUITETURA-9381",
  instrucoes: instrucoesV6(),
  draftText,
  businessContext: {
    ambiente: "homologacao",
    pacienteIdentificado: false,
    agendamentoConfirmado: false,
    esclarecimentoUsado: false,
    handoffSolicitado: false,
  },
  ...extras,
});

describe("regras publicadas — leitura do texto da Arquitetura", () => {
  it("extrai as regras do texto publicado v6 (antes: zero obrigações)", () => {
    expect(obrigacoesDoPrompt(TEXTO_V6).length).toBeGreaterThan(0);

    const instrucoes = instrucoesV6();
    const literal = instrucoes.regras?.find((r) => r.verificacao === "literal");
    expect(literal?.literal).toBe("ARQUITETURA_CONFIRMADA_9381");
    expect(literal?.condicao).toEqual({
      tipo: "mensagem_exata",
      valor: "TESTE-ARQUITETURA-9381",
    });
    expect(literal?.ambiente).toBe("homologacao");
    expect(literal?.natureza).toBe("exigencia");
    expect(literal?.prioridade).toBe("critica");
    expect(literal?.versao).toBe("6");
    expect(literal?.hash).toBe(instrucoes.hash);
    expect(literal?.trecho).toContain("ARQUITETURA_CONFIRMADA_9381");

    const proibicao = instrucoes.regras?.find((r) => r.natureza === "proibicao");
    expect(proibicao?.verificacao).toBe("proibicao_de_conteudo");
    expect(proibicao?.proibicoes.sort()).toEqual([
      "despedida",
      "emoji",
      "explicacao",
      "pergunta",
      "saudacao",
      "texto_adicional",
    ]);
    // A instrução ocupa duas linhas no texto publicado e não pode se perder.
    expect(proibicao?.linhaFim).toBeGreaterThan(proibicao?.linhaInicio ?? 0);
  });

  it("a resposta exigida pelo texto publicado é reconhecida como cumprida", () => {
    const v = InstructionComplianceValidator(ctx("ARQUITETURA_CONFIRMADA_9381"));
    expect(v.status).toBe("PASS");
    expect(v.evidence["restricoesCumpridas"]).toBe(true);
  });

  it("saudação em vez do texto exigido é descumprimento", () => {
    const r = avaliarObrigacoes(ctx("Olá! Como posso ajudar?"), "Olá! Como posso ajudar?");
    expect(r.restricoesCumpridas).toBe(false);
    expect(InstructionComplianceValidator(ctx("Olá! Como posso ajudar?")).status).toBe("FAIL");
  });

  it("texto exigido acompanhado de saudação e emoji viola a proibição publicada", () => {
    const resposta = "Olá! 😊 ARQUITETURA_CONFIRMADA_9381";
    const r = avaliarObrigacoes(ctx(resposta), resposta);
    expect(r.restricoesCumpridas).toBe(false);
    const violacao = r.avaliacoes.find((a) => a.obrigacao.tipo === "restricao_proibicao");
    expect(violacao?.status).toBe("descumprida");
    expect(violacao?.motivo).toContain("saudacao");
    expect(violacao?.motivo).toContain("emoji");
  });

  it("a condição publicada limita o alcance: outra mensagem não ativa a regra", () => {
    const c = ctx("Bom dia! Como posso ajudar?", { mensagemPaciente: "Bom dia" });
    const r = avaliarObrigacoes(c, c.draftText ?? "");
    expect(r.avaliacoes.some((a) => a.obrigacao.origem === "instrucoes_publicadas")).toBe(false);
  });

  it("regra de homologação não é cobrada em produção", () => {
    const instrucoes = instrucoesV6();
    const regra = instrucoes.regras![0]!;
    expect(regraSeAplica(regra, { mensagemPaciente: "TESTE-ARQUITETURA-9381", ambiente: "producao" })).toBe(false);
    expect(
      regraSeAplica(regra, { mensagemPaciente: "TESTE-ARQUITETURA-9381", ambiente: "homologacao" }),
    ).toBe(true);
  });

  it("alterar o texto invalida a representação anterior", () => {
    const antiga = instrucoesV6();
    const nova = montarInstrucoesDoTurno({
      escopo: "whatsapp",
      versao: "7",
      versaoId: "v7",
      publicadoEm: null,
      origem: "publicada",
      texto: TEXTO_V6.replace("9381", "9382"),
    });
    expect(nova.hash).not.toBe(antiga.hash);

    // Representação da v6 com o hash da v7: descartada, nada é cobrado.
    const c = ctx("qualquer coisa");
    c.instrucoes = { ...nova, regras: antiga.regras };
    const r = avaliarObrigacoes(c, c.draftText ?? "");
    expect(r.avaliacoes.some((a) => a.obrigacao.origem === "instrucoes_publicadas")).toBe(false);
  });

  it("funciona com outro marcador, outra condição e outra proibição", () => {
    const texto = [
      "PROTOCOLO DE ATENDIMENTO",
      "",
      "Quando a mensagem contiver:",
      "",
      "CODIGO-MJ-77",
      "",
      "responda exatamente:",
      "",
      "MJ-77-OK",
      "",
      "Não inclua pergunta nem despedida nessa resposta.",
    ].join("\n");
    const { regras } = extrairRegrasPublicadas(texto, { escopo: "whatsapp", hash: "h1" });
    expect(regras[0]?.literal).toBe("MJ-77-OK");
    expect(regras[0]?.condicao).toEqual({ tipo: "mensagem_contem", valor: "CODIGO-MJ-77" });
    expect(regras[1]?.proibicoes.sort()).toEqual(["despedida", "pergunta"]);
    expect(regraSeAplica(regras[0]!, { mensagemPaciente: "oi, tenho o codigo-mj-77 aqui" })).toBe(
      true,
    );
  });

  it("regra sem texto exigido declarado fica não interpretada, nunca cumprida", () => {
    const { regras, limitacoes } = extrairRegrasPublicadas("responda exatamente:", {
      escopo: "whatsapp",
      hash: "h2",
    });
    expect(regras[0]?.interpretada).toBe(false);
    expect(regras[0]?.verificacao).toBe("nao_interpretada");
    expect(limitacoes).toContain("REGRA_PUBLICADA_NAO_INTERPRETADA");

    const c = ctx("qualquer resposta");
    c.instrucoes = montarInstrucoesDoTurno({
      escopo: "whatsapp",
      texto: "responda exatamente:",
    });
    const r = avaliarObrigacoes(c, c.draftText ?? "");
    const a = r.avaliacoes.find((x) => x.obrigacao.tipo === "restricao_nao_interpretada");
    expect(a?.status).toBe("indeterminada");
    expect(r.limitacoes).toContain("REGRA_PUBLICADA_NAO_INTERPRETADA");
  });

  it("não trunca nem descarta regras por quantidade ou tamanho", () => {
    const longa = `Nunca ${"informe dados sem conferir o catálogo publicado ".repeat(20)}.`;
    const texto = Array.from({ length: 60 }, (_, i) => `- Sempre confira o item ${i}.`)
      .concat([longa])
      .join("\n");
    const { regras } = extrairRegrasPublicadas(texto, { escopo: "whatsapp", hash: "h3" });
    expect(regras).toHaveLength(61);
    expect(regras.at(-1)?.descricao.length).toBeGreaterThan(300);
  });
});
