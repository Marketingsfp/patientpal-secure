/**
 * ÚNICO ponto de contato com o modelo de voz (GPT-Live 1) pelo gateway de IA
 * da Lovable. O restante da ligação (instruções, ferramentas, tela) não
 * depende do formato desta chamada.
 *
 * PARA A LOVABLE: confirmar o endereço, o corpo da requisição, o id dos dois
 * modelos e o formato da resposta para o GPT-Live 1 com a LOVABLE_API_KEY.
 * O formato abaixo segue a API da OpenAI (`POST /v1/live/sessions`,
 * transporte WebRTC, delegação "responses") e ainda não foi validado.
 *
 * SEGURANÇA: `.server.ts` — a chave só é lida aqui, no servidor.
 */

export const ENDPOINT_SESSAO_LIVE = "https://ai.gateway.lovable.dev/v1/live/sessions";
export const MODELO_VOZ_LIGACAO = "gpt-live-1";
/** Modelo de apoio que recebe as instruções da Nina e chama as ferramentas. */
export const MODELO_APOIO_LIGACAO = "openai/gpt-5.6-terra";

type FerramentaChat = {
  type: "function";
  function: { name: string; description?: string; parameters?: unknown };
};

export type PedidoSessaoLive = {
  sdpOferta: string;
  voz: string;
  instrucoesVoz: string;
  instrucoesApoio: string;
  ferramentas: readonly FerramentaChat[];
};

export type SessaoLiveAberta = { sessaoId: string | null; sdpResposta: string };

/** Formato de ferramenta da API Responses (sem o objeto `function` aninhado). */
export function ferramentaParaResponses(f: FerramentaChat) {
  return {
    type: "function" as const,
    name: f.function.name,
    description: f.function.description ?? "",
    parameters: f.function.parameters ?? { type: "object", properties: {} },
  };
}

export function corpoSessaoLive(p: PedidoSessaoLive) {
  return {
    session: {
      model: MODELO_VOZ_LIGACAO,
      instructions: p.instrucoesVoz,
      audio: { output: { voice: p.voz } },
      // Sem gravação do áudio da ligação (LGPD).
      store: false,
      delegation: {
        type: "responses",
        responses: {
          model: MODELO_APOIO_LIGACAO,
          instructions: p.instrucoesApoio,
          tools: p.ferramentas.map(ferramentaParaResponses),
          tool_choice: "auto",
          parallel_tool_calls: false,
        },
      },
      transport: { type: "webrtc", sdp: p.sdpOferta },
    },
  };
}

export async function abrirSessaoLive(p: PedidoSessaoLive): Promise<SessaoLiveAberta> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");
  const resposta = await fetch(ENDPOINT_SESSAO_LIVE, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpoSessaoLive(p)),
  });
  if (!resposta.ok) {
    // Só status: o corpo pode repetir as instruções enviadas.
    console.error("[nina-ligacao] falha ao abrir a sessão de voz", resposta.status);
    throw new Error("Não foi possível iniciar a ligação agora.");
  }
  const dados = (await resposta.json()) as {
    session?: { id?: string };
    transport?: { sdp?: string };
  };
  const sdpResposta = dados.transport?.sdp;
  if (!sdpResposta) throw new Error("Não foi possível iniciar a ligação agora.");
  return { sessaoId: dados.session?.id ?? null, sdpResposta };
}
