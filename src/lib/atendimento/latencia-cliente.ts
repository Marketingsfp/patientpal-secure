/**
 * FASE 1 — lado do navegador da telemetria de latência.
 *
 * Guarda os traces abertos (por `client_message_id` no envio, por id da
 * mensagem no recebimento), fecha o trace quando a última etapa chega e
 * alimenta o agregador p50/p95/p99/máximo.
 *
 * Desligado por padrão. Para ligar no navegador:
 *   localStorage.setItem("atendimento:latencia", "1")
 * (o antigo "nina:perf" também liga, para não ter duas chaves na cabeça.)
 *
 * Onde ver: window.__latencia.baseline() e window.__latencia.ultimos()
 */

import {
  criarAgregador,
  criarTrace,
  formatarResumo,
  linhaLog,
  type Etapa,
  type Fluxo,
  type ResumoTrace,
  type Trace,
} from "./latencia";
import { detectarOutlier, formatarOutlier } from "./benchmark-latencia";

const CHAVES = ["atendimento:latencia", "nina:perf"];

export function latenciaLigada(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return CHAVES.some((k) => localStorage.getItem(k) === "1");
  } catch {
    return false;
  }
}

const traces = new Map<string, Trace>();
const agregador = criarAgregador();
const ultimos: ResumoTrace[] = [];

/** Etapa final de cada fluxo: ao chegar, o trace é fechado e agregado. */
const FINAL: Record<string, Etapa> = {
  send: "SEND_T12_CANONICAL_RECONCILED",
  recv: "RECV_T8_MESSAGE_RENDERED",
};

export function abrirTrace(chave: string, fluxo: Fluxo, conversationId?: string | null): Trace | null {
  if (!latenciaLigada()) return null;
  const existente = traces.get(chave);
  if (existente) return existente;
  const t = criarTrace({ fluxo, conversationId, traceId: chave });
  traces.set(chave, t);
  return t;
}

export function obterTrace(chave: string): Trace | null {
  return traces.get(chave) ?? null;
}

/** Marca uma etapa; fecha e publica o trace quando é a etapa final. */
export function marcarEtapa(chave: string, etapa: Etapa, fluxo: Fluxo = "send"): void {
  const t = traces.get(chave) ?? abrirTrace(chave, fluxo);
  if (!t) return;
  t.marcar(etapa);
  if (etapa === FINAL[t.fluxo]) fechar(chave);
}

/** Absorve as marcas medidas no servidor (deslocadas para o relógio local). */
export function anexarMarcasDoServidor(
  chave: string,
  marcas: Record<string, number> | null | undefined,
): void {
  const t = traces.get(chave);
  if (!t || !marcas) return;
  const local = t.marcas();
  const t2 = local["SEND_T2_REQUEST_STARTED"];
  const t3 = marcas["SEND_T3_BACKEND_RECEIVED"];
  if (t2 == null || t3 == null) return;
  // Alinhamento: o instante em que o servidor recebeu passa a valer no relógio
  // do navegador. Os intervalos internos do servidor são preservados.
  const desloc = t2 - t3;
  for (const [etapa, valor] of Object.entries(marcas)) t.marcar(etapa, valor + desloc);
}

export function fechar(chave: string): ResumoTrace | null {
  const t = traces.get(chave);
  if (!t) return null;
  traces.delete(chave);
  const r = t.resumo();
  agregador.registrarResumo(r);
  ultimos.push(r);
  if (ultimos.length > 50) ultimos.shift();
  // Log técnico: identificadores e tempos, nunca conteúdo.
  // eslint-disable-next-line no-console
  console.info(
    "[atendimento:latencia]",
    linhaLog({
      traceId: r.traceId,
      conversationId: r.conversationId,
      etapa: "total",
      durationMs: r.totalMs,
      fluxo: r.fluxo,
      status: r.totalMs == null ? "incompleto" : "ok",
    }),
    "\n" + formatarResumo(r),
  );
  // FASE 7 — outlier: acima de 3 s de processamento INTERNO (Meta não conta).
  const outlier = detectarOutlier(r);
  if (outlier) {
    // eslint-disable-next-line no-console
    console.warn("[atendimento:latencia]\n" + formatarOutlier(outlier));
  }
  publicar();
  return r;
}

function publicar() {
  if (typeof window === "undefined") return;
  (window as any).__latencia = {
    baseline: () => agregador.baseline(),
    ultimos: () => [...ultimos],
    abertos: () => [...traces.keys()],
  };
}

export function baselineAtual() {
  return agregador.baseline();
}

export function zerarLatencia() {
  traces.clear();
  ultimos.length = 0;
  agregador.zerar();
}
