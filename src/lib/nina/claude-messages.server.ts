/**
 * Ponte "formato Responses → Claude Messages" (somente servidor).
 *
 * Os recursos internos da Nina (avaliação, analista, análise de erro, catálogo
 * com IA, planejador de carga e executor de correção) foram escritos para a
 * Responses API. O Claude Opus 5.5 só é servido pelo endpoint nativo
 * `/v1/messages`. Esta função recebe o MESMO corpo que antes ia para
 * `/v1/responses`, traduz para Messages, consome o stream do Claude e devolve
 * uma `Response` no formato que os chamadores já leem:
 *  - `stream: true`  → SSE com `response.output_text.delta` e `response.completed`
 *  - `stream: false` → JSON `{ output_text, output, usage }`
 *
 * Recusa (`stop_reason: "refusal"`) e erros de stream viram evento `error`
 * (terminal; nunca é repetido automaticamente). Erros HTTP do gateway são
 * devolvidos com o mesmo status e corpo.
 */

const MESSAGES_URL = "https://ai.gateway.lovable.dev/v1/messages";
/** Opus 5.5 raciocina sempre; `max_tokens` cobre raciocínio + resposta. */
const MIN_MAX_TOKENS = 16000;
const EFFORT = "medium";

type Bloco = Record<string, any>;
type Mensagem = { role: "user" | "assistant"; content: Bloco[] };

function textoDeConteudo(content: unknown): Bloco[] {
  if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
  if (!Array.isArray(content)) return [];
  const blocos: Bloco[] = [];
  for (const c of content as any[]) {
    if (!c) continue;
    if (typeof c === "string") blocos.push({ type: "text", text: c });
    else if (typeof c.text === "string" && c.text) blocos.push({ type: "text", text: c.text });
  }
  return blocos;
}

function adicionar(msgs: Mensagem[], role: Mensagem["role"], blocos: Bloco[]) {
  if (!blocos.length) return;
  const ultima = msgs.at(-1);
  if (ultima && ultima.role === role) ultima.content.push(...blocos);
  else msgs.push({ role, content: [...blocos] });
}

/** Converte o `input` da Responses API em `messages` do Claude. */
export function converterInput(input: unknown): Mensagem[] {
  const msgs: Mensagem[] = [];
  if (typeof input === "string") {
    adicionar(msgs, "user", textoDeConteudo(input));
    return msgs;
  }
  const itens = Array.isArray(input) ? (input as any[]) : [];
  const chamadasJaIncluidas = new Set<string>();
  for (const item of itens) {
    if (!item) continue;
    if (item.type === "function_call") {
      if (chamadasJaIncluidas.has(item.call_id)) continue;
      if (Array.isArray(item.claude_content)) {
        // Conteúdo original do Claude (com assinaturas de raciocínio) reenviado
        // exatamente como veio, como a API exige nas idas e voltas de ferramenta.
        for (const b of item.claude_content)
          if (b?.type === "tool_use") chamadasJaIncluidas.add(b.id);
        adicionar(msgs, "assistant", item.claude_content);
        continue;
      }
      let entrada: unknown = {};
      try {
        entrada = JSON.parse(item.arguments || "{}");
      } catch {
        entrada = {};
      }
      adicionar(msgs, "assistant", [
        { type: "tool_use", id: item.call_id, name: item.name, input: entrada },
      ]);
      continue;
    }
    if (item.type === "function_call_output") {
      adicionar(msgs, "user", [
        {
          type: "tool_result",
          tool_use_id: item.call_id,
          content: typeof item.output === "string" ? item.output : JSON.stringify(item.output),
        },
      ]);
      continue;
    }
    if (item.type === "reasoning" || item.claude_skip) continue;
    const role = item.role === "assistant" ? "assistant" : "user";
    if (item.role === "system" || item.role === "developer") {
      adicionar(msgs, "user", textoDeConteudo(item.content));
      continue;
    }
    adicionar(msgs, role, textoDeConteudo(item.content));
  }
  return msgs;
}

