/**
 * Regras puras de apresentação do snapshot de confiança da Nina.
 *
 * REGRA DURA: nada aqui calcula ou estima confiança. Estas funções apenas
 * formatam/filtram o que o Confidence Decision Engine gravou no instante em
 * que a resposta foi produzida. Sem snapshot, o rótulo é "Não avaliada" —
 * nunca um score artificial.
 */
import type { ConfiancaDaMensagem } from "@/lib/nina/confianca.functions";

export type RotuloConfianca = {
  /** Existe snapshot gravado para a mensagem. */
  avaliada: boolean;
  /** Texto exibido no selo da Inbox interna (ex.: "97% Alta"). */
  texto: string;
  nivel: "HIGH" | "MEDIUM" | "LOW" | null;
  score: number | null;
  /** Versão da política vigente quando a resposta foi produzida. */
  policyVersion: string | null;
  /** HIGH_CONFIDENCE_ERROR: alta confiança que mesmo assim foi reportada. */
  altaConfiancaComErro: boolean;
};

const CURTO: Record<string, string> = {
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
};

/**
 * FASE 5 — sem teto visual.
 *
 * O antigo teto transformava 100 em 99 só na tela, criando divergência entre a
 * nota exibida e a nota gravada. A proteção correta não é mexer no número: é
 * dizer o que ele significa. O índice é técnico (quanto pôde ser conferido e
 * como saiu), nunca probabilidade de acerto — texto em NOTA_INDICE_TECNICO.
 */
export function scoreExibido(score: number): number {
  return Math.round(score);
}

/**
 * Rótulo do selo a partir do snapshot histórico (ou da ausência dele).
 *
 * FASE 6 — avaliação de AÇÃO não é confiança do TEXTO. Quando só existe
 * `action_safety`, a mensagem aparece como "Resposta não avaliada": a nota da
 * ação nunca é apresentada como se fosse a nota da resposta.
 */
export function rotuloConfianca(
  confianca: ConfiancaDaMensagem | null | undefined,
): RotuloConfianca {
  if (!confianca || confianca.avaliacao !== "answer_confidence") {
    return {
      avaliada: false,
      texto: "Resposta não avaliada",
      nivel: null,
      score: null,
      policyVersion: confianca?.policy_version ?? null,
      altaConfiancaComErro: false,
    };
  }
  const curto = CURTO[confianca.nivel] ?? CURTO["LOW"]!;
  const exibido = scoreExibido(confianca.score);
  return {
    avaliada: true,
    texto: `${exibido}% ${curto}`,
    nivel: confianca.nivel,
    score: exibido,
    policyVersion: confianca.policy_version,
    altaConfiancaComErro:
      confianca.nivel === "HIGH" && Boolean(confianca.erro_reportado),
  };
}

/** Classificação interna HIGH_CONFIDENCE_ERROR de uma resposta. */
export function ehAltaConfiancaComErro(
  confianca: ConfiancaDaMensagem | null | undefined,
): boolean {
  return Boolean(
    confianca &&
      confianca.avaliacao === "answer_confidence" &&
      confianca.nivel === "HIGH" &&
      confianca.erro_reportado,
  );
}

/**
 * FASE 5 — rótulo padronizado: "Índice da resposta: X/100".
 * É índice técnico de verificação, não probabilidade de acerto.
 */
export const ROTULO_INDICE_EVIDENCIA = "Índice da resposta (0–100)";

export const NOTA_INDICE_TECNICO =
  "Índice técnico de verificação (0–100). Mede quanto do que importava pôde ser " +
  "conferido e como esses pontos saíram. Não é probabilidade de acerto.";

export function textoIndiceEvidencia(score: number): string {
  return `${scoreExibido(score)}/100`;
}

/** Filtro de confiança da Revisão de Aprendizados. */
export function combinaFiltroConfianca(
  filtro: string,
  confianca: ConfiancaDaMensagem | null | undefined,
): boolean {
  if (filtro === "todas") return true;
  if (filtro === "sem") return !confianca;
  if (!confianca) return false;
  if (filtro === "alta_erro") return ehAltaConfiancaComErro(confianca);
  if (filtro === "90") return confianca.score >= 90;
  if (filtro === "95") return confianca.score >= 95;
  return confianca.nivel === filtro;
}
