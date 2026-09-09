/**
 * FASE 1 — TELEMETRIA DE LATÊNCIA DO ATENDIMENTO WHATSAPP.
 *
 * Aqui ficam apenas MEDIÇÕES. Nada neste arquivo muda comportamento da Nina,
 * regra de negócio, segurança ou fluxo de envio/recebimento.
 *
 * Objetivo: provar de onde vem cada segundo do caminho
 *   clique → servidor → Meta → banco → tempo real → tela
 * e do caminho
 *   webhook → banco → tempo real → tela.
 *
 * PRIVACIDADE: um registro de latência só pode conter identificadores
 * técnicos e tempos. Texto de mensagem, nome, telefone, conteúdo clínico ou
 * qualquer dado de paciente são proibidos — `linhaLog()` só deixa passar as
 * chaves permitidas e `validarLinhaLog()` é usado nos testes de regressão.
 */

export type Fluxo = "send" | "recv" | "sub";

/** Etapas do envio humano (da tela até a reconciliação). */
export const ETAPAS_SEND = [
  "SEND_T0_CLICK",
  "SEND_T1_OPTIMISTIC_RENDER",
  "SEND_T2_REQUEST_STARTED",
  "SEND_T3_BACKEND_RECEIVED",
  "SEND_T4_AUTH_DONE",
  "SEND_T5_CONFIG_READY",
  "SEND_T6_META_REQUEST_START",
  "SEND_T7_META_RESPONSE",
  "SEND_T8_DB_INSERT_DONE",
  "SEND_T9_CONVERSATION_UPDATE_DONE",
  "SEND_T10_BACKEND_RESPONSE",
  "SEND_T11_REALTIME_RECEIVED",
  "SEND_T12_CANONICAL_RECONCILED",
] as const;

/** Etapas do recebimento (webhook da Meta até a mensagem desenhada). */
export const ETAPAS_RECV = [
  "RECV_T0_WEBHOOK_RECEIVED",
  "RECV_T1_SIGNATURE_VALIDATED",
  "RECV_T2_CONFIG_READY",
  "RECV_T3_PAYLOAD_PARSED",
  "RECV_T4_DB_INSERT_START",
  "RECV_T5_DB_INSERT_DONE",
  "RECV_T6_REALTIME_AVAILABLE",
  "RECV_T7_REALTIME_BROWSER",
  "RECV_T8_MESSAGE_RENDERED",
] as const;

export type EtapaSend = (typeof ETAPAS_SEND)[number];
export type EtapaRecv = (typeof ETAPAS_RECV)[number];
export type Etapa = EtapaSend | EtapaRecv | (string & {});

export type Marcas = Record<string, number>;

export type Trace = {
  traceId: string;
  fluxo: Fluxo;
  conversationId: string | null;
  /** Marca a etapa agora (ou no instante informado). Primeira marca vence. */
  marcar: (etapa: Etapa, quando?: number) => void;
  /** Mede um subprocesso (query, debounce, chamada externa). */
  medir: <T>(nome: string, fn: () => Promise<T>) => Promise<T>;
  marcas: () => Marcas;
  subprocessos: () => Record<string, number>;
  resumo: () => ResumoTrace;
};

