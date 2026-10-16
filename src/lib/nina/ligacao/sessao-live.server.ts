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
import { LIMITE_RODADAS_COMUM } from "../eficiencia-turno";

export const GATEWAY_LIVE = "https://ai.gateway.lovable.dev/v1";
export const ENDPOINT_SESSAO_LIVE = `${GATEWAY_LIVE}/live/sessions`;
export const MODELO_VOZ_LIGACAO = "openai/gpt-live-1";
/**
 * Modelo de apoio que recebe as instruções da Nina e chama as ferramentas, pela
 * API Responses do gateway (formato validado na primeira ligação). O
 * `gpt-6-astra` levava de 8 a 14 s por passo; o `gpt-5.6-luna`, já usado no
 * projeto pela mesma API, é o menor da família. O modelo do chat (Gemini) não
 * serve por aqui: a biblioteca descarta campos que ele exige nas chamadas de
 * ferramenta (16/10/2026, a Nina não conseguia consultar o catálogo).
 */
export const MODELO_APOIO_LIGACAO = "openai/gpt-5.6-luna";
/** Reserva: se o principal falhar, a mesma resposta é refeita com o da primeira ligação. */
export const MODELO_APOIO_RESERVA = "openai/gpt-6-astra";
export const MODELOS_APOIO_LIGACAO = [MODELO_APOIO_LIGACAO, MODELO_APOIO_RESERVA] as const;
/** Mesmo limite de rodadas de ferramenta por resposta do chat. */
export const LIMITE_PASSOS_LIGACAO = LIMITE_RODADAS_COMUM;
/** Consultas iguais na mesma ligação reaproveitam o resultado por este tempo. */
export const VALIDADE_CACHE_FERRAMENTA_MS = 60_000;
/** Espera o paciente parar de falar antes de chamar o modelo de apoio. */
export const ESPERA_FIM_DA_FALA_MS = 800;

/**
 * As falas finais da voz ("Só um instante, vou verificar") não vão no pedido:
 * o modelo deve responder à última fala do paciente, e alguns provedores
 * recusam pedido que termina no turno do assistente (o chat trata o mesmo caso
 * em `normalizarMensagensParaProvedor`). Turnos com chamada de ferramenta ficam.
 */
export function semTurnoFinalDoAssistente(mensagens: readonly ModelMessage[]): ModelMessage[] {
  const copia = [...mensagens];
  while (copia.length > 0) {
    const ultima = copia[copia.length - 1]!;
    const chamaFerramenta =
      Array.isArray(ultima.content) &&
      (ultima.content as { type?: string }[]).some((p) => p.type === "tool-call");
    if (ultima.role !== "assistant" || chamaFerramenta) break;
    copia.pop();
  }
  return copia;
}

/** Código de erro para log, sem conteúdo da conversa nem das instruções. */
export function codigoDoErro(erro: unknown): string {
  const e = erro as { statusCode?: unknown; name?: unknown } | null;
  if (typeof e?.statusCode === "number") return `HTTP ${e.statusCode}`;
  return typeof e?.name === "string" ? e.name : "desconhecido";
}

/**
 * Junta o trecho transcrito à última fala da mesma pessoa. Fala de índice
 * menor que `jaEnviadas` já foi para o modelo: o trecho abre uma fala nova
 * para não se perder.
 */
export function juntarFala(
  falas: { role: "user" | "assistant"; text: string }[],
  role: "user" | "assistant",
  delta: string,
  jaEnviadas = 0,
): void {
  const ultima = falas[falas.length - 1];
  if (ultima && ultima.role === role && falas.length - 1 >= jaEnviadas) ultima.text += delta;
  else falas.push({ role, text: delta });
}
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

