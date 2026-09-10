/**
 * FASE 4 — ESCLARECIMENTO COMO ESTADO DA CONVERSA (camada pura).
 *
 * Antes, "esclarecer" era uma rodada extra do modelo dentro do MESMO turno: a
 * Nina se auto-instruía, o contador de tentativas subia sem o paciente ter
 * dito nada e, ao fim de duas rodadas internas, a conversa era transferida.
 *
 * Aqui o esclarecimento vira o que ele é de fato:
 *
 *   1. uma PERGUNTA curta ao paciente;
 *   2. uma PENDÊNCIA persistida (o que falta, por quê, desde quando);
 *   3. o FIM do turno — a reavaliação depende de nova entrada do paciente.
 *
 * A tentativa só é consumida quando o paciente RESPONDEU e a dúvida CONTINUA.
 * Nova chamada ao modelo, reinício do processo, lote de mensagens agrupadas ou
 * retomada não consomem tentativa nenhuma. Se o paciente muda de assunto, a
 * pendência antiga é descartada em vez de prendê-lo a uma pergunta velha.
 *
 * Módulo puro: sem banco, sem rede, sem modelo.
 */
import type { ResultadoConfianca } from "./types";
import type { TipoTurno } from "./turno-tipo";

export type PendenciaEsclarecimento = {
  /** Existe uma pergunta de esclarecimento aguardando resposta do paciente. */
  pendente: boolean;
  /** O que falta, em texto curto e auditável (sem dado sensível). */
  alvo: string | null;
  /** Motivos observáveis registrados pelo motor de confiança. */
  motivos: string[];
  /** Tentativas JÁ CONSUMIDAS: perguntas respondidas sem resolver a dúvida. */
  tentativas: number;
  /** Quando a pergunta pendente foi emitida. */
  perguntado_em: string | null;
  /** Intenção do turno em que a pergunta foi feita (para detectar troca de assunto). */
  intent: string | null;
  /** Mensagem do paciente que originou a pergunta. */
  message_id: string | null;
};

export function pendenciaVazia(): PendenciaEsclarecimento {
  return {
    pendente: false,
    alvo: null,
    motivos: [],
    tentativas: 0,
    perguntado_em: null,
    intent: null,
    message_id: null,
  };
}

export function normalizarPendencia(bruto: unknown): PendenciaEsclarecimento {
  const base = pendenciaVazia();
  if (!bruto || typeof bruto !== "object") return base;
  const o = bruto as Record<string, unknown>;
  const tentativas = Number(o["tentativas"] ?? 0);
  return {
    pendente: o["pendente"] === true,
    alvo: (o["alvo"] as string | null) ?? null,
    motivos: Array.isArray(o["motivos"]) ? (o["motivos"] as string[]).map(String) : [],
    tentativas: Number.isFinite(tentativas) && tentativas > 0 ? Math.floor(tentativas) : 0,
    perguntado_em: (o["perguntado_em"] as string | null) ?? null,
    intent: (o["intent"] as string | null) ?? null,
    message_id: (o["message_id"] as string | null) ?? null,
  };
}

/** O que exatamente falta esclarecer, derivado dos validadores reprovados. */
export function alvoDoEsclarecimento(r: ResultadoConfianca): string {
  const nomes = (r.validators ?? [])
    .filter((v) => v.status !== "PASS" && v.status !== "NOT_APPLICABLE")
    .map((v) => v.validator);
  if (nomes.includes("EntityResolutionValidator")) return "qual item específico o paciente quer";
  if (nomes.includes("RequiredDataValidator")) {
    const faltam = r.evidence?.camposFaltantes ?? [];
    if (faltam.length > 0) return `dados que faltam: ${faltam.join(", ")}`;
  }
  if (nomes.includes("IntentClarityValidator")) return "o que o paciente deseja resolver";
  return "o que o paciente precisa (procedimento, convênio, unidade ou profissional)";
}

/**
 * A pergunta que VAI ao paciente. Curta, em uma frase, sem jargão interno e
 * sem repetir a afirmação que o motor reprovou.
 */
