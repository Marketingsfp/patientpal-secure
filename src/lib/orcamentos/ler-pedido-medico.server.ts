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
  return (await lerPedidoMedicoComVeredito(arquivo)).resultado;
}

/**
 * Só o campo "tipo" da resposta crua da IA (até 40 caracteres) — nunca itens nem nomes,
 * que são dados do paciente. Serve ao registro de diagnóstico.
 */
function vereditoCru(conteudo: string | undefined): string {
  const m = /"tipo"\s*:\s*"([^"]{0,40})/.exec(String(conteudo ?? ""));
  return m ? m[1] : conteudo ? "sem_tipo" : "vazio";
}

export async function lerPedidoMedicoComVeredito(
  arquivo: string,
): Promise<{ resultado: LeituraPedidoBalcao; veredito: string }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return { resultado: falha("configuracao"), veredito: "configuracao" };
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
      return { resultado: falha("provedor"), veredito: `http_${res.status}` };
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const conteudo = json.choices?.[0]?.message?.content;
    return { resultado: interpretarLeituraPedidoBalcao(conteudo), veredito: vereditoCru(conteudo) };
  } catch (e) {
    console.error("[orcamento-foto] leitura exception", e instanceof Error ? e.name : "erro");
    return { resultado: falha("provedor"), veredito: "exception" };
  }
}
