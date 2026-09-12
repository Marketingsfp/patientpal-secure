/**
 * GEMINI ADAPTER — único lugar que fala HTTP com o provedor do modelo.
 *
 * Provider: integração de IA do próprio Lovable (AI Gateway), já usada no
 * projeto. A chave `LOVABLE_API_KEY` é lida aqui, no servidor, dentro da
 * função — nunca no frontend, nunca em módulo carregado pelo navegador.
 *
 * Responsabilidades: chamada, configuração, tokens, erros, streaming e os
 * ganchos (ainda desligados) para reasoning e tools futuras.
 */

const ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type ChatMensagem = {
  role: string;
  content: string | null;
  tool_calls?: Array<{ id: string; function?: { name?: string; arguments?: string } }>;
  tool_call_id?: string;
};

export type OpcoesChamada = {
  modelo: string;
  messages: ChatMensagem[];
  tools?: readonly unknown[];
  maxTokens?: number;
  /** Fase 2: esforço de raciocínio decidido pelo Reasoning Router. */
  reasoning?: "none" | "low" | "medium" | "high";
  stream?: boolean;
};

export type RespostaChat = {
  ok: boolean;
  /** Texto final do modelo (vazio quando houve tool_calls ou erro). */
  conteudo: string;
  toolCalls: NonNullable<ChatMensagem["tool_calls"]>;
  /** HTTP status quando houve falha. */
  status?: number;
  /** Mensagem pronta para exibir ao usuário, em português. */
  erro?: string;
  uso?: { entrada?: number; saida?: number; total?: number };
};

/** Traduz o status do gateway na mensagem que a clínica vê. */
export function mensagemErroGateway(status: number): string {
  if (status === 429) return "Limite de uso atingido. Tente em alguns segundos.";
  if (status === 402) return "Créditos de IA esgotados. Adicione créditos no Workspace.";
  if (status === 401 || status === 403) return "Configuração de IA indisponível no momento.";
  return `Falha na resposta da Nina (${status})`;
}

/**
 * O provedor recusa requisição que termine em turno do modelo
 * ("Requests ending with a model turn are not supported.", HTTP 400). Como as
 * mensagens de sistema são reposicionadas antes do histórico, uma instrução
 * `system` colocada DEPOIS de um `assistant` deixa o pedido terminando no
 * turno do modelo. Aqui essa instrução final passa a ser um turno de quem
 * pede — mesmo conteúdo, mesma ordem, sem inventar texto.
 */
export function normalizarMensagensParaProvedor(mensagens: ChatMensagem[]): {
  mensagens: ChatMensagem[];
  ajuste: "nenhum" | "system_final_convertido" | "termina_em_assistant";
} {
  if (mensagens.length === 0) return { mensagens, ajuste: "nenhum" };
  const efetivas = mensagens.filter((m) => m.role !== "system");
  const ultimaEfetiva = efetivas[efetivas.length - 1];
  if (!ultimaEfetiva || ultimaEfetiva.role !== "assistant") {
    return { mensagens, ajuste: "nenhum" };
  }
  const ultima = mensagens[mensagens.length - 1]!;
  if (ultima.role === "system" && String(ultima.content ?? "").trim() !== "") {
    const copia = mensagens.slice(0, -1);
    copia.push({ ...ultima, role: "user" });
    return { mensagens: copia, ajuste: "system_final_convertido" };
  }
  return { mensagens, ajuste: "termina_em_assistant" };
}

/**
 * Chamada não-streaming. Sem timeout artificial de propósito: abortar a
 * geração não devolve o crédito e ainda perde a resposta.
 */
export async function chamarModeloGemini(opcoes: OpcoesChamada): Promise<RespostaChat> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) {
    return { ok: false, conteudo: "", toolCalls: [], erro: "LOVABLE_API_KEY ausente" };
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opcoes.modelo,
      // Fase 2: nível LOW/MEDIUM/HIGH escolhido pelo Reasoning Router.
      ...(opcoes.reasoning && opcoes.reasoning !== "none"
        ? { reasoning_effort: opcoes.reasoning }
        : {}),
      ...(opcoes.tools ? { tools: opcoes.tools } : {}),
      ...(opcoes.maxTokens ? { max_tokens: opcoes.maxTokens } : {}),
      messages: opcoes.messages,
    }),
  });

  if (!res.ok) {
    const corpo = await res.text().catch(() => "");
    console.error("[nina-ai-gateway] erro do provedor", opcoes.modelo, res.status, corpo.slice(0, 500));
    return {
      ok: false,
      conteudo: "",
      toolCalls: [],
      status: res.status,
      erro: mensagemErroGateway(res.status),
    };
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; tool_calls?: ChatMensagem["tool_calls"] } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const msg = json.choices?.[0]?.message;
  return {
    ok: true,
    conteudo: (msg?.content ?? "").trim(),
    toolCalls: msg?.tool_calls ?? [],
    uso: {
      entrada: json.usage?.prompt_tokens,
      saida: json.usage?.completion_tokens,
      total: json.usage?.total_tokens,
    },
  };
}

/**
 * Chamada em streaming: devolve a resposta HTTP crua para quem já sabe ler SSE
 * (a rota de voz da Nina). Mantida aqui para que também o streaming passe pelo
 * adapter, e não por `fetch` espalhado.
 */
export async function chamarModeloGeminiStream(
  opcoes: OpcoesChamada,
): Promise<{ ok: boolean; res?: Response; status?: number; erro?: string }> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return { ok: false, erro: "LOVABLE_API_KEY ausente" };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opcoes.modelo,
      stream: true,
      ...(opcoes.reasoning && opcoes.reasoning !== "none"
        ? { reasoning_effort: opcoes.reasoning }
        : {}),
      ...(opcoes.tools ? { tools: opcoes.tools } : {}),
      ...(opcoes.maxTokens ? { max_tokens: opcoes.maxTokens } : {}),
      messages: opcoes.messages,
    }),
  });

  if (!res.ok || !res.body) {
    return { ok: false, status: res.status, erro: mensagemErroGateway(res.status) };
  }
  return { ok: true, res };
}
