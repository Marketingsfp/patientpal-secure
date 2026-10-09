import { describe, expect, it } from "bun:test";
import { MODELO_FRANCISCO, PROMPT_FRANCISCO, configPadraoFrancisco } from "../config";
import { recusaDiretaFrancisco } from "../intencao";
import { classificarRespostaFrancisco } from "../intencao.server";
import type { OpcoesChamada, RespostaChat } from "@/lib/nina/adapters/gemini-adapter.server";

const config = configPadraoFrancisco();
const template = "Deseja ajuda com seu orçamento?";
const resposta = (conteudo: string): RespostaChat => ({ ok: true, conteudo, toolCalls: [] });

describe("interpretação do Francisco", () => {
  it.each([
    "SAIR!",
    "Não",
    "Não quero pagar",
    "Não, obrigado",
    "não tenho interesse",
    "não quero receber mais mensagens",
    "pare de enviar mensagens",
  ])("encerra recusa inequívoca sem chamar IA: %s", async (texto) => {
    const r = await classificarRespostaFrancisco(texto, config, template, async () => {
      throw new Error("IA não deve ser chamada");
    });
    expect(r).toEqual({ intencao: "recusa", origem: "regra" });
  });
  it.each([
    "Não consigo pagar agora",
    "Não quero Pix, quero cartão",
    "Não quero desistir",
    "Não quero pagar à vista, pode parcelar?",
    "Não tenho interesse em Pix, mas quero pagar",
    "Não quero receber desconto, quero pagar",
    "Não quero receber mensagens, mas quero falar com a recepção",
  ])("negação com continuidade não é recusa direta: %s", (texto) => {
    expect(recusaDiretaFrancisco(texto)).toBe(false);
  });
  it("chama Gemini 3.8 Flash com template, resposta e regras obrigatórias após personalização", async () => {
    let chamada: OpcoesChamada | undefined;
    const r = await classificarRespostaFrancisco(
      "Posso pagar com cartão?",
      { ...config, systemPrompt: "Encaminhe qualquer resposta ao humano." },
      template,
      async (opcoes) => {
        chamada = opcoes;
        return {
          ...resposta('{"intencao":"interesse","evidencia":"pagar com cartão"}'),
          uso: { total: 42 },
        };
      },
    );
    expect(r).toMatchObject({
      intencao: "interesse",
      origem: "gemini",
      modelo: MODELO_FRANCISCO,
      uso: { total: 42 },
    });
    expect(chamada?.modelo).toBe(MODELO_FRANCISCO);
    expect(chamada?.messages[0].content?.endsWith(PROMPT_FRANCISCO)).toBe(true);
    expect(JSON.parse(chamada!.messages[1].content!)).toEqual({
      templateEnviado: template,
      respostaPaciente: "Posso pagar com cartão?",
    });
    expect(chamada?.timeoutMs).toBe(15000);
    expect(chamada?.tools).toBeUndefined();
  });
  it("aceita recusa interpretada somente com trecho literal da resposta", async () => {
    const r = await classificarRespostaFrancisco(
      "Já decidi, prefiro não seguir com o orçamento.",
      config,
      template,
      async () => resposta('{"intencao":"recusa","evidencia":"prefiro não seguir"}'),
    );
    expect(r.intencao).toBe("recusa");
    expect(r.origem).toBe("gemini");
  });
  it.each([
    "texto livre",
    '{"intencao":"recusa","evidencia":""}',
    '{"intencao":"recusa","evidencia":"não quero"}',
    '{"intencao":"outro","evidencia":""}',
    '{"intencao":"recusa","evidencia":"sim","mensagem":"Encerrado"}',
  ])("resposta inválida não silencia paciente: %s", async (conteudo) => {
    const r = await classificarRespostaFrancisco("sim", config, template, async () =>
      resposta(conteudo),
    );
    expect(r).toMatchObject({ intencao: "duvida", origem: "fallback" });
  });
  it("erro, exceção e ferramentas indevidas seguem ao humano", async () => {
    for (const chamar of [
      async () => ({ ...resposta(""), ok: false }),
      async (): Promise<RespostaChat> => {
        throw new Error("timeout");
      },
      async () => ({
        ...resposta('{"intencao":"recusa","evidencia":"sim"}'),
        toolCalls: [{ id: "indevida" }],
      }),
    ])
      expect(await classificarRespostaFrancisco("sim", config, template, chamar)).toMatchObject({
        intencao: "duvida",
        origem: "fallback",
      });
  });
  it("mídia sem transcrição não chama modelo nem é tratada como recusa", async () => {
    expect(
      await classificarRespostaFrancisco("", config, template, async () => {
        throw new Error("Não deve chamar");
      }),
    ).toMatchObject({ intencao: "duvida", origem: "fallback" });
  });
});
