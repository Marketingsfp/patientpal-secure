/**
 * NINA AI GATEWAY — camada única de acesso ao modelo.
 *
 * Arquitetura: Nina -> NinaAIGateway -> Model Adapter (GeminiAdapter) -> modelo.
 *
 * POR QUE EXISTE: até aqui cada ponto da Nina (painel interno, WhatsApp, voz)
 * montava seu próprio `fetch` para o gateway de IA, com o model id escrito no
 * meio do código. Trocar de modelo exigia caçar chamadas espalhadas. Agora todo
 * ponto da Nina pede o modelo AO GATEWAY, que decide qual usar conforme a
 * feature flag da clínica.
 *
 * SEGURANÇA: arquivo `.server.ts` — nunca entra no bundle do navegador. A
 * LOVABLE_API_KEY é lida somente dentro da chamada, no servidor.
 *
 * ESTA FASE: só troca de modelo + abstração. Nada de reasoning, novas tools,
 * nova memória ou mudança de prompt.
 */
import {
  chamarModeloGemini,
  type ChatMensagem,
  type RespostaChat,
  type OpcoesChamada,
} from "./adapters/gemini-adapter.server";
import { modeloNinaParaClinica, type ResolucaoModelo } from "./modelo-flag.server";

export type { ChatMensagem, RespostaChat };

/** Perfis de uso da Nina. Definem apenas o modelo padrão (comportamento atual). */
export type PerfilNina = "texto" | "voz" | "whatsapp";

export type PedidoNina = {
  clinicaId: string | null;
  perfil: PerfilNina;
  messages: ChatMensagem[];
  tools?: readonly unknown[];
  maxTokens?: number;
  /** Sobrescreve o modelo (uso pontual, ex.: rotinas administrativas). */
  modeloForcado?: string;
};

export type RespostaNina = RespostaChat & { modelo: string; resolucao: ResolucaoModelo };

/**
 * Ponto ÚNICO de chamada do modelo pela Nina.
 * Não adicionar `fetch` direto ao gateway de IA fora daqui.
 */
export async function ninaAIGateway(pedido: PedidoNina): Promise<RespostaNina> {
  const resolucao = pedido.modeloForcado
    ? ({ modelo: pedido.modeloForcado, origem: "forcado", flagAtiva: false } as ResolucaoModelo)
    : await modeloNinaParaClinica(pedido.clinicaId, pedido.perfil);

  const opcoes: OpcoesChamada = {
    modelo: resolucao.modelo,
    messages: pedido.messages,
    tools: pedido.tools,
    maxTokens: pedido.maxTokens,
  };

  const resposta = await chamarModeloGemini(opcoes);
  return { ...resposta, modelo: resolucao.modelo, resolucao };
}
