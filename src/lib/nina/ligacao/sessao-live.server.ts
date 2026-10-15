/**
 * ÚNICO ponto de contato com o modelo de voz (GPT-Live 1) pelo gateway de IA
 * da Lovable. Intermediário da ligação, aberto em `/api/nina-ligacao`:
 *
 * navegador ⇄ (WebSocket) servidor ⇄ (WebSocket) gateway; o áudio vai direto
 * por WebRTC entre o navegador e a voz.
 *
 * - O navegador manda só a oferta SDP, o token de login, a clínica, a voz, o
 *   "estou vivo" (`gateway.heartbeat`) e o pedido de encerrar.
 * - A delegação é do tipo "client": quando a voz pede ajuda
 *   (`session.delegation.created`), este servidor chama o modelo de apoio com
 *   as instruções da Nina e as ferramentas da ligação, executa as ferramentas
 *   com `executarFerramentaLigacao` e devolve a resposta com
 *   `session.commentary.append`.
 *
 * SEGURANÇA: `.server.ts` — a LOVABLE_API_KEY só é lida aqui. Nada de áudio é
 * gravado e nem falas nem instruções vão para log.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { jsonSchema, stepCountIs, streamText, tool, type ModelMessage, type ToolSet } from "ai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { MODULO_LIGACAO, VOZES_LIGACAO, VOZ_PADRAO_LIGACAO, type VozLigacao } from "./config";
import { ROTULOS_FERRAMENTAS } from "./eventos-ligacao";

export const GATEWAY_LIVE = "https://ai.gateway.lovable.dev/v1";
export const ENDPOINT_SESSAO_LIVE = `${GATEWAY_LIVE}/live/sessions`;
export const MODELO_VOZ_LIGACAO = "openai/gpt-live-1";
/** Modelo de apoio que recebe as instruções da Nina e chama as ferramentas. */
export const MODELO_APOIO_LIGACAO = "openai/gpt-6-astra";
export const ROTA_LIGACAO = "/api/nina-ligacao";

type FerramentaChat = {
  type: "function";
  function: { name: string; description?: string; parameters?: unknown };
};

export type SocketLigacao = {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onMessage(handler: (data: unknown) => void): void;
  onClose(handler: () => void): void;
  onError(handler: () => void): void;
};
export type ContextoExecucao = { waitUntil(task: Promise<unknown>): void };
export type ConectorGateway = (
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
) => Promise<SocketLigacao>;

type WorkerSocket = WebSocket & { accept(): void };
declare const WebSocketPair: { new (): { 0: WorkerSocket; 1: WorkerSocket } };

type EventoVoz = {
  type: string;
  client_event_id?: string;
  error?: { client_event_id?: string; message?: string };
  session?: { id: string };
  delta?: string;
  delegation?: { id: string; target: string };
};

type Sessao = {
  instrucoesVoz: string;
  instrucoesApoio: string;
  ferramentas: readonly FerramentaChat[];
};

function chave() {
  const k = process.env["LOVABLE_API_KEY"];
  if (!k) throw new Error("A voz não está configurada neste projeto.");
  return k;
}

async function recusaGateway(resposta: Response) {
  const corpo = (await resposta.json().catch(() => null)) as { message?: unknown } | null;
  const msg = typeof corpo?.message === "string" ? corpo.message.slice(0, 300) : "";
  return new Error(msg || `O serviço de voz recusou a conexão (${resposta.status}).`);
}

export function validarUpgrade(request: Request, o: { aceitarSemOrigem?: boolean } = {}) {
  const origem = request.headers.get("origin");
  if (origem === null ? !o.aceitarSemOrigem : origem !== new URL(request.url).origin)
    return new Response("Origem recusada", { status: 403 });
  if (request.method !== "GET" || request.headers.get("upgrade")?.toLowerCase() !== "websocket")
    return new Response("WebSocket necessário", { status: 426 });
  return null;
}

function socketWorker(s: WorkerSocket): SocketLigacao {
  return {
    get readyState() {
      return s.readyState;
    },
    send: (d) => s.send(d),
    close: (c, r) => s.close(c, r),
    onMessage: (h) => s.addEventListener("message", (e) => h(e.data)),
    onClose: (h) => s.addEventListener("close", h),
    onError: (h) => s.addEventListener("error", h),
  };
}

