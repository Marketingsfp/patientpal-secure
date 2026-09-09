/**
 * FASE 7 — BENCHMARK FINAL E CRITÉRIO DE ACEITE DE LATÊNCIA.
 *
 * Este arquivo NÃO muda comportamento de envio, recebimento, Nina, permissões
 * ou banco. Ele apenas:
 *   1. define os alvos de aceite (p95) das fases anteriores;
 *   2. separa tempo INTERNO (nosso) de tempo EXTERNO (Meta);
 *   3. detecta outliers (> 3 s de processamento interno) e gera um trace de
 *      diagnóstico apontando as etapas mais caras;
 *   4. compara baselines ANTES/DEPOIS.
 *
 * PRIVACIDADE: nada aqui aceita texto de mensagem, nome, telefone ou dado
 * clínico. Só identificadores técnicos, nomes de etapa e milissegundos.
 */

import {
  estatistica,
  type Estatistica,
  type Metrica,
  type ResumoTrace,
} from "./latencia";

// ---------------------------------------------------------------------------
// Alvos de aceite (p95, em ms).
// ---------------------------------------------------------------------------

export const ALVOS_P95: Partial<Record<Metrica, number>> = {
  SEND_UI_RENDER: 100, // clique → bolha na tela
  SEND_BACKEND_PRE_META: 500, // backend recebeu → chamada da Meta iniciada
  RECV_WEBHOOK_TO_DB: 500, // webhook recebido → linha gravada
  RECV_BROWSER_TO_RENDER: 100, // evento no navegador → mensagem visível
};

/** Métricas que dependem de terceiro: medidas, nunca usadas como reprovação. */
export const METRICAS_EXTERNAS: Metrica[] = ["SEND_META", "SEND_BACKEND", "SEND_TOTAL"];

/** Teto do tempo total sob nosso controle (interno), em ms. */
export const ALVO_TOTAL_INTERNO_MS = 2000;

/** A partir daqui um caso vira outlier e ganha trace de diagnóstico. */
export const LIMITE_OUTLIER_MS = 3000;

// ---------------------------------------------------------------------------
// Interno x externo.
// ---------------------------------------------------------------------------

/** Segmentos que não são nossos (rede/API de terceiro). */
const SEGMENTOS_EXTERNOS = new Set(["meta_api"]);

/** Segmentos agregados: já são a soma de outros, não entram em ranking. */
const SEGMENTOS_AGREGADOS = new Set([
  "total",
  "backend_total",
  "backend_pre_meta",
  "frontend_pre_request",
]);

/** Tempo total menos o que foi gasto fora (Meta). */
export function tempoInterno(r: ResumoTrace): number | null {
  const total = r.segmentos.total;
  if (typeof total !== "number") return null;
  let externo = 0;
  for (const nome of SEGMENTOS_EXTERNOS) {
    const v = r.segmentos[nome];
    if (typeof v === "number") externo += v;
  }
  return Math.max(0, total - externo);
}

export function tempoExterno(r: ResumoTrace): number {
  let externo = 0;
  for (const nome of SEGMENTOS_EXTERNOS) {
    const v = r.segmentos[nome];
    if (typeof v === "number") externo += v;
  }
  return externo;
}

/** Ranking das etapas mais caras, já sem os agregados e sem o tempo da Meta. */
export function etapasMaisCaras(r: ResumoTrace, quantas = 3): Array<{ nome: string; ms: number }> {
  const itens: Array<{ nome: string; ms: number }> = [];
  for (const [nome, ms] of Object.entries(r.segmentos)) {
    if (SEGMENTOS_AGREGADOS.has(nome) || SEGMENTOS_EXTERNOS.has(nome)) continue;
    itens.push({ nome, ms });
  }
  for (const [nome, ms] of Object.entries(r.subprocessos)) itens.push({ nome, ms });
  return itens.sort((a, b) => b.ms - a.ms).slice(0, quantas);
}

// ---------------------------------------------------------------------------
// Outliers.
// ---------------------------------------------------------------------------

export type Outlier = {
  traceId: string;
  fluxo: ResumoTrace["fluxo"];
  conversationId: string | null;
  totalMs: number;
  totalInternalMs: number;
  externoMs: number;
  maioresEtapas: Array<{ nome: string; ms: number }>;
};

/** Só é outlier quando o tempo INTERNO passa do limite. Meta lenta não conta. */
export function detectarOutlier(r: ResumoTrace, limiteMs = LIMITE_OUTLIER_MS): Outlier | null {
  const interno = tempoInterno(r);
  if (interno == null || interno <= limiteMs) return null;
  return {
    traceId: r.traceId,
    fluxo: r.fluxo,
    conversationId: r.conversationId,
    totalMs: r.segmentos.total ?? interno,
    totalInternalMs: interno,
    externoMs: tempoExterno(r),
    maioresEtapas: etapasMaisCaras(r),
  };
}

