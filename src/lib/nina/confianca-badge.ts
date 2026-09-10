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
 * FASE 6 — teto visual de 99% para resposta gerativa da Nina.
 *
 * Enquanto não houver calibração estatística suficiente, não exibimos 100%
 * como certeza absoluta. É proteção semântica de interface: o score gravado
 * no snapshot NÃO é alterado, e eventos determinísticos seguem seu próprio
 * conceito, fora desta formatação.
 */
export const TETO_VISUAL_GERATIVO = 99;

export function scoreExibido(score: number): number {
  return Math.min(score, TETO_VISUAL_GERATIVO);
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
 * FASE 6 — a nota é ÍNDICE DE EVIDÊNCIA (0–100), não probabilidade de acerto.
 * Ela mede quanto do que importava pôde ser verificado e como esses sinais
 * foram — nunca uma chance estatística calibrada.
 */
export const ROTULO_INDICE_EVIDENCIA = "Índice de evidência (0–100)";

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