/** Entrada publicada (Cloudflare): chamada por `src/server.ts`. */
export function tratarLigacaoRequest(request: Request): Response {
  const waitUntil = (request as Request & Partial<ContextoExecucao>).waitUntil;
  if (!waitUntil) return new Response("Ligação indisponível", { status: 503 });
  const recusa = validarUpgrade(request);
  if (recusa) return recusa;
  const par = new WebSocketPair();
  par[1].accept();
  ligarSessao(socketWorker(par[1]), { waitUntil }, async (url, headers, signal) => {
    const r = await fetch(url, { headers: { ...headers, Upgrade: "websocket" }, signal });
    const s = (r as Response & { webSocket?: WorkerSocket | null }).webSocket;
    if (!s) throw await recusaGateway(r);
    s.accept();
    return socketWorker(s);
  });
  return new Response(null, { status: 101, webSocket: par[0] } as ResponseInit & {
    webSocket: WebSocket;
  });
}

/** Mesma checagem das funções de servidor: login, permissão de escrita e flag. */
async function autorizar(token: string, clinicaId: string) {
  const url = process.env["SUPABASE_URL"];
  const pub = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !pub) throw new Error("Configuração indisponível.");
  const supabase = createClient<Database>(url, pub, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) throw new Error("Entre novamente para ligar.");
  const [{ carregarAcessosOsZap }, { flagLigacaoAtiva }] = await Promise.all([
    import("@/lib/permissoes-oszap.server"),
    import("./flag.server"),
  ]);
  const acessos = await carregarAcessosOsZap(supabase, userId, clinicaId);
  if (acessos[MODULO_LIGACAO] !== "write")
    throw new Error("Sem permissão para a ligação de demonstração.");
  if (!(await flagLigacaoAtiva(clinicaId)))
    throw new Error("A ligação de demonstração não está ativa nesta clínica.");
}

