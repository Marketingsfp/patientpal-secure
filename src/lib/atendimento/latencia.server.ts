/**
 * FASE 1 — lado do servidor da telemetria de latência.
 *
 * Mede as etapas do envio humano (dentro da server function) e do webhook do
 * WhatsApp. Usa relógio monotônico quando disponível — não usamos `created_at`
 * do banco para medir milissegundos entre processos.
 *
 * Registro ativo em desenvolvimento/homologação; em produção só com a variável
 * `ATENDIMENTO_LATENCIA=1`. O log é uma linha técnica: traceId, conversa,
 * etapa, duração, status e fluxo. Nunca texto, nome, telefone ou dado clínico.
 */

import {
  criarTrace,
  formatarResumo,
  linhaLog,
  novoTraceId,
  type Fluxo,
  type ResumoTrace,
  type Trace,
} from "./latencia";

export function latenciaServidorLigada(): boolean {
  try {
    const env: any = typeof process !== "undefined" ? process.env : {};
    if (env?.["ATENDIMENTO_LATENCIA"] === "1") return true;
    return env?.["NODE_ENV"] !== "production";
  } catch {
    return false;
  }
}

export type TraceServidor = Trace & { publicar: (status?: string) => ResumoTrace };

export function iniciarTraceServidor(p: {
  fluxo: Fluxo;
  conversationId?: string | null;
  traceId?: string;
}): TraceServidor {
  const t = criarTrace({
    fluxo: p.fluxo,
    conversationId: p.conversationId ?? null,
    traceId: p.traceId ?? novoTraceId(),
  });
  return Object.assign(t, {
    publicar(status = "ok") {
      const r = t.resumo();
      if (latenciaServidorLigada()) {
        // eslint-disable-next-line no-console
        console.info(
          "[atendimento:latencia]",
          JSON.stringify(
            linhaLog({
              traceId: r.traceId,
              conversationId: r.conversationId,
              etapa: "total",
              durationMs: r.totalMs,
              status,
              fluxo: r.fluxo,
            }),
          ),
          "\n" + formatarResumo(r),
        );
      }
      return r;
    },
  });
}