/** Monta o corpo do `/v1/messages` a partir do corpo Responses. */
export function montarCorpoClaude(body: Record<string, any>): Record<string, any> {
  const corpo: Record<string, any> = {
    model: body.model,
    max_tokens: Math.max(Number(body.max_output_tokens) || 0, MIN_MAX_TOKENS),
    messages: converterInput(body.input),
    stream: true,
    thinking: { type: "adaptive" },
  };
  if (typeof body.instructions === "string" && body.instructions) corpo.system = body.instructions;
  const outputConfig: Record<string, any> = { effort: EFFORT };
  const formato = body.text?.format;
  if (formato?.type === "json_schema" && formato.schema) {
    outputConfig.format = { type: "json_schema", schema: formato.schema };
  }
  corpo.output_config = outputConfig;
  const tools = Array.isArray(body.tools) ? body.tools : [];
  if (tools.length) {
    corpo.tools = tools
      .filter((t: any) => t?.type === "function" || t?.name)
      .map((t: any) => ({
        name: t.name,
        description: t.description ?? "",
        input_schema: t.parameters ?? { type: "object", properties: {} },
      }));
    // Opus 5.5 só aceita `auto`.
    corpo.tool_choice = { type: "auto" };
  }
  return corpo;
}

/** Mesmo pedido, com o schema descrito nas instruções em vez de forçado. */
export function semFormatoEstruturado(corpo: Record<string, any>): Record<string, any> {
  const { format, ...restoConfig } = corpo.output_config ?? {};
  const regra =
    "\n\nFORMATO OBRIGATÓRIO DA RESPOSTA: devolva SOMENTE um objeto JSON válido (sem markdown, sem texto antes ou depois) que siga exatamente este JSON Schema:\n" +
    JSON.stringify(format?.schema ?? {});
  return { ...corpo, output_config: restoConfig, system: `${corpo.system ?? ""}${regra}` };
}

type Resultado = {
  texto: string;
  conteudo: Bloco[];
  chamadas: { call_id: string; name: string; arguments: string }[];
  inputTokens: number;
  outputTokens: number;
  recusa: boolean;
  erro: string | null;
};

/** Consome o SSE do Claude até `message_stop`. */
async function consumirStream(res: Response): Promise<Resultado> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const blocos: Bloco[] = [];
  const jsonParcial: Record<number, string> = {};
  const r: Resultado = {
    texto: "",
    conteudo: [],
    chamadas: [],
    inputTokens: 0,
    outputTokens: 0,
    recusa: false,
    erro: null,
  };

  const tratar = (ev: any) => {
    switch (ev?.type) {
      case "message_start":
        r.inputTokens =
          (ev.message?.usage?.input_tokens ?? 0) +
          (ev.message?.usage?.cache_read_input_tokens ?? 0) +
          (ev.message?.usage?.cache_creation_input_tokens ?? 0);
        r.outputTokens = ev.message?.usage?.output_tokens ?? 0;
        break;
      case "content_block_start":
        blocos[ev.index] = { ...(ev.content_block ?? {}) };
        if (blocos[ev.index].type === "tool_use") jsonParcial[ev.index] = "";
        break;
      case "content_block_delta": {
        const b = blocos[ev.index];
        const d = ev.delta ?? {};
        if (!b) break;
        if (d.type === "text_delta") {
          b.text = (b.text ?? "") + d.text;
          r.texto += d.text;
        } else if (d.type === "thinking_delta") b.thinking = (b.thinking ?? "") + d.thinking;
        else if (d.type === "signature_delta") b.signature = (b.signature ?? "") + d.signature;
        else if (d.type === "input_json_delta")
          jsonParcial[ev.index] = (jsonParcial[ev.index] ?? "") + d.partial_json;
        break;
      }
      case "content_block_stop": {
        const b = blocos[ev.index];
        if (b?.type === "tool_use") {
          const bruto = jsonParcial[ev.index] || "{}";
          try {
            b.input = JSON.parse(bruto);
          } catch {
            b.input = {};
          }
          r.chamadas.push({ call_id: b.id, name: b.name, arguments: JSON.stringify(b.input) });
        }
        break;
      }
      case "message_delta":
        if (ev.delta?.stop_reason === "refusal") r.recusa = true;
        if (typeof ev.usage?.output_tokens === "number") r.outputTokens = ev.usage.output_tokens;
        break;
      case "error":
        r.erro = ev.error?.message ?? "Falha do provedor durante a resposta.";
        break;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let fim: number;
    while ((fim = buffer.indexOf("\n\n")) >= 0) {
      const quadro = buffer.slice(0, fim);
      buffer = buffer.slice(fim + 2);
      for (const linha of quadro.split("\n")) {
        if (!linha.startsWith("data:")) continue;
        const bruto = linha.slice(5).trim();
        if (!bruto) continue;
        try {
          tratar(JSON.parse(bruto));
        } catch {
          /* quadro inválido: ignora */
        }
      }
    }
  }
  r.conteudo = blocos.filter(Boolean);
  const cercado = r.texto.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (cercado && !r.chamadas.length) r.texto = cercado[1]!;
  return r;
}

