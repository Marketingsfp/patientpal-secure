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
import {
  selectThinkingLevel,
  nivelNaoRegride,
  rotuloDebug,
  type ContextoRaciocinio,
  type NivelRaciocinio,
} from "./reasoning-router";

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
  /**
   * Fase 2 — contexto desta REQUISIÇÃO/ETAPA para o Reasoning Router decidir
   * entre LOW/MEDIUM/HIGH. Sem isso, o gateway usa LOW (padrão econômico).
   */
  raciocinio?: ContextoRaciocinio;
  /** Força o nível (uso interno de teste). Ignora o router. */
  nivelForcado?: NivelRaciocinio;
};

export type RespostaNina = RespostaChat & {
  modelo: string;
  resolucao: ResolucaoModelo;
  /** Nível efetivamente usado nesta etapa. */
  nivel: NivelRaciocinio;
  /** Etiqueta interna de homologação. NUNCA enviar ao paciente. */
  debug: string;
};

/**
 * Ponto ÚNICO de chamada do modelo pela Nina.
 * Não adicionar `fetch` direto ao gateway de IA fora daqui.
 */
export async function ninaAIGateway(pedido: PedidoNina): Promise<RespostaNina> {
  const resolucao = pedido.modeloForcado
    ? ({ modelo: pedido.modeloForcado, origem: "forcado", flagAtiva: false } as ResolucaoModelo)
    : await modeloNinaParaClinica(pedido.clinicaId, pedido.perfil);

  // ---- Reasoning Router: política única, decidida por requisição/etapa.
  const decisao = pedido.raciocinio
    ? selectThinkingLevel(pedido.raciocinio)
    : { nivel: "low" as NivelRaciocinio, motivo: "sem contexto: padrão LOW" };
  const nivel =
    pedido.nivelForcado ??
    nivelNaoRegride(decisao.nivel, pedido.raciocinio?.nivelAnterior);

  const opcoes: OpcoesChamada = {
    modelo: resolucao.modelo,
    messages: pedido.messages,
    tools: pedido.tools,
    maxTokens: pedido.maxTokens,
    reasoning: nivel,
  };

  const debug = rotuloDebug(resolucao.modelo, nivel);
  // Visível só no log do servidor (homologação/produção interna).
  console.info("[nina-ai-gateway]", debug, "|", decisao.motivo);

  const resposta = await chamarModeloGemini(opcoes);
  return { ...resposta, modelo: resolucao.modelo, resolucao, nivel, debug };
}
