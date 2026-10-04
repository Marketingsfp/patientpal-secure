import {
  MODELO_DICIONARIO,
  LIMITE_CHAMADAS_WEB,
  LIMITE_VARIACOES,
  requisicaoDicionario,
  validarSugestoesDicionario,
  type ContextoDicionario,
  type PesquisaDicionario,
  type ResultadoDicionario,
} from "./catalogo-dicionario";

type ItemResposta = {
  type?: string;
  status?: string;
  action?: { type?: string; sources?: { url?: unknown; title?: unknown }[] };
  content?: {
    type: string;
    text?: string;
    annotations?: { type?: string; url?: unknown; title?: unknown }[];
  }[];
};

function urlPublica(valor: unknown): string | null {
  if (typeof valor !== "string" || valor.length > 2000) return null;
  try {
    const url = new URL(valor);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Somente eventos da ferramenta comprovam pesquisa; URLs escritas pelo modelo não bastam. */
function evidenciaPesquisa(output: ItemResposta[]): PesquisaDicionario {
  const chamadas = output.filter((o) => o.type === "web_search_call");
  if (!chamadas.some((o) => o.status === "completed" && o.action?.type === "search"))
    throw Error(
      "O provedor não confirmou a pesquisa na web. Verifique o suporte a web_search no Lovable; nenhuma sugestão foi aplicada.",
    );
  if (chamadas.length > LIMITE_CHAMADAS_WEB)
    throw Error("O provedor excedeu o limite de pesquisa. Nenhuma sugestão foi aplicada.");
  const fontes = new Map<string, { url: string; titulo: string }>();
  const adicionar = (fonte: { url?: unknown; title?: unknown }) => {
    const url = urlPublica(fonte.url);
    if (url && !fontes.has(url))
      fontes.set(url, {
        url,
        titulo: typeof fonte.title === "string" ? fonte.title.slice(0, 300) : new URL(url).hostname,
      });
  };
  for (const chamada of chamadas.filter((o) => o.status === "completed"))
    for (const fonte of chamada.action?.sources ?? []) adicionar(fonte);
  for (const item of output)
    for (const conteudo of item.content ?? [])
      for (const anotacao of conteudo.annotations ?? [])
        if (anotacao.type === "url_citation") adicionar(anotacao);
  if (!fontes.size)
    throw Error(
      "A pesquisa terminou sem fontes verificáveis no retorno do provedor. Tente novamente; nenhuma sugestão foi aplicada.",
    );
  return { chamadas: chamadas.length, fontes: [...fontes.values()] };
}

/** Aceita apenas a resposta concluída. Nunca aproveita JSON parcial ou recusas. */
export async function lerRespostaDicionario(
  res: Response,
): Promise<{ conteudo: unknown; pesquisa: PesquisaDicionario }> {
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
        const output: ItemResposta[] = resposta.output ?? [];
        const conteudos = output.flatMap((o) => o.content ?? []);
        if (conteudos.some((c: { type: string }) => c.type === "refusal"))
          throw Error("O modelo não pôde sugerir variações para este cadastro.");
        const json =
          resposta.output_text ??
          conteudos
            .filter((c: { type: string }) => c.type === "output_text")
            .map((c: { text?: string }) => c.text ?? "")
            .join("");
        return { conteudo: JSON.parse(json), pesquisa: evidenciaPesquisa(output) };
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
): Promise<ResultadoDicionario> {
  if (contexto.aliases.length >= LIMITE_VARIACOES)
    throw Error(
      "O cadastro já possui 50 variações. Revise a lista antes de gerar novas sugestões.",
    );
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
      if ([400, 422].includes(res.status))
        throw Error(
          "O provedor não aceitou a geração com pesquisa web. Verifique o suporte a web_search com GPT-6 Astra no Lovable. O dicionário atual foi preservado.",
        );
      throw Error(
        `GPT-6 Astra indisponível no provedor (${res.status}). Nenhum outro modelo foi usado; as variações atuais foram preservadas.`,
      );
    }
    const { conteudo, pesquisa } = await lerRespostaDicionario(res);
    const sugestoes = validarSugestoesDicionario(conteudo, contexto);
    const urlsConsultadas = new Set(pesquisa.fontes.map((f) => f.url));
    const duvidas = [...sugestoes.duvidas];
    const variacoes = sugestoes.variacoes.flatMap((v) => {
      const fontes = [
        ...new Set(
          v.fontes.map(urlPublica).filter((u): u is string => Boolean(u && urlsConsultadas.has(u))),
        ),
      ];
      const exigeFonte = v.origem === "web" || ["sigla", "sinonimo"].includes(v.categoria);
      if (exigeFonte && (v.origem !== "web" || !fontes.length)) {
        duvidas.push(
          `“${v.termo}”: não foi retornada uma fonte consultada que sustente esta sugestão. Confirme antes de cadastrar.`,
        );
        return [];
      }
      return [{ ...v, fontes: v.origem === "web" ? fontes : [] }];
    });
    return { variacoes, duvidas, pesquisa, modelo: MODELO_DICIONARIO };
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