/** Relógio monotônico quando existe; senão, relógio de parede. */
export function agora(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function novoTraceId(): string {
  const c: any = typeof crypto !== "undefined" ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Segmentos: o que cada intervalo significa em linguagem de diagnóstico.
// ---------------------------------------------------------------------------

type Segmento = { nome: string; de: Etapa; ate: Etapa };

export const SEGMENTOS_SEND: Segmento[] = [
  { nome: "frontend_pre_request", de: "SEND_T0_CLICK", ate: "SEND_T2_REQUEST_STARTED" },
  { nome: "ui_render", de: "SEND_T0_CLICK", ate: "SEND_T1_OPTIMISTIC_RENDER" },
  { nome: "rede_ate_backend", de: "SEND_T2_REQUEST_STARTED", ate: "SEND_T3_BACKEND_RECEIVED" },
  { nome: "auth", de: "SEND_T3_BACKEND_RECEIVED", ate: "SEND_T4_AUTH_DONE" },
  { nome: "config", de: "SEND_T4_AUTH_DONE", ate: "SEND_T5_CONFIG_READY" },
  { nome: "pre_meta", de: "SEND_T5_CONFIG_READY", ate: "SEND_T6_META_REQUEST_START" },
  { nome: "meta_api", de: "SEND_T6_META_REQUEST_START", ate: "SEND_T7_META_RESPONSE" },
  { nome: "db_pos_meta", de: "SEND_T7_META_RESPONSE", ate: "SEND_T8_DB_INSERT_DONE" },
  { nome: "update_conversa", de: "SEND_T8_DB_INSERT_DONE", ate: "SEND_T9_CONVERSATION_UPDATE_DONE" },
  // Tempo do backend ANTES de depender da Meta: é o que está sob nosso controle.
  { nome: "backend_pre_meta", de: "SEND_T3_BACKEND_RECEIVED", ate: "SEND_T6_META_REQUEST_START" },
  { nome: "backend_total", de: "SEND_T3_BACKEND_RECEIVED", ate: "SEND_T10_BACKEND_RESPONSE" },
  { nome: "reconciliacao", de: "SEND_T10_BACKEND_RESPONSE", ate: "SEND_T12_CANONICAL_RECONCILED" },
  { nome: "realtime", de: "SEND_T10_BACKEND_RESPONSE", ate: "SEND_T11_REALTIME_RECEIVED" },
  { nome: "total", de: "SEND_T0_CLICK", ate: "SEND_T12_CANONICAL_RECONCILED" },
];

export const SEGMENTOS_RECV: Segmento[] = [
  { nome: "webhook_pre_insert", de: "RECV_T0_WEBHOOK_RECEIVED", ate: "RECV_T4_DB_INSERT_START" },
  { nome: "assinatura", de: "RECV_T0_WEBHOOK_RECEIVED", ate: "RECV_T1_SIGNATURE_VALIDATED" },
  { nome: "config", de: "RECV_T1_SIGNATURE_VALIDATED", ate: "RECV_T2_CONFIG_READY" },
  { nome: "parse", de: "RECV_T2_CONFIG_READY", ate: "RECV_T3_PAYLOAD_PARSED" },
  { nome: "insert", de: "RECV_T4_DB_INSERT_START", ate: "RECV_T5_DB_INSERT_DONE" },
  { nome: "realtime", de: "RECV_T5_DB_INSERT_DONE", ate: "RECV_T7_REALTIME_BROWSER" },
  { nome: "render", de: "RECV_T7_REALTIME_BROWSER", ate: "RECV_T8_MESSAGE_RENDERED" },
  { nome: "total", de: "RECV_T0_WEBHOOK_RECEIVED", ate: "RECV_T8_MESSAGE_RENDERED" },
];

export type ResumoTrace = {
  traceId: string;
  fluxo: Fluxo;
  conversationId: string | null;
  totalMs: number | null;
  segmentos: Record<string, number>;
  subprocessos: Record<string, number>;
  /** Segmento mais caro (fora do total) — o "culpado" do pico. */
  maiorSegmento: { nome: string; ms: number } | null;
};

function intervalo(marcas: Marcas, de: string, ate: string): number | null {
  const a = marcas[de];
  const b = marcas[ate];
  if (a == null || b == null) return null;
  return Math.max(0, Math.round(b - a));
}

export function calcularSegmentos(fluxo: Fluxo, marcas: Marcas): Record<string, number> {
  const defs = fluxo === "recv" ? SEGMENTOS_RECV : SEGMENTOS_SEND;
  const out: Record<string, number> = {};
  for (const s of defs) {
    const v = intervalo(marcas, s.de, s.ate);
    if (v != null) out[s.nome] = v;
  }
  return out;
}

export function criarTrace(opts: {
  fluxo: Fluxo;
  traceId?: string;
  conversationId?: string | null;
  relogio?: () => number;
}): Trace {
  const relogio = opts.relogio ?? agora;
  const traceId = opts.traceId ?? novoTraceId();
  const marcas: Marcas = {};
  const subs: Record<string, number> = {};

  const resumo = (): ResumoTrace => {
    const segmentos = calcularSegmentos(opts.fluxo, marcas);
    let maior: { nome: string; ms: number } | null = null;
    for (const [nome, ms] of Object.entries(segmentos)) {
      if (nome === "total" || nome === "backend_total") continue;
      if (!maior || ms > maior.ms) maior = { nome, ms };
    }
    return {
      traceId,
      fluxo: opts.fluxo,
      conversationId: opts.conversationId ?? null,
      totalMs: segmentos.total ?? null,
      segmentos,
      subprocessos: { ...subs },
      maiorSegmento: maior,
    };
  };

  return {
    traceId,
    fluxo: opts.fluxo,
    conversationId: opts.conversationId ?? null,
    marcar(etapa, quando) {
      // Primeira marca vence: retry/evento repetido não reescreve a linha do tempo.
      if (marcas[etapa] != null) return;
      marcas[etapa] = quando ?? relogio();
    },
    async medir(nome, fn) {
      const t0 = relogio();
      try {
        return await fn();
      } finally {
        subs[nome] = Math.max(0, Math.round(relogio() - t0));
      }
    },
    marcas: () => ({ ...marcas }),
    subprocessos: () => ({ ...subs }),
    resumo,
  };
}

// ---------------------------------------------------------------------------
// Texto do resumo (o "de onde veio o pico").
// ---------------------------------------------------------------------------

export function formatarResumo(r: ResumoTrace): string {
  const titulo = r.fluxo === "recv" ? "RECV TOTAL" : "SEND TOTAL";
  const linhas = [`${titulo}: ${r.totalMs ?? "?"} ms`];
  for (const [nome, ms] of Object.entries(r.segmentos)) {
    if (nome === "total") continue;
    linhas.push(`  ${nome}: ${ms} ms`);
  }
  for (const [nome, ms] of Object.entries(r.subprocessos)) {
    linhas.push(`  ${nome}: ${ms} ms`);
  }
  return linhas.join("\n");
}

// ---------------------------------------------------------------------------
// Linha de log: só campo técnico.
// ---------------------------------------------------------------------------

export const CAMPOS_LOG_PERMITIDOS = [
  "traceId",
  "conversationId",
  "etapa",
  "durationMs",
  "status",
  "fluxo",
] as const;

export type LinhaLog = {
  traceId: string;
  conversationId: string | null;
  etapa: string;
  durationMs: number | null;
  status: string;
  fluxo: Fluxo;
};

export function linhaLog(p: {
  traceId: string;
  conversationId?: string | null;
  etapa: string;
  durationMs?: number | null;
  status?: string;
  fluxo: Fluxo;
}): LinhaLog {
  return {
    traceId: p.traceId,
    conversationId: p.conversationId ?? null,
    etapa: p.etapa,
    durationMs: p.durationMs ?? null,
    status: p.status ?? "ok",
    fluxo: p.fluxo,
  };
}

/** Usado nos testes: rejeita qualquer campo fora da lista permitida. */
export function validarLinhaLog(linha: Record<string, unknown>): boolean {
  return Object.keys(linha).every((k) => (CAMPOS_LOG_PERMITIDOS as readonly string[]).includes(k));
}

// ---------------------------------------------------------------------------
// Métricas agregadas (p50 / p95 / p99 / máximo).
// ---------------------------------------------------------------------------

export const METRICAS = [
  "SEND_UI_RENDER",
  "SEND_BACKEND_PRE_META",
  "SEND_BACKEND",
  "SEND_META",
  "SEND_TOTAL",
  "RECV_WEBHOOK_TO_DB",
  "RECV_DB_TO_BROWSER",
  "RECV_BROWSER_TO_RENDER",
  "RECV_TOTAL",
] as const;

export type Metrica = (typeof METRICAS)[number];

export type Estatistica = { n: number; p50: number; p95: number; p99: number; max: number };

export function percentil(valores: number[], p: number): number {
  if (!valores.length) return 0;
  const ord = [...valores].sort((a, b) => a - b);
  const idx = Math.min(ord.length - 1, Math.max(0, Math.ceil((p / 100) * ord.length) - 1));
  return ord[idx]!;
}

export function estatistica(valores: number[]): Estatistica {
  return {
    n: valores.length,
    p50: percentil(valores, 50),
    p95: percentil(valores, 95),
    p99: percentil(valores, 99),
    max: valores.length ? Math.max(...valores) : 0,
  };
}

/** Converte um trace em métricas nomeadas (as do gate de saída). */
export function metricasDoResumo(r: ResumoTrace): Partial<Record<Metrica, number>> {
  const s = r.segmentos;
  if (r.fluxo === "recv") {
    return limpar({
      RECV_WEBHOOK_TO_DB: somar(s.webhook_pre_insert, s.insert),
      RECV_DB_TO_BROWSER: s.realtime,
      RECV_BROWSER_TO_RENDER: s.render,
      RECV_TOTAL: s.total,
    });
  }
  return limpar({
    SEND_UI_RENDER: s.ui_render,
    SEND_BACKEND_PRE_META: s.backend_pre_meta,
    SEND_BACKEND: s.backend_total,
    SEND_META: s.meta_api,
    SEND_TOTAL: s.total,
  });
}

function somar(...vs: Array<number | undefined>): number | undefined {
  const presentes = vs.filter((v): v is number => typeof v === "number");
  return presentes.length ? presentes.reduce((a, b) => a + b, 0) : undefined;
}

function limpar(o: Record<string, number | undefined>): Partial<Record<Metrica, number>> {
  const out: any = {};
  for (const [k, v] of Object.entries(o)) if (typeof v === "number") out[k] = v;
  return out;
}

export type Agregador = {
  registrarResumo: (r: ResumoTrace) => void;
  registrar: (metrica: Metrica, ms: number) => void;
  baseline: () => Partial<Record<Metrica, Estatistica>>;
  zerar: () => void;
};

/** Agregação em memória (desenvolvimento/homologação), com teto de amostras. */
export function criarAgregador(limite = 500): Agregador {
  const amostras = new Map<Metrica, number[]>();
  const registrar = (metrica: Metrica, ms: number) => {
    if (!Number.isFinite(ms)) return;
    const lista = amostras.get(metrica) ?? [];
    lista.push(ms);
    if (lista.length > limite) lista.shift();
    amostras.set(metrica, lista);
  };
  return {
    registrar,
    registrarResumo(r) {
      for (const [m, v] of Object.entries(metricasDoResumo(r))) registrar(m as Metrica, v);
    },
    baseline() {
      const out: Partial<Record<Metrica, Estatistica>> = {};
      for (const [m, vals] of amostras) out[m] = estatistica(vals);
      return out;
    },
    zerar: () => amostras.clear(),
  };
}
