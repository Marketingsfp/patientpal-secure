/**
 * FASE 5 — FINAL ANSWER VERIFICATION.
 *
 * Problema arquitetural corrigido aqui:
 *
 *   antes:  motor avalia TEXTO A -> pós-processamento -> paciente recebe TEXTO B
 *   agora:  pós-processamento -> TEXTO FINAL -> verificação -> persistência -> envio
 *
 * Dois conceitos, deliberadamente separados:
 *
 * - `action_safety`   — é seguro EXECUTAR a ação (agendar, cancelar, transferir)?
 *                       Continua rodando ANTES das ações críticas, como sempre.
 * - `answer_confidence` — a MENSAGEM FINAL que o paciente vai receber é
 *                       confiável? É este número que aparece ao lado da
 *                       mensagem da Nina.
 *
 * Regra dura do gate: o score persistido pertence a UM texto específico. Se o
 * texto mudar depois da avaliação, a avaliação é invalidada e refeita. Score de
 * texto anterior nunca é reaproveitado.
 *
 * Nenhuma chamada extra de modelo (GPT/Sol) entra neste caminho.
 */
import { decidirConfianca } from "./engine";
import { avaliacaoCorrespondeAoTexto, hashDoTexto } from "./hash";
import type { PoliticaConfianca } from "./policy";
import type { ContextoConfianca, ResultadoConfianca } from "./types";

export type EntradaRespostaFinal = {
  /** Mesmo contexto estruturado do turno usado na segurança da ação. */
  ctx: ContextoConfianca;
  /** Texto EXATO que será persistido e enviado ao paciente. */
  textoFinal: string;
  politica?: PoliticaConfianca;
};

/**
 * Avalia a mensagem final já pós-processada (saudação obrigatória, avisos
 * internos, banner de transferência — tudo já aplicado).
 */
export function verificarRespostaFinal(e: EntradaRespostaFinal): ResultadoConfianca {
  const ctx: ContextoConfianca = {
    ...e.ctx,
    tipoAvaliacao: "answer_confidence",
    draftText: e.textoFinal,
  };
  const r = decidirConfianca(ctx, e.politica ? { politica: e.politica } : {});
  return { ...r, tipoAvaliacao: "answer_confidence", textoAvaliadoHash: hashDoTexto(e.textoFinal) };
}

/** Avaliação de segurança da AÇÃO (não é a nota da mensagem). */
export function verificarSegurancaDaAcao(
  ctx: ContextoConfianca,
  politica?: PoliticaConfianca,
): ResultadoConfianca {
  const r = decidirConfianca(
    { ...ctx, tipoAvaliacao: "action_safety" },
    politica ? { politica } : {},
  );
  return { ...r, tipoAvaliacao: "action_safety" };
}

/** A avaliação pertence exatamente a este texto? */
export function avaliacaoValeParaOTexto(
  avaliacao: Pick<ResultadoConfianca, "tipoAvaliacao" | "textoAvaliadoHash"> | null | undefined,
  textoFinal: string,
): boolean {
  if (!avaliacao) return false;
  if (avaliacao.tipoAvaliacao !== "answer_confidence") return false;
  return avaliacaoCorrespondeAoTexto(avaliacao.textoAvaliadoHash, textoFinal);
}

export type SaidaGateRespostaFinal = {
  resultado: ResultadoConfianca;
  /** A avaliação anterior foi descartada e o motor rodou de novo. */
  recalculado: boolean;
  motivo: "avaliacao_valida" | "texto_alterado_apos_avaliacao" | "sem_avaliacao_previa";
};

/**
 * GATE DE SAÍDA: garante que o score persistido corresponde ao texto final.
 *
 * Se a avaliação recebida não for do texto final (porque o pós-processamento
 * mudou a mensagem), ela é invalidada e o motor roda de novo sobre o texto
 * realmente enviado.
 */
export function assegurarAvaliacaoDoTextoFinal(
  e: EntradaRespostaFinal & { avaliacaoPrevia?: ResultadoConfianca | null },
): SaidaGateRespostaFinal {
  const previa = e.avaliacaoPrevia ?? null;
  if (previa && avaliacaoValeParaOTexto(previa, e.textoFinal)) {
    return { resultado: previa, recalculado: false, motivo: "avaliacao_valida" };
  }
  return {
    resultado: verificarRespostaFinal(e),
    recalculado: true,
    motivo: previa ? "texto_alterado_apos_avaliacao" : "sem_avaliacao_previa",
  };
}
