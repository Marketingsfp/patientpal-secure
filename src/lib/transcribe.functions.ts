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

    // Modelo dedicado de transcrição (GPT-4o Transcribe). A dica de
    // vocabulário reduz o erro em nomes próprios e jargão da clínica.
    const dica = `${data.prompt ? `${data.prompt} ` : ""}Português do Brasil. Vocabulário: ${VOCABULARIO_DICA}.`;

    const mime = data.mimeType.split(";")[0].replace(/^video\//, "audio/");
    const ext = mime.split("/")[1] || "webm";
    const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append("model", "openai/gpt-4o-transcribe");
    form.append("file", new Blob([bytes], { type: mime }), `audio.${ext}`);
    form.append("response_format", "json");
    form.append("language", "pt");
    form.append("prompt", dica.slice(0, 800));

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "fetch" },
      body: form,
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
    const json = (await res.json()) as { text?: string };
    const bruto = json.text?.trim() ?? "";
    const text = bruto ? corrigirFala(bruto) : "";
    return { text, error: null as string | null };
  });
