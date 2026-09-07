/**
 * FASE 8 — ATIVAÇÃO PROGRESSIVA do Confidence Decision Engine.
 *
 * Camada pura (sem banco, sem rede, sem modelo). Em vez de um interruptor
 * "liga tudo", a clínica avança por etapas:
 *
 *   A — só observação (nada muda para o paciente)
 *   B — LOW / BLOCK passam a transferir para atendente
 *   C — MEDIUM passa a pedir esclarecimento
 *   D — proteção rigorosa nas ações de agendamento
 *
 * Cada etapa contém a anterior. A decisão do motor é sempre preservada para
 * auditoria, mesmo quando a etapa atual não a aplica.
 */
import type { ResultadoConfianca } from "./types";

export type EtapaAtivacao = "A" | "B" | "C" | "D";

export const ETAPAS: EtapaAtivacao[] = ["A", "B", "C", "D"];

export const DESCRICAO_ETAPA: Record<EtapaAtivacao, string> = {
  A: "Somente observação — registra e não interfere",
  B: "Baixa confiança e bloqueadores transferem para atendente",
  C: "Confiança intermediária pede esclarecimento ao paciente",
  D: "Proteção rigorosa nas ações de agendamento",
};

export type AplicacaoEtapa = {
  etapa: EtapaAtivacao;
  /** Decisão que o pipeline deve realmente executar. */
  decisaoEfetiva: ResultadoConfianca["decision"];
  /** O motor teria liberado a resposta/ação? */
  teriaPermitido: boolean;
  /** A etapa atual mudou o comportamento neste turno? */
  interferiu: boolean;
  /** Decisão calculada pelo motor, sempre preservada para auditoria. */
  decisaoMotor: ResultadoConfianca["decision"];
  /** Por que a etapa endureceu a decisão (etapa D). */
  motivoEtapa?: string;
};

const CATEGORIAS_AGENDAMENTO = ["agendamento", "agenda", "disponibilidade", "horario"];

/** A decisão diz respeito a marcar/alterar horário? */
export function ehAcaoDeAgendamento(r: ResultadoConfianca): boolean {
  const cats = (r.evidence?.categorias ?? []).map((c) => String(c).toLowerCase());
  return cats.some((c) => CATEGORIAS_AGENDAMENTO.some((a) => c.includes(a)));
}

function ordem(e: EtapaAtivacao): number {
  return ETAPAS.indexOf(e);
}

/** A etapa `atual` já contempla o comportamento da etapa `alvo`? */
export function etapaAtinge(atual: EtapaAtivacao, alvo: EtapaAtivacao): boolean {
  return ordem(atual) >= ordem(alvo);
}

export function aplicarEtapa(r: ResultadoConfianca, etapa: EtapaAtivacao): AplicacaoEtapa {
  const teriaPermitido = r.decision === "ALLOW";
  const base = { etapa, teriaPermitido, decisaoMotor: r.decision } as const;

  // Etapa A: observação pura.
  if (etapa === "A") {
    return { ...base, decisaoEfetiva: "ALLOW", interferiu: false };
  }

  let efetiva: ResultadoConfianca["decision"] = "ALLOW";
  let motivo: string | undefined;

  // Etapa B (e acima): baixa confiança e bloqueadores absolutos transferem.
  if (r.decision === "HANDOFF" || r.decision === "BLOCK_ACTION") {
    efetiva = r.decision;
  }

  // Etapa C (e acima): confiança intermediária pede esclarecimento.
  if (r.decision === "CLARIFY" && etapaAtinge(etapa, "C")) {
    efetiva = "CLARIFY";
  }

  // Etapa D: rigor extra em agendamento — só libera com confiança alta,
  // sem bloqueadores e sem esclarecimento pendente.
  if (etapa === "D" && efetiva === "ALLOW" && ehAcaoDeAgendamento(r)) {
    const temBloqueio = (r.hardBlockers ?? []).length > 0;
    if (temBloqueio) {
      efetiva = "BLOCK_ACTION";
      motivo = "agendamento_com_bloqueador";
    } else if (r.level !== "HIGH") {
      efetiva = "HANDOFF";
      motivo = "agendamento_sem_confianca_alta";
    }
  }

  return {
    ...base,
    decisaoEfetiva: efetiva,
    interferiu: efetiva !== "ALLOW",
    ...(motivo ? { motivoEtapa: motivo } : {}),
  };
}

/**
 * Resolve a etapa a partir do que está gravado na clínica.
 * Padrão SEGURO: sem configuração explícita, etapa A (só observa).
 * Compatibilidade: a flag antiga `nina_confidence_enforce` ligada equivale a C.
 */
export function etapaDeFlag(
  valor: unknown,
  opcoes?: { enforceLegado?: boolean | null },
): EtapaAtivacao {
  const bruto = typeof valor === "string" ? valor.trim().toUpperCase() : "";
  if ((ETAPAS as string[]).includes(bruto)) return bruto as EtapaAtivacao;
  if (opcoes?.enforceLegado === true) return "C";
  return "A";
}
