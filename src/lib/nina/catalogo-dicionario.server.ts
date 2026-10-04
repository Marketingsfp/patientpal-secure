import {
  MODELO_DICIONARIO,
  requisicaoDicionario,
  validarSugestoesDicionario,
  type ContextoDicionario,
} from "./catalogo-dicionario";

/** Aceita apenas a resposta concluída. Nunca aproveita JSON parcial ou recusas. */
export async function lerRespostaDicionario(res: Response): Promise<unknown> {
  if (!res.body) throw Error("O modelo não devolveu conteúdo.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    tamanho = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      tamanho += value?.byteLength ?? 0;
      if (tamanho > 1_000_000)
        throw Error("A resposta do dicionário excedeu o limite. Tente novamente.");
      const linhas = buffer.split("\n");
      buffer = done ? "" : (linhas.pop() ?? "");
      for (const linha of linhas) {
        if (!linha.startsWith("data:")) continue;
        const texto = linha.slice(5).trim();
        if (!texto || texto === "[DONE]") continue;
        const evento = JSON.parse(texto);
        if (["error", "response.failed", "response.incomplete"].includes(evento.type))
          throw Error("O modelo não concluiu a geração. As variações atuais foram preservadas.");
        if (evento.type !== "response.completed") continue;
        const resposta = evento.response;
        if (resposta?.status !== "completed") throw Error("Geração incompleta. Tente novamente.");
        const conteudos = (resposta.output ?? []).flatMap(
          (o: { content?: { type: string; text?: string }[] }) => o.content ?? [],
        );
        if (conteudos.some((c: { type: string }) => c.type === "refusal"))
          throw Error("O modelo não pôde sugerir variações para este cadastro.");
        const json =
          resposta.output_text ??
          conteudos
            .filter((c: { type: string }) => c.type === "output_text")
            .map((c: { text?: string }) => c.text ?? "")
            .join("");
        return JSON.parse(json);
      }
      if (done) break;
    }
    throw Error("A geração foi interrompida. Tente novamente; nada foi alterado.");
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function gerarDicionarioComIA(
  contexto: ContextoDicionario,
  deps: { fetch?: typeof fetch; chave?: string; timeoutMs?: number } = {},
) {
  const chave = deps.chave ?? process.env["LOVABLE_API_KEY"];
  if (!chave)
    throw Error("A IA não está configurada. Você pode preencher o dicionário manualmente.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(deps.timeoutMs ?? 120000, 120000));
  try {
    const res = await (deps.fetch ?? fetch)("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": chave,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify(requisicaoDicionario(contexto)),
    });
    if (!res.ok) {
      await res.body?.cancel();
      if (res.status === 402)
        throw Error("Sem créditos de IA. O dicionário manual continua disponível.");
      if (res.status === 429)
        throw Error("Muitas solicitações ao modelo. Aguarde e tente novamente.");
      throw Error(
        `GPT-6 Astra indisponível no provedor (${res.status}). Nenhum outro modelo foi usado; as variações atuais foram preservadas.`,
      );
    }
    return {
      ...validarSugestoesDicionario(await lerRespostaDicionario(res), contexto),
      modelo: MODELO_DICIONARIO,
    };
  } catch (erro) {
    if (controller.signal.aborted)
      throw Error("O modelo excedeu o tempo de geração. Tente novamente; nada foi alterado.");
    throw erro;
  } finally {
    clearTimeout(timer);
  }
}

// Limite local de custo/concorrência; o gateway mantém seu próprio limite global.
const pedidos = new Map<string, { inicio: number; ativo: boolean }>();
export async function comLimiteDicionario<T>(
  userId: string,
  executar: () => Promise<T>,
): Promise<T> {
  const agora = Date.now();
  for (const [id, p] of pedidos) if (!p.ativo && agora - p.inicio > 60000) pedidos.delete(id);
  const anterior = pedidos.get(userId);
  if (anterior && (anterior.ativo || agora - anterior.inicio < 5000))
    throw Error("Aguarde a geração anterior antes de tentar novamente.");
  pedidos.set(userId, { inicio: agora, ativo: true });
  try {
    return await executar();
  } finally {
    pedidos.set(userId, { inicio: Date.now(), ativo: false });
  }
}
