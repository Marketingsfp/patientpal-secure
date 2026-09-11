/**
 * FASE 4 — APRESENTAÇÃO DOS ESTADOS DO RASTREAMENTO (módulo puro).
 *
 * O contrato do tracing (`STATUS_EVENTO`) usa: running | ok | error |
 * skipped | cancelled. Este módulo traduz esse contrato para texto + símbolo,
 * sem inventar estado e sem depender de cor para comunicar o resultado.
 *
 * Regras:
 *  - ✔ é reservado para sucesso CONFIRMADO da etapa;
 *  - estado desconhecido aparece como desconhecido, nunca como sucesso;
 *  - não há tradução de valores legados: o banco só registra os valores do
 *    contrato atual (verificado antes desta fase);
 *  - o dado original do evento é preservado; aqui só existe apresentação.
 */
import { STATUS_EVENTO, type StatusEvento } from "./tracing";

export type ApresentacaoEstadoEvento = {
  /** Símbolo textual — nunca ✔ fora de sucesso confirmado. */
  simbolo: string;
  /** Texto do estado, para quem não distingue cor. */
  rotulo: string;
  /** Classe de cor (reforço, nunca a única indicação). */
  classe: string;
  /** Valor exatamente como veio do evento. */
  original: string;
};

const APRESENTACAO: Record<StatusEvento, Omit<ApresentacaoEstadoEvento, "original">> = {
  ok: { simbolo: "✔", rotulo: "concluída", classe: "text-emerald-600" },
  error: { simbolo: "✖", rotulo: "falhou", classe: "text-destructive" },
  running: { simbolo: "◔", rotulo: "em andamento", classe: "text-amber-600" },
  skipped: { simbolo: "⊘", rotulo: "ignorada", classe: "text-muted-foreground" },
  cancelled: { simbolo: "⊗", rotulo: "cancelada", classe: "text-muted-foreground" },
};

export function estadoConhecido(status: unknown): status is StatusEvento {
  return typeof status === "string" && (STATUS_EVENTO as readonly string[]).includes(status);
}

export function apresentarEstadoEvento(status: unknown): ApresentacaoEstadoEvento {
  const original = status == null || status === "" ? "—" : String(status);
  if (!estadoConhecido(status)) {
    return {
      simbolo: "?",
      rotulo: "estado desconhecido",
      classe: "text-amber-600",
      original,
    };
  }
  return { ...APRESENTACAO[status], original };
}

/**
 * Um evento de INÍCIO não é uma execução concluída. Dois eventos do mesmo
 * node (started + completed) descrevem uma execução só — o texto deixa isso
 * explícito em vez de mostrar duas conclusões.
 */
export function descreverEventoRastreio(ev: {
  event_type?: unknown;
  status?: unknown;
}): { simbolo: string; rotulo: string; classe: string } {
  const estado = apresentarEstadoEvento(ev.status);
  if (ev.event_type === "started") {
    return {
      simbolo: estado.simbolo === "✔" ? "▸" : estado.simbolo,
      rotulo: `início · ${estado.rotulo}`,
      classe: estado.classe,
    };
  }
  return { simbolo: estado.simbolo, rotulo: estado.rotulo, classe: estado.classe };
}