/** Corpo do `session.start` (voz, instruções da voz, delegação "client", oferta WebRTC). */
export function corpoInicioSessao(instrucoesVoz: string, voz: VozLigacao, sdp: string) {
  return {
    type: "session.start",
    session: {
      model: MODELO_VOZ_LIGACAO,
      instructions: instrucoesVoz,
      audio: { output: { voice: voz } },
      // Sem gravação do áudio da ligação (LGPD).
      store: false,
      delegation: { type: "client" as const },
    },
    transport: { type: "webrtc" as const, sdp },
  };
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
  const cacheFerramentas = new Map<string, { em: number; resultado: unknown }>();

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
          const argumentos = JSON.stringify(args ?? {});
          const chaveCache = `${nome}:${argumentos}`;
          const guardado = cacheFerramentas.get(chaveCache);
          if (guardado && Date.now() - guardado.em < VALIDADE_CACHE_FERRAMENTA_MS)
            return guardado.resultado;
          const { executarFerramentaLigacao } = await import("./ferramentas-ligacao.server");
          try {
            const r = await executarFerramentaLigacao(clinicaId, nome, argumentos);
            const resultado = JSON.parse(r.saida) as unknown;
            // Leituras repetidas na mesma ligação não voltam ao banco (4 a 5 s cada).
            if (!r.simulado) cacheFerramentas.set(chaveCache, { em: Date.now(), resultado });
            emitir({
              type: "app.ferramenta",
              nome,
              rotulo: ROTULOS_FERRAMENTAS[nome] ?? nome,
              encaminhamento: r.encaminhamento,
            });
            return resultado;
          } catch {
            emitir({
              type: "app.ferramenta",
              nome,
              rotulo: ROTULOS_FERRAMENTAS[nome] ?? nome,
              falhou: true,
            });
            return { ok: false, erro: "INTERNAL_ERROR", mensagem: "Falha ao consultar." };
          }
        },
      });
    }
    return set;
  }

  async function responder(
    delegacaoId: string,
    sinal: AbortSignal,
    consumir: () => void,
    modelo: string,
  ) {
    const k = chave();
    const provedor = createOpenAI({
      baseURL: GATEWAY_LIVE,
      apiKey: k,
      headers: { "Lovable-API-Key": k, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });
    let cursorResp = 0;
    consumir();
    const r = streamText({
      model: provedor.responses(modelo),
      abortSignal: sinal,
      maxRetries: 0,
      stopWhen: stepCountIs(LIMITE_PASSOS_LIGACAO),
      prepareStep() {
        consumir();
        return { messages: semTurnoFinalDoAssistente(historico) };
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
      // Mesmas opções da primeira ligação, que consultou o catálogo; raciocínio baixo.
      providerOptions: {
        openai: {
          store: false,
          forceReasoning: true,
          reasoningEffort: "low",
          include: ["reasoning.encrypted_content"],
        },
      },
      system:
        (sessao?.instrucoesApoio ?? "") +
        "\n\n# Canal de voz\nVocê apoia a voz da Nina numa ligação. As falas chegam transcritas e podem vir incompletas ou corrigidas; vale a correção mais recente. Use as ferramentas antes de afirmar qualquer dado, mas antes de chamar uma ferramenta veja se o resultado já está nesta ligação: não repita a mesma consulta. Responda só com o que a Nina deve dizer agora, curto, falado, sem listas, links nem formatação.",
      messages: semTurnoFinalDoAssistente(historico),
      tools: ferramentasDoApoio(sinal),
    });
    let falha: unknown = null;
    for await (const p of r.fullStream) {
      if (p.type === "error") falha = p.error ?? new Error("erro no modelo de apoio");
      if (p.type === "abort") falha = new Error("abortada");
    }
    sinal.throwIfAborted();
    if (falha) throw falha;
    // Ao atingir o limite de rodadas sem texto final, cai na mensagem de falha abaixo.
    const texto = (await r.text).trim();
    if (!texto) throw new Error("vazia");
    return texto;
  }

  function agendar() {
    clearTimeout(tRetomar);
    if (fechando || tarefa || pendentes.length === 0) return;
    // Cada trecho novo da fala do paciente reinicia a espera.
    tRetomar = setTimeout(() => void executar(), ESPERA_FIM_DA_FALA_MS);
  }

  async function executar() {
    const id = pendentes[0];
    if (!id || fechando || tarefa) return;
    if (!falas.some((f) => f.role === "user" && f.text.trim())) return;
    const ctrl = new AbortController();
    tarefa = ctrl;
    const consumir = () => {
      historico.push(...falas.slice(cursor).map((f) => ({ role: f.role, content: f.text })));
      cursor = falas.length;
    };
    let resposta = "Não consegui consultar agora. Pergunte se o paciente quer tentar de novo.";
    try {
      for (const modelo of MODELOS_APOIO_LIGACAO) {
        consumir();
        // Uma tentativa que falhou não deixa passos pela metade no histórico.
        const inicio = historico.length;
        try {
          resposta = await responder(id, ctrl.signal, consumir, modelo);
          break;
        } catch (erro) {
          if (fechando || ctrl.signal.aborted) return;
          historico.length = inicio;
          // Só o código do erro: a mensagem do provedor pode repetir o pedido.
          console.error("[nina-ligacao] modelo de apoio falhou", modelo, codigoDoErro(erro));
        }
      }
    } finally {
      if (tarefa === ctrl) tarefa = undefined;
    }
    // A resposta é entregue mesmo que o paciente tenha continuado a falar:
    // descartá-la fazia a Nina buscar de novo e não responder. A fala nova
    // segue na próxima delegação.
    if (!fechando) {
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
      if (["gateway.session.closing", "gateway.error", "app.error"].includes(e.type))
        return parar();
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
        // Os trechos chegam palavra a palavra: viram uma fala só por pessoa.
        juntarFala(falas, role, e.delta, cursor);
        if (role === "user") agendar();
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
    gateway.send(JSON.stringify(corpoInicioSessao(s.instrucoesVoz, voz, sdp)));
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
