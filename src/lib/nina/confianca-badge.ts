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

/** Rótulo do selo a partir do snapshot histórico (ou da ausência dele). */
export function rotuloConfianca(
  confianca: ConfiancaDaMensagem | null | undefined,
): RotuloConfianca {
  if (!confianca) {
    return {
      avaliada: false,
      texto: "Não avaliada",
      nivel: null,
      score: null,
      policyVersion: null,
      altaConfiancaComErro: false,
    };
  }
  const curto = CURTO[confianca.nivel] ?? CURTO["LOW"]!;
  return {
    avaliada: true,
    texto: `${confianca.score}% ${curto}`,
    nivel: confianca.nivel,
    score: confianca.score,
    policyVersion: confianca.policy_version,
    altaConfiancaComErro:
      confianca.nivel === "HIGH" && Boolean(confianca.erro_reportado),
  };
}

/** Classificação interna HIGH_CONFIDENCE_ERROR de uma resposta. */
export function ehAltaConfiancaComErro(
  confianca: ConfiancaDaMensagem | null | undefined,
): boolean {
  return Boolean(confianca && confianca.nivel === "HIGH" && confianca.erro_reportado);
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
