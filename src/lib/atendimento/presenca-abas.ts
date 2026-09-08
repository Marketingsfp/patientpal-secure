/**
 * FASE 2 — Presença confiável com várias abas abertas.
 *
 * Problema que este módulo resolve: cada aba do navegador mandava o próprio
 * heartbeat. Duas abas do MESMO atendente brigavam entre si (a aba em segundo
 * plano mandava "ausente" enquanto a da frente mandava "online") e fechar uma
 * delas gravava OFFLINE mesmo com a outra aberta.
 *
 * A solução é um registro leve de abas em `localStorage`: cada aba anota o
 * próprio identificador, se está ativa e quando deu o último sinal. O status
 * enviado ao servidor passa a ser o do USUÁRIO (a melhor situação entre as
 * abas), não o de uma aba isolada.
 *
 * Não substitui a presença do servidor: `atend_agente_presenca` continua sendo
 * a fonte da verdade da distribuição. Isto só evita que o cliente mande
 * informação contraditória.
 */

export type EstadoAba = { id: string; ativa: boolean; ts: number };

/** Janela em que o sinal de uma aba ainda conta como "aba viva". */
export const ABA_VIVA_MS = 90_000;

export const CHAVE_ABAS = "atend.presenca.abas";

/* ------------------------------------------------------------------ *
 * Núcleo puro (testável, sem navegador)                               *
 * ------------------------------------------------------------------ */

export function registrarNoMapa(
  mapa: readonly EstadoAba[],
  aba: EstadoAba,
  agora: number,
): EstadoAba[] {
  const outras = mapa.filter((a) => a.id !== aba.id && agora - a.ts < ABA_VIVA_MS);
  return [...outras, aba];
}

export function removerDoMapa(mapa: readonly EstadoAba[], id: string, agora: number): EstadoAba[] {
  return mapa.filter((a) => a.id !== id && agora - a.ts < ABA_VIVA_MS);
}

/** Existe outra aba viva do mesmo usuário? (fechar uma não derruba a presença) */
export function outraAbaViva(
  mapa: readonly EstadoAba[],
  meuId: string,
  agora: number,
): boolean {
  return mapa.some((a) => a.id !== meuId && agora - a.ts < ABA_VIVA_MS);
}

/** Existe outra aba viva E ativa? (a de trás não pode marcar "ausente") */
export function outraAbaAtiva(
  mapa: readonly EstadoAba[],
  meuId: string,
  agora: number,
): boolean {
  return mapa.some((a) => a.id !== meuId && a.ativa && agora - a.ts < ABA_VIVA_MS);
}

/* ------------------------------------------------------------------ *
 * Camada de navegador                                                 *
 * ------------------------------------------------------------------ */

export const meuIdAba: string =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `aba-${Math.random().toString(36).slice(2)}`;

function ler(): EstadoAba[] {
  try {
    const cru = localStorage.getItem(CHAVE_ABAS);
    const arr = cru ? JSON.parse(cru) : [];
    return Array.isArray(arr) ? (arr as EstadoAba[]).filter((a) => a && typeof a.id === "string") : [];
  } catch {
    return [];
  }
}

function gravar(mapa: EstadoAba[]) {
  try {
    localStorage.setItem(CHAVE_ABAS, JSON.stringify(mapa));
  } catch {
    /* modo restrito: seguimos com o comportamento de aba única */
  }
}

/** Marca esta aba como viva; devolve se alguma OUTRA aba está ativa agora. */
export function anunciarAba(ativa: boolean): { outraAtiva: boolean } {
  if (typeof window === "undefined") return { outraAtiva: false };
  const agora = Date.now();
  const mapa = ler();
  const outraAtiva = outraAbaAtiva(mapa, meuIdAba, agora);
  gravar(registrarNoMapa(mapa, { id: meuIdAba, ativa, ts: agora }, agora));
  return { outraAtiva };
}

/** Tira esta aba do registro; devolve se ainda resta outra aba aberta. */
export function encerrarAba(): { restaOutra: boolean } {
  if (typeof window === "undefined") return { restaOutra: false };
  const agora = Date.now();
  const mapa = ler();
  const restaOutra = outraAbaViva(mapa, meuIdAba, agora);
  gravar(removerDoMapa(mapa, meuIdAba, agora));
  return { restaOutra };
}
