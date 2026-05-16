import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Schema = z.object({
  audioBase64: z.string().min(10).max(20_000_000),
  mimeType: z.string().min(3).max(80),
  prompt: z.string().max(500).optional(),
});

export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { text: "", error: "LOVABLE_API_KEY ausente" };

    const sys =
      data.prompt ??
      "Transcreva o áudio em português do Brasil com pontuação correta. Retorne apenas o texto transcrito, sem comentários, sem aspas, sem prefixos.";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcreva este áudio:" },
              {
                type: "input_audio",
                input_audio: { data: data.audioBase64, format: "webm" },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Lovable AI transcribe error", res.status, body);
      if (res.status === 429) return { text: "", error: "Limite de uso atingido. Tente em alguns segundos." };
      if (res.status === 402) return { text: "", error: "Créditos de IA esgotados. Adicione créditos no Workspace." };
      return { text: "", error: `Falha na transcrição (${res.status})` };
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    return { text, error: null as string | null };
  });