function saidaResponses(r: Resultado) {
  const output: any[] = [];
  if (r.recusa) {
    output.push({
      type: "message",
      role: "assistant",
      content: [{ type: "refusal", refusal: "O modelo recusou o pedido." }],
    });
  } else if (r.texto) {
    output.push({
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: r.texto }],
      // Com ferramentas, o texto já vai dentro de `claude_content`.
      ...(r.chamadas.length ? { claude_skip: true } : {}),
    });
  }
  r.chamadas.forEach((c, i) => {
    output.push({
      type: "function_call",
      call_id: c.call_id,
      name: c.name,
      arguments: c.arguments,
      // Só a primeira chamada carrega o conteúdo completo do Claude.
      ...(i === 0 ? { claude_content: r.conteudo } : {}),
    });
  });
  return {
    output_text: r.recusa ? "" : r.texto,
    output,
    usage: { input_tokens: r.inputTokens, output_tokens: r.outputTokens },
  };
}

/**
 * Substitui `fetch("…/v1/responses", { body })` por uma chamada ao Claude.
 * Recebe o corpo Responses já como objeto.
 */
export async function chamarClaudeComoResponses(
  body: Record<string, any>,
  opcoes: { signal?: AbortSignal } = {},
): Promise<Response> {
  const chave = process.env["LOVABLE_API_KEY"];
  if (!chave) return new Response("LOVABLE_API_KEY ausente", { status: 401 });

  const enviar = (corpo: Record<string, any>) =>
    fetch(MESSAGES_URL, {
      method: "POST",
      signal: opcoes.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${chave}`,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify(corpo),
    });

  const corpoClaude = montarCorpoClaude(body);
  let res = await enviar(corpoClaude);
  if (res.status === 400 && corpoClaude.output_config?.format) {
    const erro = await res.text().catch(() => "");
    // Alguns schemas herdados da Responses API usam recursos que o formato
    // estruturado do Claude não compila (muitas uniões, enum com null).
    // Reparo único: pede o mesmo JSON pelas instruções, sem o formato forçado.
    if (/schema|union|output_config/i.test(erro)) {
      console.warn("[claude-messages] schema recusado; usando JSON pelas instruções:", erro.slice(0, 200));
      res = await enviar(semFormatoEstruturado(corpoClaude));
    } else {
      return new Response(erro, { status: 400 });
    }
  }
  if (!res.ok || !res.body) {
    const corpo = await res.text().catch(() => "");
    return new Response(corpo, { status: res.ok ? 502 : res.status });
  }

  const r = await consumirStream(res);
  const final = saidaResponses(r);

  if (body.stream === false) {
    if (r.erro) return new Response(JSON.stringify({ error: { message: r.erro } }), { status: 502 });
    return new Response(JSON.stringify(final), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const eventos: any[] = [];
  if (r.erro) eventos.push({ type: "error", error: { message: r.erro } });
  else if (r.recusa)
    eventos.push({ type: "error", error: { message: "O modelo recusou o pedido." } });
  else {
    if (r.texto) eventos.push({ type: "response.output_text.delta", delta: r.texto });
    eventos.push({ type: "response.completed", response: final });
  }
  const sse = eventos.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(sse, { headers: { "Content-Type": "text/event-stream" } });
}
