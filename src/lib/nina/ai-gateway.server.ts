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
import { classificarErro, decidirRetry, mensagemCategoria, type CategoriaErro } from "./erros";
import { motivoOperacional, rotuloHomologacao } from "./telemetria";
import type { KnowledgeStatus } from "./knowledge-contract";
import {
  selectThinkingLevel,
  nivelNaoRegride,
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
  /** Fase 5 — observabilidade. Id da conversa (WhatsApp, painel ou console de teste). */
  conversaId?: string | null;
  /** Situação da Base de Conhecimentos nesta etapa, quando já consultada. */
  knowledgeStatus?: KnowledgeStatus | null;
  /** Ferramentas já executadas neste turno (só os nomes). */
  ferramentasUsadas?: readonly string[];
  /** A etapa terminou em transferência para humano. */
  handoff?: boolean;
};

export type RespostaNina = RespostaChat & {
  modelo: string;
  resolucao: ResolucaoModelo;
  /** Nível efetivamente usado nesta etapa. */
  nivel: NivelRaciocinio;
  /** Etiqueta interna de homologação. NUNCA enviar ao paciente. */
  debug: string;
  /** Fase 5 — tempo total, tentativas e categoria de erro (quando houver). */
  latenciaMs: number;
  tentativas: number;
  categoriaErro: CategoriaErro | null;
  /** Id do registro técnico desta execução (auditoria). Null se não gravou. */
  execucaoId: string | null;
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

  const debug = rotuloHomologacao({
    model: resolucao.modelo,
    thinking_level: nivel,
    knowledge_status: pedido.knowledgeStatus ?? null,
    tool_calls: pedido.ferramentasUsadas ?? [],
  });
  const routeReason = motivoOperacional(decisao.motivo, nivel);
  // Só motivo operacional curto no log — nunca raciocínio do modelo.
  console.info("[nina-ai-gateway]", debug, "| route_reason:", routeReason);

  // ---- Chamada com política única de timeout/retry (Fase 5).
  const inicio = Date.now();
  let tentativa = 0;
  let resposta = await chamarModeloGemini(opcoes);
  let categoria: CategoriaErro | null = null;
  tentativa = 1;

  while (!resposta.ok) {
    categoria = classificarErro({ status: resposta.status ?? null, erro: resposta.erro, origem: "modelo" });
    const decisaoRetry = decidirRetry(categoria, tentativa);
    console.warn("[nina-ai-gateway] falha", categoria, "|", decisaoRetry.motivo);
    if (!decisaoRetry.repetir) break;
    await new Promise((r) => setTimeout(r, decisaoRetry.esperaMs));
    resposta = await chamarModeloGemini(opcoes);
    tentativa += 1;
    if (resposta.ok) categoria = null;
  }

  const latenciaMs = Date.now() - inicio;
  const retries = Math.max(0, tentativa - 1);

  // O id da execução é aguardado porque a mensagem enviada precisa apontar
  // para o registro técnico que a produziu (auditoria do reporte de erro).
  const execucaoId = await (async () => {
    const { registrarExecucao } = await import("./telemetria.server");
    return registrarExecucao({
      clinica_id: pedido.clinicaId,
      conversation_id: pedido.conversaId ?? null,
      perfil: pedido.perfil,
      model: resolucao.modelo,
      thinking_level: nivel,
      route_reason: routeReason,
      latency_ms: latenciaMs,
      knowledge_status: pedido.knowledgeStatus ?? null,
      tool_calls: [...(pedido.ferramentasUsadas ?? [])],
      success: resposta.ok,
      error_category: categoria,
      handoff: Boolean(pedido.handoff),
      input_tokens: resposta.uso?.entrada ?? null,
      output_tokens: resposta.uso?.saida ?? null,
      retries,
    });
  })();

  return {
    ...resposta,
    ...(resposta.ok ? {} : { erro: categoria ? mensagemCategoria(categoria) : resposta.erro }),
    modelo: resolucao.modelo,
    resolucao,
    nivel,
    debug,
    latenciaMs,
    tentativas: tentativa,
    categoriaErro: categoria,
    execucaoId,
  };
}
