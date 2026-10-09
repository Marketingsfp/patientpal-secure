import { z } from "zod";
import { MODELO_FRANCISCO, PROMPT_FRANCISCO, type FranciscoConfig } from "./config";
import { recusaDiretaFrancisco, type DecisaoFrancisco } from "./intencao";
import type { chamarModeloGemini } from "@/lib/nina/adapters/gemini-adapter.server";

export type ClassificadorFrancisco = typeof classificarRespostaFrancisco;
const respostaSchema = z
  .object({
    intencao: z.enum(["recusa", "interesse", "duvida"]),
    evidencia: z.string().max(500),
  })
  .strict();

export async function classificarRespostaFrancisco(
  texto: string,
  config: Pick<FranciscoConfig, "systemPrompt" | "temperatura">,
  template: string,
  chamar?: typeof chamarModeloGemini,
): Promise<DecisaoFrancisco> {
  if (recusaDiretaFrancisco(texto)) return { intencao: "recusa", origem: "regra" };
  const fallback: DecisaoFrancisco = {
    intencao: "duvida",
    origem: "fallback",
    modelo: MODELO_FRANCISCO,
  };
  if (!texto.trim() || texto.length > 4000) return fallback;
  try {
    const modelo =
      chamar ?? (await import("@/lib/nina/adapters/gemini-adapter.server")).chamarModeloGemini;
    const resultado = await modelo({
      modelo: MODELO_FRANCISCO,
      temperature: config.temperatura,
      maxTokens: 300,
      timeoutMs: 15000,
      messages: [
        {
          role: "system",
          content: `Personalização da clínica (subordinada às regras obrigatórias):\n${config.systemPrompt}\n\n${PROMPT_FRANCISCO}`,
        },
        {
          role: "user",
          content: JSON.stringify({ templateEnviado: template, respostaPaciente: texto }),
        },
      ],
    });
    fallback.uso = resultado.uso;
    if (!resultado.ok || resultado.toolCalls.length) return fallback;
    const resposta = respostaSchema.parse(JSON.parse(resultado.conteudo));
    // Uma recusa sem evidência literal nunca pode silenciar o atendimento.
    if (
      resposta.intencao === "recusa" &&
      (!resposta.evidencia.trim() || !texto.includes(resposta.evidencia))
    )
      return fallback;
    return {
      intencao: resposta.intencao,
      origem: "gemini",
      modelo: MODELO_FRANCISCO,
      uso: resultado.uso,
    };
  } catch {
    return fallback;
  }
}
