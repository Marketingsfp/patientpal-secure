import type { ChamadaIA, RegistrarChamadaIA } from "./auditoria-ia";

/** Não grava payloads, credenciais, imagens ou áudio. Cada retry tem seu próprio ID. */
export async function fetchComAuditoriaIA(
  url: string,
  init: RequestInit,
  dados: Pick<ChamadaIA, "finalidade" | "modelo"> &
    Partial<Pick<ChamadaIA, "caracteres" | "formato">>,
  registrar?: RegistrarChamadaIA,
): Promise<Response> {
  const inicio = Date.now();
  const chamada: ChamadaIA = {
    id: crypto.randomUUID(),
    ...dados,
    inicio: new Date(inicio).toISOString(),
    duracaoMs: 0,
    estado: "falhou",
    erro: null,
    consumoEntrada: null,
    consumoSaida: null,
    caracteres: dados.caracteres ?? null,
    formato: dados.formato ?? null,
  };
  try {
    const resposta = await fetch(url, init);
    chamada.estado = resposta.ok ? "concluido" : "falhou";
    chamada.erro = resposta.ok ? null : `HTTP ${resposta.status}`;
    if (resposta.ok && resposta.headers.get("content-type")?.includes("json")) {
      try {
        const json = await resposta.clone().json();
        const uso = json?.usage;
        const numero = (v: unknown) =>
          typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
        chamada.consumoEntrada = numero(uso?.prompt_tokens ?? uso?.input_tokens);
        chamada.consumoSaida = numero(uso?.completion_tokens ?? uso?.output_tokens);
      } catch {
        /* Consumo não informado ou resposta inválida; não inventar estimativa. */
      }
    }
    return resposta;
  } catch (e) {
    chamada.erro = e instanceof Error ? e.name : "Erro de rede";
    throw e;
  } finally {
    chamada.duracaoMs = Date.now() - inicio;
    try {
      await registrar?.(chamada);
    } catch {
      /* Auditoria nunca altera atendimento. */
    }
  }
}

export type VinculoChamadaIA = {
  clinicaId: string;
  conversaId: string | null;
  traceId: string;
  execucaoId?: string | null;
};

/** Vínculo explícito ou AsyncLocalStorage do núcleo, nunca proximidade de horário. */
export async function registrarEventoIATurno(
  node: string,
  metadata: Record<string, unknown>,
  vinculo?: VinculoChamadaIA,
  duracaoMs: number | null = null,
  inicio?: string,
) {
  try {
    const { registroTurnoAtual } = await import("./rastreio/turno.server");
    const turno = registroTurnoAtual();
    const alvo =
      vinculo ??
      (turno?.clinicaId
        ? {
            clinicaId: turno.clinicaId,
            conversaId: turno.conversaId,
            traceId: turno.turnoId,
            execucaoId: turno.execucaoId,
          }
        : null);
    if (!alvo?.traceId) return;
    const { gravarEventosTrace } = await import("./arquitetura/tracing.server");
    const { sanitizarMetadata } = await import("./arquitetura/tracing");
    const fim = new Date().toISOString();
    const evento: import("./arquitetura/tracing").EventoTrace = {
      trace_id: alvo.traceId,
      execution_id: alvo.execucaoId ?? alvo.traceId,
      conversation_id: alvo.conversaId,
      message_id: null,
      cycle_id: 0,
      node_id: node,
      event_type: metadata.estado === "falhou" ? "failed" : "completed",
      status: metadata.estado === "falhou" ? "error" : "ok",
      started_at: inicio ?? fim,
      finished_at: fim,
      duration_ms: duracaoMs,
      metadata: sanitizarMetadata(metadata),
    };
    if (!vinculo && turno) {
      // Evita I/O dentro do timeout do Jev; o núcleo persiste junto do resumo.
      (turno.eventosAuxiliares ??= []).push(evento);
    } else await gravarEventosTrace(alvo.clinicaId, [evento]);
  } catch {
    /* Best effort, inclusive fora do núcleo. */
  }
}

export async function registrarChamadaIATurno(chamada: ChamadaIA, vinculo?: VinculoChamadaIA) {
  await registrarEventoIATurno(
    "ai.auxiliary",
    { ...chamada },
    vinculo,
    chamada.duracaoMs,
    chamada.inicio,
  );
}
