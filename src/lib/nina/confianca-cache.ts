/**
 * FASE 11 — desempenho do selo de confiança na Inbox.
 *
 * Regras puras de cache/lote usadas pelo hook da Inbox. Objetivos:
 *  - nunca fazer uma consulta por mensagem (N+1): um único lote por rodada;
 *  - não repetir consulta de execuções já conhecidas (troca de conversa e
 *    volta não refaz trabalho);
 *  - não piscar: o que já está em cache continua na tela enquanto o restante
 *    é buscado em segundo plano.
 */
import type { ConfiancaDaMensagem } from "@/lib/nina/confianca.functions";

export type EntradaCache = {
  /** null = execução sem snapshot gravado ("Não avaliada"). */
  valor: ConfiancaDaMensagem | null;
  /** Momento (ms) em que a entrada foi gravada. */
  em: number;
};

export type CacheConfianca = Map<string, EntradaCache>;

/** Reporte de erro pode surgir depois: revalidamos em segundo plano. */
export const TTL_CONFIANCA_MS = 60_000;
/** Teto por lote, alinhado ao limite aceito pela função de servidor. */
export const LOTE_MAXIMO = 300;

/**
 * FASE 6 — reporte de erro recém-gravado. O TTL de 60s deixaria o indicador
 * desatualizado por até um minuto; aqui a execução é marcada como vencida na
 * hora, para todos os leitores do navegador.
 */
const invalidadas = new Map<string, number>();
const ouvintes = new Set<() => void>();

export function invalidarConfianca(clinicaId: string, execucaoId: string, agora = Date.now()): void {
  if (!clinicaId || !execucaoId) return;
  invalidadas.set(chaveCache(clinicaId, execucaoId), agora);
  for (const fn of ouvintes) fn();
}

/** Avisa a Inbox de que algo foi invalidado (para refazer o lote). */
export function assinarInvalidacaoConfianca(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => {
    ouvintes.delete(fn);
  };
}

export function chaveCache(clinicaId: string, execucaoId: string): string {
  return `${clinicaId}:${execucaoId}`;
}

/**
 * Quais execuções precisam ir ao banco nesta rodada: as desconhecidas e as
 * vencidas pelo TTL. Sempre um único lote, nunca uma consulta por mensagem.
 */
export function idsParaBuscar(
  cache: CacheConfianca,
  clinicaId: string,
  execucaoIds: string[],
  agora: number,
  ttlMs: number = TTL_CONFIANCA_MS,
): string[] {
  const pendentes: string[] = [];
  const vistos = new Set<string>();
  for (const id of execucaoIds) {
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    const k = chaveCache(clinicaId, id);
    const entrada = cache.get(k);
    const invalidadaEm = invalidadas.get(k);
    const vencidaPorReporte = entrada != null && invalidadaEm != null && invalidadaEm >= entrada.em;
    if (!entrada || vencidaPorReporte || agora - entrada.em >= ttlMs) pendentes.push(id);
  }
  return pendentes.slice(0, LOTE_MAXIMO);
}

/** Mapa exibido agora: só o que já está em cache — renderiza sem esperar. */
export function mapaDoCache(
  cache: CacheConfianca,
  clinicaId: string,
  execucaoIds: string[],
): Record<string, ConfiancaDaMensagem> {
  const mapa: Record<string, ConfiancaDaMensagem> = {};
  for (const id of execucaoIds) {
    const entrada = cache.get(chaveCache(clinicaId, id));
    if (entrada?.valor) mapa[id] = entrada.valor;
  }
  return mapa;
}

/**
 * Grava o resultado do lote. As execuções pedidas que não voltaram ficam
 * marcadas como "sem snapshot" — assim não são consultadas de novo a cada
 * rolagem, e a mensagem mostra "Não avaliada" sem score inventado.
 */
export function gravarLote(
  cache: CacheConfianca,
  clinicaId: string,
  pedidos: string[],
  linhas: ConfiancaDaMensagem[],
  agora: number,
): CacheConfianca {
  const porId = new Map(linhas.map((l) => [l.execucao_id, l]));
  for (const id of pedidos) {
    cache.set(chaveCache(clinicaId, id), { valor: porId.get(id) ?? null, em: agora });
  }
  return cache;
}
