/**
 * FASE 3 — Limites e repetição da correção assistida (regras puras).
 *
 * Este módulo não grava e não conhece o banco. Ele define:
 *  - a chave que identifica de forma única uma aplicação autorizada
 *    (mesmo erro + mesma análise + mesma proposta = mesma aplicação);
 *  - o teto de operações reais que uma correção pode disparar;
 *  - o tempo máximo de execução;
 *  - o estado técnico final, separando o que foi preparado, aplicado,
 *    publicado, verificado ou falhou.
 */

/** Estado técnico real da aplicação — não é anotação manual. */
export type ResultadoFinalExecucao =
  | "preparado"
  | "aplicado"
  | "aguardando_publicacao"
  | "verificado"
  | "falhou";

export const ROTULO_RESULTADO_FINAL: Record<ResultadoFinalExecucao, string> = {
  preparado: "Preparado (nada alterado ainda)",
  aplicado: "Alteração gravada",
  aguardando_publicacao: "Aguardando publicação por quem tem acesso ao código",
  verificado: "Alteração gravada e conferida no valor efetivo",
  falhou: "Não aplicado",
};

/** Operações reais controladas por teto. */
export type OperacaoLimitada =
  | "ler_catalogo"
  | "gravar_item_catalogo"
  | "ler_prompt_publicado"
  | "publicar_prompt"
  | "testar_em_homologacao"
  | "registrar_pendencia_tecnica";

export const LIMITES = {
  /** Cada correção altera um alvo. Duas gravações seriam escopo ampliado. */
  gravar_item_catalogo: 1,
  publicar_prompt: 1,
  testar_em_homologacao: 3,
  ler_catalogo: 6,
  ler_prompt_publicado: 3,
  registrar_pendencia_tecnica: 2,
} as const satisfies Record<OperacaoLimitada, number>;

/** Tempo máximo de uma aplicação, do clique ao encerramento. */
export const TEMPO_MAXIMO_MS = 3 * 60 * 1000;

/** Tentativas de aplicação para o mesmo erro antes de exigir nova análise. */
export const MAX_TENTATIVAS = 3;

export type ContagemOperacoes = Partial<Record<OperacaoLimitada, number>>;

export function podeExecutar(
  contagem: ContagemOperacoes,
  operacao: OperacaoLimitada,
): { ok: boolean; motivo: string } {
  const teto = LIMITES[operacao];
  const usado = contagem[operacao] ?? 0;
  if (usado >= teto)
    return {
      ok: false,
      motivo: `Limite desta correção atingido para "${operacao}" (${teto}). Operação recusada.`,
    };
  return { ok: true, motivo: "" };
}

export function registrarOperacao(
  contagem: ContagemOperacoes,
  operacao: OperacaoLimitada,
): ContagemOperacoes {
  return { ...contagem, [operacao]: (contagem[operacao] ?? 0) + 1 };
}

export function prazoExcedido(inicioMs: number, agoraMs: number): boolean {
  return agoraMs - inicioMs > TEMPO_MAXIMO_MS;
}

/** Hash estável (FNV-1a) usado só para identificar, nunca para segurança. */
function hash(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Mesma autorização repetida (duplo clique, refresh, retomada) produz a mesma
 * chave — o banco recusa a segunda gravação e a primeira aplicação vale.
 */
export function chaveIdempotencia(entrada: {
  feedbackId: string;
  analiseId: string;
  assinaturaProposta: string;
  pacoteHash: string | null;
}): string {
  return [
    entrada.feedbackId,
    entrada.analiseId,
    entrada.assinaturaProposta,
    entrada.pacoteHash ?? "sem-pacote",
  ]
    .map((p) => hash(String(p)))
    .join("-");
}
