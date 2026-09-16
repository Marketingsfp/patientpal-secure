import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { contextoDataAtual } from "./data-atual";
import type { FeedbackProva, ProvaGerada } from "./prova.server";

export type { ProvaGerada, ProvaQuestao, FeedbackProva, FeedbackItem } from "./prova.server";

const FeedbackSchema = z.object({
  atendente: z.string().min(1).max(120),
  scripts: z.string().max(12000).optional(),
  tabela: z.string().max(60000).optional(),
  respostas: z.array(z.number().int().min(-1).max(10)).min(1).max(20),
  questoes: z
    .array(
      z.object({
        pergunta: z.string().max(1200),
        alternativas: z.array(z.string().max(600)).min(2).max(6),
        correta: z.number().int().min(0).max(5),
        explicacao: z.string().max(1200).optional(),
        origem: z.string().max(300).optional(),
      }),
    )
    .min(1)
    .max(20),
});

const GenerateSchema = z.object({
  atendente: z.string().min(1).max(120),
  quantidade: z.number().int().min(3).max(15).optional(),
  scripts: z.string().max(12000).optional(),
  tabela: z.string().max(60000).optional(),
  exemplos: z
    .array(
      z.object({
        titulo: z.string().max(300).optional(),
        resumo: z.string().max(2000).optional(),
        pontos_positivos: z.array(z.string().max(500)).max(12).optional(),
        pontos_negativos: z.array(z.string().max(500)).max(12).optional(),
        frases: z
          .array(
            z.object({
              tipo: z.string().max(30),
              trecho: z.string().max(800),
              motivo: z.string().max(800),
            }),
          )
          .max(12)
          .optional(),
        checklist: z
          .array(z.object({ item: z.string().max(300), status: z.string().max(30) }))
          .max(30)
          .optional(),
        transcricao: z.string().max(8000).optional(),
      }),
    )
    .min(1)
    .max(8),
});

export const gerarProva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => GenerateSchema.parse(data))
  .handler(async ({ data }): Promise<ProvaGerada> => {
    const {
      GATEWAY,
      MODEL,
      SYSTEM_PROMPT,
      PROVA_TOOL,
      authHeaders,
      buildUserPrompt,
      normalize,
    } = await import("./prova.server");

    const quantidade = data.quantidade ?? 8;

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: `${contextoDataAtual()}\n\n${SYSTEM_PROMPT}` },
          {
            role: "user",
            content: buildUserPrompt(
              data.atendente,
              quantidade,
              data.exemplos,
              data.scripts,
              data.tabela,
            ),
          },
        ],
        tools: [PROVA_TOOL],
        tool_choice: { type: "function", function: { name: "registrar_prova" } },
      }),
    });

    if (!res.ok) {
      if (res.status === 429)
        throw new Error("Limite de requisições atingido. Aguarde alguns segundos.");
      if (res.status === 402)
        throw new Error("Créditos da IA esgotados. Adicione créditos em Settings > Workspace > Usage.");
      console.error("AI gateway error", res.status, await res.text());
      throw new Error("Falha ao gerar a prova.");
    }

    const json = await res.json();
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("A IA não retornou a prova. Tente novamente.");
    return normalize(JSON.parse(args), quantidade);
  });

export const gerarFeedbackProva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => FeedbackSchema.parse(data))
  .handler(async ({ data }): Promise<FeedbackProva> => {
    const {
      GATEWAY,
      MODEL,
      FEEDBACK_SYSTEM_PROMPT,
      FEEDBACK_TOOL,
      authHeaders,
      buildFeedbackPrompt,
      normalizeFeedback,
    } = await import("./prova.server");

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: `${contextoDataAtual()}\n\n${FEEDBACK_SYSTEM_PROMPT}` },
          {
            role: "user",
            content: buildFeedbackPrompt(
              data.atendente,
              data.questoes,
              data.respostas,
              data.tabela,
              data.scripts,
            ),
          },
        ],
        tools: [FEEDBACK_TOOL],
        tool_choice: { type: "function", function: { name: "registrar_feedback" } },
      }),
    });

    if (!res.ok) {
      if (res.status === 429)
        throw new Error("Limite de requisições atingido. Aguarde alguns segundos.");
      if (res.status === 402)
        throw new Error("Créditos da IA esgotados. Adicione créditos em Settings > Workspace > Usage.");
      console.error("AI gateway error", res.status, await res.text());
      throw new Error("Falha ao gerar o feedback da prova.");
    }

    const json = await res.json();
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("A IA não retornou o feedback. Tente novamente.");
    return normalizeFeedback(JSON.parse(args), data.questoes.length);
  });