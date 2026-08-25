import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { VOCABULARIO_DICA, corrigirFala } from "@/lib/voz-correcoes";
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

    // A dica de vocabulário reduz muito o erro em nomes próprios e jargão
    // da clínica (ex.: "nine" no lugar de "Nina", "sabadim" por "sabadinho").
    const sys = `${
      data.prompt ??
      "Transcreva o áudio em português do Brasil com pontuação correta. Retorne apenas o texto transcrito, sem comentários, sem aspas, sem prefixos."
    }

VOCABULÁRIO ESPERADO (prefira estas grafias quando o som for parecido): ${VOCABULARIO_DICA}.
Regras: mantenha nomes próprios de pessoas com inicial maiúscula; escreva números em dígitos; horários como 14:30; NÃO traduza nem invente termos; se um trecho estiver inaudível, omita-o em vez de adivinhar.`;


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
      if (res.status === 429)
        return { text: "", error: "Limite de uso atingido. Tente em alguns segundos." };
      if (res.status === 402)
        return { text: "", error: "Créditos de IA esgotados. Adicione créditos no Workspace." };
      return { text: "", error: `Falha na transcrição (${res.status})` };
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const bruto = json.choices?.[0]?.message?.content?.trim() ?? "";
    const text = bruto ? corrigirFala(bruto) : "";
    return { text, error: null as string | null };

  });
