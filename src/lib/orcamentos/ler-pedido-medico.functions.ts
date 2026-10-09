import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  PROMPT_LEITURA_PEDIDO_BALCAO,
  interpretarLeituraPedidoBalcao,
  type LeituraPedidoBalcao,
} from "./leitura-pedido";

const MODELO = "google/gemini-2.5-flash";

const Entrada = z.object({
  // Data URL da foto já reduzida no navegador (ou PDF escaneado).
  arquivo: z
    .string()
    .min(50)
    .max(12_000_000)
    .regex(/^data:(image\/[a-z0-9.+-]+|application\/pdf);base64,/i),
});

const falha = (motivo: "configuracao" | "provedor"): LeituraPedidoBalcao => ({
  leitura: { tipo: "falha_tecnica", motivo },
  pacienteNome: null,
  medicoNome: null,
});

/**
 * Lê o pedido médico fotografado na recepção. A imagem só é repassada à IA e descartada:
 * não vai para o banco nem para o storage.
 */
export const lerPedidoMedicoParaOrcamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Entrada.parse(i))
  .handler(async ({ data }): Promise<LeituraPedidoBalcao> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return falha("configuracao");
    const pdf = data.arquivo.startsWith("data:application/pdf");
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(45_000),
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODELO,
          messages: [
            { role: "system", content: PROMPT_LEITURA_PEDIDO_BALCAO },
            {
              role: "user",
              content: [
                { type: "text", text: "Leia esta imagem:" },
                pdf
                  ? { type: "file", file: { filename: "pedido.pdf", file_data: data.arquivo } }
                  : { type: "image_url", image_url: { url: data.arquivo } },
              ],
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        console.error("[orcamento-foto] leitura falhou", res.status);
        return falha("provedor");
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return interpretarLeituraPedidoBalcao(json.choices?.[0]?.message?.content);
    } catch (e) {
      console.error("[orcamento-foto] leitura exception", e instanceof Error ? e.name : e);
      return falha("provedor");
    }
  });