export function perguntaParaPaciente(
  r: ResultadoConfianca,
  tipoTurno?: TipoTurno | null,
): string {
  const nomes = (r.validators ?? [])
    .filter((v) => v.status !== "PASS" && v.status !== "NOT_APPLICABLE")
    .map((v) => v.validator);

  if (nomes.includes("RequiredDataValidator")) {
    const faltam = (r.evidence?.camposFaltantes ?? []).filter(Boolean);
    if (faltam.length === 1)
      return `Para eu continuar, pode me informar ${String(faltam[0])}?`;
    if (faltam.length > 1)
      return `Para eu continuar, pode me informar ${String(faltam[0])}?`;
  }
  if (nomes.includes("EntityResolutionValidator"))
    return "Para eu confirmar certinho: qual exatamente você precisa?";
  if (tipoTurno === "SAUDACAO")
    return "Oi! Como posso te ajudar hoje?";
  return "Só para eu te responder com segurança: pode me dizer o que você precisa exatamente?";
}

/**
 * Início do turno: decide se a pendência anterior ainda vale e quantas
 * tentativas já foram realmente consumidas.
 *
 * - paciente respondeu e continua no mesmo assunto -> tentativa consumida;
 * - mesma mensagem reavaliada (reprocesso, retomada, lote) -> nada muda;
 * - mudou de assunto -> a pendência antiga é descartada.
 */
export function reavaliarPendencia(entrada: {
  anterior: PendenciaEsclarecimento | null | undefined;
  intentAtual: string | null;
  messageIdAtual: string | null;
}): { pendencia: PendenciaEsclarecimento; tentativas: number; mudouDeAssunto: boolean } {
  const a = entrada.anterior ? normalizarPendencia(entrada.anterior) : pendenciaVazia();
  if (!a.pendente) return { pendencia: pendenciaVazia(), tentativas: 0, mudouDeAssunto: false };

  const mudouDeAssunto =
    Boolean(a.intent) && Boolean(entrada.intentAtual) && a.intent !== entrada.intentAtual;
  if (mudouDeAssunto)
    return { pendencia: pendenciaVazia(), tentativas: 0, mudouDeAssunto: true };

  // Mesma mensagem sendo reavaliada: reinício, lote agrupado ou retomada.
  // Nada foi respondido, logo nada é consumido.
  const mesmaEntrada =
    Boolean(a.message_id) &&
    Boolean(entrada.messageIdAtual) &&
    a.message_id === entrada.messageIdAtual;
  if (mesmaEntrada) return { pendencia: a, tentativas: a.tentativas, mudouDeAssunto: false };

  // O paciente respondeu: a pergunta anterior foi usada.
  const tentativas = a.tentativas + 1;
  return { pendencia: { ...a, tentativas }, tentativas, mudouDeAssunto: false };
}

/**
 * Registra a pergunta emitida. NÃO incrementa tentativas: emitir pergunta não
 * é o mesmo que o paciente ter respondido sem resolver.
 */
export function abrirPendencia(entrada: {
  resultado: ResultadoConfianca;
  intent: string | null;
  messageId: string | null;
  tentativasConsumidas: number;
  agora?: string;
}): PendenciaEsclarecimento {
  return {
    pendente: true,
    alvo: alvoDoEsclarecimento(entrada.resultado),
    motivos: (entrada.resultado.evidence?.motivos ?? []).map(String).slice(0, 6),
    tentativas: Math.max(0, entrada.tentativasConsumidas),
    perguntado_em: entrada.agora ?? new Date().toISOString(),
    intent: entrada.intent,
    message_id: entrada.messageId,
  };
}

/** A dúvida foi resolvida (ou o turno teve outro desfecho): zera a pendência. */
export function fecharPendencia(): PendenciaEsclarecimento {
  return pendenciaVazia();
}

/**
 * Estado e restrições do turno expressos no CONTRATO correto (mensagem de
 * sistema), nunca como uma falsa mensagem do paciente.
 */
export function blocoContratoEsclarecimento(p: PendenciaEsclarecimento): string | null {
  if (!p.pendente) return null;
  return [
    "ESCLARECIMENTO PENDENTE NESTE ATENDIMENTO:",
    `- Falta esclarecer: ${p.alvo ?? "não registrado"}.`,
    `- Perguntas já respondidas sem resolver: ${p.tentativas}.`,
    "- Não repita afirmação não confirmada. Se o paciente já respondeu, use a resposta dele e consulte a fonte oficial antes de afirmar qualquer coisa.",
  ].join("\n");
}
