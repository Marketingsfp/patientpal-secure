/**
 * FASE 7 — SHADOW MODE do Confidence Decision Engine.
 *
 * Camada pura (sem banco, sem rede, sem modelo). Em shadow o motor roda
 * inteiro e registra tudo, mas NÃO interfere na decisão atual da Nina:
 * a resposta sai como sairia antes. Em enforce a decisão é aplicada.
 */
import type { ResultadoConfianca } from "./types";

export type ModoConfianca = "shadow" | "enforce";

export type AplicacaoModo = {
  modo: ModoConfianca;
  /** Decisão que o pipeline deve realmente executar. */
  decisaoEfetiva: ResultadoConfianca["decision"];
  /** O motor teria liberado a resposta/ação? */
  teriaPermitido: boolean;
  /** O motor mudou o comportamento neste turno? */
  interferiu: boolean;
  /** Decisão calculada pelo motor, sempre preservada para auditoria. */
  decisaoMotor: ResultadoConfianca["decision"];
};

/**
 * Em shadow, o efeito é sempre ALLOW (a Nina responde normalmente) e apenas
 * registramos o que o motor teria feito.
 */
export function aplicarModo(r: ResultadoConfianca, modo: ModoConfianca): AplicacaoModo {
  const teriaPermitido = r.decision === "ALLOW";
  if (modo === "shadow") {
    return {
      modo,
      decisaoEfetiva: "ALLOW",
      teriaPermitido,
      interferiu: false,
      decisaoMotor: r.decision,
    };
  }
  return {
    modo,
    decisaoEfetiva: r.decision,
    teriaPermitido,
    interferiu: r.decision !== "ALLOW",
    decisaoMotor: r.decision,
  };
}

export function modoDeFlag(flagEnforceAtiva: boolean | null | undefined): ModoConfianca {
  return flagEnforceAtiva === true ? "enforce" : "shadow";
}
