import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const Schema = z.object({
  contexto: z.string().max(30_000).optional(),
  especialidade: z.string().max(80).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(30),
});

/**
 * Assistente clínico livre ("Consultar com IA").
 * Recebe uma anamnese livre digitada pelo médico + o histórico da conversa
 * e devolve a resposta em Markdown. A chave LOVABLE_API_KEY nunca sai do servidor.
 */
export const consultarIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");

    const sys = `Você é um assistente clínico de apoio à decisão para ${
      data.especialidade?.trim() || "clínica geral"
    } no Brasil.
Responda SEMPRE em português do Brasil e em Markdown, com títulos curtos, listas e negrito nos achados relevantes.
Seja objetivo e estruturado. Quando propuser hipóteses diagnósticas, ordene por probabilidade e cite os sinais que sustentam cada uma.
Quando os dados forem insuficientes, diga claramente o que falta perguntar ou medir.
NUNCA substitua o julgamento clínico do médico: apresente tudo como sugestão a confirmar.`;

    const contexto = data.contexto?.trim();

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: sys },
          ...(contexto
            ? [
                {
                  role: "system" as const,
                  content: `Anamnese livre / dados informados pelo médico:\n${contexto}`,
                },
              ]
            : []),
          ...data.messages,
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Lovable AI error", res.status, text);
      if (res.status === 429) throw new Error("Limite de uso atingido. Tente em instantes.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados.");
      throw new Error(`Falha IA (${res.status})`);
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const resposta = json.choices?.[0]?.message?.content?.trim() ?? "";
    return { resposta: resposta || "Não foi possível gerar uma resposta." };
  });