export function formatarOutlier(o: Outlier): string {
  const linhas = [
    "PERFORMANCE OUTLIER",
    `traceId: ${o.traceId}`,
    `fluxo: ${o.fluxo}`,
    `totalInternal: ${o.totalInternalMs}ms`,
    `externo (Meta): ${o.externoMs}ms`,
    "maiores etapas:",
  ];
  for (const e of o.maioresEtapas) linhas.push(`  ${e.nome}: ${e.ms}ms`);
  return linhas.join("\n");
}

/** Campos que um relatório de outlier pode conter. Usado nos testes. */
export const CAMPOS_OUTLIER_PERMITIDOS = [
  "traceId",
  "fluxo",
  "conversationId",
  "totalMs",
  "totalInternalMs",
  "externoMs",
  "maioresEtapas",
] as const;

export function validarOutlierSemDadosSensiveis(o: Record<string, unknown>): boolean {
  return Object.keys(o).every((k) =>
    (CAMPOS_OUTLIER_PERMITIDOS as readonly string[]).includes(k),
  );
}

// ---------------------------------------------------------------------------
// Avaliação do gate.
// ---------------------------------------------------------------------------

export type AvaliacaoMetrica = {
  metrica: Metrica;
  alvoP95: number | null;
  externa: boolean;
  estatistica: Estatistica;
  aprovado: boolean;
};

export function avaliarBaseline(
  baseline: Partial<Record<Metrica, Estatistica>>,
): AvaliacaoMetrica[] {
  const out: AvaliacaoMetrica[] = [];
  for (const [m, est] of Object.entries(baseline) as Array<[Metrica, Estatistica]>) {
    const externa = METRICAS_EXTERNAS.includes(m);
    const alvo = externa ? null : (ALVOS_P95[m] ?? null);
    out.push({
      metrica: m,
      alvoP95: alvo,
      externa,
      estatistica: est,
      // Métrica externa e métrica sem alvo são informativas: nunca reprovam.
      aprovado: alvo == null ? true : est.p95 <= alvo,
    });
  }
  return out;
}

export function gateAprovado(avaliacoes: AvaliacaoMetrica[]): boolean {
  return avaliacoes.every((a) => a.aprovado);
}

// ---------------------------------------------------------------------------
// Coletor de benchmark: roda cenários e devolve estatísticas por métrica.
// ---------------------------------------------------------------------------

export type Cenario = {
  id: string;
  descricao: string;
  resumos: ResumoTrace[];
};

export type ResultadoCenario = {
  id: string;
  descricao: string;
  amostras: number;
  internoP95: number;
  externoP95: number;
  outliers: Outlier[];
};

export function avaliarCenario(c: Cenario): ResultadoCenario {
  const internos: number[] = [];
  const externos: number[] = [];
  const outliers: Outlier[] = [];
  for (const r of c.resumos) {
    const i = tempoInterno(r);
    if (i != null) internos.push(i);
    externos.push(tempoExterno(r));
    const o = detectarOutlier(r);
    if (o) outliers.push(o);
  }
  return {
    id: c.id,
    descricao: c.descricao,
    amostras: c.resumos.length,
    internoP95: estatistica(internos).p95,
    externoP95: estatistica(externos).p95,
    outliers,
  };
}

// ---------------------------------------------------------------------------
// Comparação ANTES / DEPOIS.
// ---------------------------------------------------------------------------

export type LinhaComparacao = {
  metrica: Metrica;
  antes: Estatistica | null;
  depois: Estatistica | null;
  deltaP95: number | null;
  melhorou: boolean | null;
};

export function compararBaselines(
  antes: Partial<Record<Metrica, Estatistica>>,
  depois: Partial<Record<Metrica, Estatistica>>,
): LinhaComparacao[] {
  const chaves = new Set<Metrica>([
    ...(Object.keys(antes) as Metrica[]),
    ...(Object.keys(depois) as Metrica[]),
  ]);
  const out: LinhaComparacao[] = [];
  for (const m of chaves) {
    const a = antes[m] ?? null;
    const d = depois[m] ?? null;
    const delta = a && d ? d.p95 - a.p95 : null;
    out.push({
      metrica: m,
      antes: a,
      depois: d,
      deltaP95: delta,
      melhorou: delta == null ? null : delta < 0,
    });
  }
  return out.sort((x, y) => x.metrica.localeCompare(y.metrica));
}

// ---------------------------------------------------------------------------
// Carga do Supabase por mensagem (contagem de requests, sem conteúdo).
// ---------------------------------------------------------------------------

export type CargaPorMensagem = Record<string, number>;

export type ComparacaoCarga = {
  operacao: string;
  antes: number;
  depois: number;
  delta: number;
  regressao: boolean;
};

export function compararCarga(
  antes: CargaPorMensagem,
  depois: CargaPorMensagem,
): ComparacaoCarga[] {
  const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  return [...chaves]
    .map((operacao) => {
      const a = antes[operacao] ?? 0;
      const d = depois[operacao] ?? 0;
      return { operacao, antes: a, depois: d, delta: d - a, regressao: d > a };
    })
    .sort((x, y) => x.operacao.localeCompare(y.operacao));
}

export function houveRegressaoDeCarga(linhas: ComparacaoCarga[]): boolean {
  return linhas.some((l) => l.regressao);
}
