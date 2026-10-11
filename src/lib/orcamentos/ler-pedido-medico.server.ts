import {
  PROMPT_LEITURA_PEDIDO_BALCAO,
  interpretarLeituraPedidoBalcao,
  type LeituraPedidoBalcao,
} from "./leitura-pedido";

const MODELO = "google/gemini-2.5-flash";

/** Data URL de foto (image/*) ou PDF escaneado. */
export const DATA_URL_PEDIDO = /^data:(image\/[a-z0-9.+-]+|application\/pdf);base64,/i;

const falha = (motivo: "configuracao" | "provedor"): LeituraPedidoBalcao => ({
  leitura: { tipo: "falha_tecnica", motivo },
  pacienteNome: null,
  medicoNome: null,
});

/**
 * Lê o pedido médico fotografado. A imagem só é repassada à IA e descartada:
 * não vai para o banco nem para o storage.
 */
export async function lerPedidoMedicoNaIA(arquivo: string): Promise<LeituraPedidoBalcao> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return falha("configuracao");
  const pdf = arquivo.startsWith("data:application/pdf");
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
                ? { type: "file", file: { filename: "pedido.pdf", file_data: arquivo } }
                : { type: "image_url", image_url: { url: arquivo } },
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
}
