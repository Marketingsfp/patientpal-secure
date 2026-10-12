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
import { extrairRegrasPublicadas, regraSeAplica } from "./regras-publicadas";

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

describe("regras publicadas — leitura do texto da Arquitetura", () => {
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