function* pedacos(texto: string) {
  const enc = new TextEncoder();
  let atual = "";
  let bytes = 0;
  for (const ch of texto) {
    const t = enc.encode(ch).length;
    if (bytes + t > 480) {
      yield atual;
      atual = "";
      bytes = 0;
    }
    atual += ch;
    bytes += t;
  }
  if (atual) yield atual;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ligarSessao(
  navegador: SocketLigacao,
  execucao: ContextoExecucao,
  conectar: ConectorGateway,
): void {
  const runId = crypto.randomUUID();
  const abortoInicio = new AbortController();
  let gateway: SocketLigacao | undefined;
  let sessaoId: string | undefined;
  let clinicaId = "";
  let sessao: Sessao | undefined;
  let iniciando = false;
  let fechando = false;
  let terminado = false;
  let pronto = false;
  let saudou = false;
  let revisao = 0;
  let tarefa: AbortController | undefined;
  let terminarDreno: (() => void) | undefined;
  let tFechar: ReturnType<typeof setTimeout> | undefined;
  let tInicio: ReturnType<typeof setTimeout> | undefined;
  let tRetomar: ReturnType<typeof setTimeout> | undefined;
  const tPrimeira = setTimeout(() => {
    emitir({ type: "app.error", error: { message: "A ligação não começou a tempo." } });
    parar();
  }, 15_000);
  const falas: { role: "user" | "assistant"; text: string }[] = [];
  let cursor = 0;
  const historico: ModelMessage[] = [];
  const pendentes: string[] = [];
  const vistas = new Set<string>();

  function emitir(e: object) {
    if (navegador.readyState !== 1) return;
    try {
      navegador.send(JSON.stringify(e));
    } catch {
      parar();
    }
  }
  function fechar(s?: SocketLigacao) {
    if (!s || s.readyState === 3) return;
    try {
      s.close(1000, "Ligação encerrada");
    } catch {
      /* já fechado */
    }
  }
  function enviarGateway(e: object) {
    if (gateway?.readyState !== 1) return parar();
    gateway.send(JSON.stringify(e));
  }
  function terminar() {
    if (terminado) return;
    terminado = fechando = true;
    [tPrimeira, tFechar, tInicio, tRetomar].forEach((t) => clearTimeout(t));
    pendentes.length = 0;
    tarefa?.abort();
    abortoInicio.abort();
    fechar(gateway);
    fechar(navegador);
    terminarDreno?.();
  }
  function parar() {
    if (fechando) return;
    fechando = true;
    pendentes.length = 0;
    tarefa?.abort();
    [tPrimeira, tInicio, tRetomar].forEach((t) => clearTimeout(t));
    if (gateway?.readyState === 1) {
      execucao.waitUntil(new Promise<void>((r) => (terminarDreno = r)));
      tFechar = setTimeout(terminar, 15_000);
      try {
        gateway.send(JSON.stringify({ type: "session.close" }));
      } catch {
        terminar();
      }
    } else terminar();
  }

  function saudar() {
    if (!pronto || !sessaoId || saudou || fechando) return;
    saudou = true;
    enviarGateway({
      type: "session.commentary.append",
      event_id: crypto.randomUUID(),
      delegation_id: null,
      content:
        "Comece a ligação agora, em português do Brasil: apresente-se como manda a instrução e pergunte como pode ajudar.",
    });
  }

  function ferramentasDoApoio(sinal: AbortSignal): ToolSet {
    const set: ToolSet = {};
    for (const f of sessao?.ferramentas ?? []) {
      const nome = f.function.name;
      set[nome] = tool({
        description: f.function.description ?? "",
        inputSchema: jsonSchema(
          (f.function.parameters as Record<string, unknown>) ?? {
            type: "object",
            properties: {},
          },
        ),
        execute: async (args: unknown) => {
          sinal.throwIfAborted();
          const { executarFerramentaLigacao } = await import("./ferramentas-ligacao.server");
          try {
            const r = await executarFerramentaLigacao(clinicaId, nome, JSON.stringify(args ?? {}));
            emitir({
              type: "app.ferramenta",
              nome,
              rotulo: ROTULOS_FERRAMENTAS[nome] ?? nome,
              encaminhamento: r.encaminhamento,
            });
            return JSON.parse(r.saida) as unknown;
          } catch {
            emitir({ type: "app.ferramenta", nome, rotulo: ROTULOS_FERRAMENTAS[nome] ?? nome, falhou: true });
            return { ok: false, erro: "INTERNAL_ERROR", mensagem: "Falha ao consultar." };
          }
        },
      });
    }
    return set;
  }

  async function responder(delegacaoId: string, sinal: AbortSignal, consumir: () => void) {
    const k = chave();
    const provedor = createOpenAI({
      baseURL: GATEWAY_LIVE,
      apiKey: k,
      headers: { "Lovable-API-Key": k, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });
    let cursorResp = 0;
    consumir();
    const r = streamText({
      model: provedor.responses(MODELO_APOIO_LIGACAO),
      abortSignal: sinal,
      maxRetries: 0,
      stopWhen: stepCountIs(20),
      includeRawChunks: true,
      prepareStep() {
        consumir();
        return { messages: [...historico] };
      },
      onStepFinish(step) {
        historico.push(...step.response.messages.slice(cursorResp));
        cursorResp = step.response.messages.length;
      },
      headers: {
        "X-Lovable-AIG-Run-ID": runId,
        "X-Lovable-AIG-Metadata": JSON.stringify({
          live_session_id: sessaoId,
          delegation_id: delegacaoId,
        }),
      },
      providerOptions: {
        openai: {
          store: false,
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          include: ["reasoning.encrypted_content"],
        },
      },
      system:
        (sessao?.instrucoesApoio ?? "") +
        "\n\n# Canal de voz\nVocê apoia a voz da Nina numa ligação. As falas chegam transcritas e podem vir incompletas ou corrigidas; vale a correção mais recente. Use as ferramentas antes de afirmar qualquer dado. Responda só com o que a Nina deve dizer agora, curto, falado, sem listas, links nem formatação.",
      messages: historico,
      tools: ferramentasDoApoio(sinal),
    });
    let concluiu = false;
    let passoOk = false;
    let falhou = false;
    for await (const p of r.fullStream) {
      if (p.type === "start-step") passoOk = false;
      if (p.type === "raw" && p.rawValue && typeof p.rawValue === "object" && "type" in p.rawValue) {
        const t = (p.rawValue as { type: unknown }).type;
        if (t === "response.completed") passoOk = true;
        if (t === "response.failed" || t === "response.incomplete") falhou = true;
      }
      if (p.type === "finish-step" && !passoOk) falhou = true;
      if (p.type === "error" || p.type === "abort") falhou = true;
      if (p.type === "finish") concluiu = p.finishReason === "stop";
    }
    sinal.throwIfAborted();
    if (falhou || !concluiu) throw new Error("incompleta");
    const texto = (await r.text).trim();
    if (!texto) throw new Error("vazia");
    return texto;
  }

  function agendar() {
    clearTimeout(tRetomar);
    if (fechando || tarefa || pendentes.length === 0) return;
    tRetomar = setTimeout(() => void executar(), 300);
  }

  async function executar() {
    const id = pendentes[0];
    if (!id || fechando || tarefa) return;
    if (!falas.some((f) => f.role === "user" && f.text.trim())) return;
    const ctrl = new AbortController();
    tarefa = ctrl;
    let rev = revisao;
    let resposta: string;
    try {
      resposta = await responder(id, ctrl.signal, () => {
        historico.push(...falas.slice(cursor).map((f) => ({ role: f.role, content: f.text })));
        cursor = falas.length;
        rev = revisao;
      });
    } catch {
      if (fechando || ctrl.signal.aborted) return;
      resposta = "Não consegui consultar agora. Pergunte se o paciente quer tentar de novo.";
    } finally {
      if (tarefa === ctrl) tarefa = undefined;
    }
    if (!fechando && rev === revisao) {
      try {
        for (const content of pedacos(resposta))
          enviarGateway({
            type: "session.commentary.append",
            event_id: crypto.randomUUID(),
            delegation_id: id,
            content,
          });
        pendentes.shift();
      } catch {
        parar();
      }
    }
    agendar();
  }

  function doGateway(data: unknown) {
    try {
      if (typeof data !== "string" || data.length > 1024 * 1024) throw new Error();
      const e = JSON.parse(data) as EventoVoz;
      if (navegador.readyState === 1) navegador.send(data);
      if (e.type === "session.closed") return terminar();
      if (["gateway.session.closing", "gateway.error", "app.error"].includes(e.type)) return parar();
      if (fechando) return;
      if (e.type === "gateway.session.created") {
        sessaoId = e.session?.id;
        clearTimeout(tInicio);
        saudar();
      } else if (
        e.type === "session.input_transcript.delta" ||
        e.type === "session.output_transcript.delta"
      ) {
        if (!e.delta?.trim()) return;
        const role = e.type === "session.input_transcript.delta" ? "user" : "assistant";
        falas.push({ role, text: e.delta });
        if (role === "user") revisao++;
        agendar();
      } else if (e.type === "session.delegation.created") {
        const id = e.delegation?.id;
        if (id && e.delegation?.target === "client" && !vistas.has(id)) {
          vistas.add(id);
          pendentes.push(id);
          emitir({ type: "app.delegacao.pendente", delegation_id: id });
          agendar();
        }
      }
    } catch {
      emitir({ type: "app.error", error: { message: "A conexão de voz caiu." } });
      parar();
    }
  }

  async function iniciar(sdp: string, voz: VozLigacao) {
    tInicio = setTimeout(() => {
      emitir({ type: "app.error", error: { message: "A voz demorou para responder." } });
      parar();
    }, 40_000);
    const { montarSessaoLigacao } = await import("./contrato-ligacao.server");
    const s = await montarSessaoLigacao(clinicaId);
    sessao = s;
    const k = chave();
    const aceito = await conectar(
      ENDPOINT_SESSAO_LIVE,
      { "Lovable-API-Key": k, "X-Lovable-AIG-SDK": "fetch", "X-Lovable-AIG-Run-ID": runId },
      abortoInicio.signal,
    );
    if (fechando || navegador.readyState !== 1) return fechar(aceito);
    gateway = aceito;
    gateway.onMessage(doGateway);
    gateway.onClose(terminar);
    gateway.onError(() => {
      emitir({ type: "app.error", error: { message: "Falha na conexão de voz." } });
      parar();
    });
    gateway.send(
      JSON.stringify({
        type: "session.start",
        session: {
          model: MODELO_VOZ_LIGACAO,
          instructions: s.instrucoesVoz,
          audio: { output: { voice: voz } },
          // Sem gravação do áudio da ligação (LGPD).
          store: false,
          delegation: { type: "client" },
        },
        transport: { type: "webrtc", sdp },
      }),
    );
  }

  navegador.onMessage((data) => {
    try {
      if (typeof data !== "string" || data.length > 64 * 1024) throw new Error();
      const e = JSON.parse(data) as Record<string, unknown>;
      if (e.type === "session.close") return parar();
      if (fechando) return;
      if (!gateway) {
        if (iniciando || e.type !== "app.start") throw new Error();
        const sdp = typeof e.sdp === "string" ? e.sdp : "";
        const token = typeof e.token === "string" ? e.token : "";
        const cid = typeof e.clinicaId === "string" ? e.clinicaId : "";
        const voz = (VOZES_LIGACAO as readonly string[]).includes(String(e.voz))
          ? (e.voz as VozLigacao)
          : VOZ_PADRAO_LIGACAO;
        if (!sdp.trim() || sdp.length > 20_000 || !token || !UUID.test(cid)) throw new Error();
        iniciando = true;
        clinicaId = cid;
        clearTimeout(tPrimeira);
        execucao.waitUntil(
          autorizar(token, cid)
            .then(() => iniciar(sdp, voz))
            .catch((erro: unknown) => {
              if (!fechando)
                emitir({
                  type: "app.error",
                  error: {
                    message: erro instanceof Error ? erro.message : "Não foi possível ligar agora.",
                  },
                });
              parar();
            }),
        );
        return;
      }
      if (e.type === "app.ready") {
        pronto = true;
        return saudar();
      }
      if (e.type !== "gateway.heartbeat") throw new Error();
      if (gateway.readyState !== 1) return parar();
      gateway.send(data);
    } catch {
      emitir({ type: "app.error", error: { message: "Não foi possível continuar a ligação." } });
      parar();
    }
  });
  navegador.onClose(parar);
  navegador.onError(parar);
}
