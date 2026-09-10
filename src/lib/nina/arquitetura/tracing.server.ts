/**
 * FASE 2 — gravação do tracing (server-only).
 *
 * Regras:
 *  - a gravação nunca é aguardada pelo atendimento (fire-and-forget);
 *  - qualquer falha é apenas logada;
 *  - só entram eventos já sanitizados pelo módulo puro.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { EventoTrace, Rastro } from "./tracing";

/** Insere os eventos do trace. Best-effort: nunca lança. */
export async function gravarEventosTrace(
  clinicaId: string | null,
  eventos: EventoTrace[],
): Promise<number> {
  if (!eventos.length) return 0;
  try {
    const linhas = eventos.map((evento) => ({
      clinica_id: clinicaId,
      trace_id: evento.trace_id,
      execution_id: evento.execution_id,
      conversation_id: evento.conversation_id,
      message_id: evento.message_id,
      cycle_id: evento.cycle_id,
      node_id: evento.node_id,
      event_type: evento.event_type,
      started_at: evento.started_at,
      finished_at: evento.finished_at,
      duration_ms: evento.duration_ms,
      status: evento.status,
      metadata: evento.metadata,
    }));
    const { error } = await supabaseAdmin.from("nina_trace_eventos").insert(linhas as never);
    if (error) {
      console.warn("[nina-tracing] falha ao gravar eventos:", error.message);
      return 0;
    }
    return linhas.length;
  } catch (e) {
    console.warn("[nina-tracing] erro inesperado:", e instanceof Error ? e.message : e);
    return 0;
  }
}

/**
 * Esvazia o rastro e grava em segundo plano. Retorna imediatamente para não
 * atrasar a resposta ao paciente.
 *
 * ATENÇÃO: no runtime de deploy (worker serverless) a requisição pode ser
 * encerrada logo depois, e a gravação em segundo plano é perdida. Para o
 * rastro do turno use `descarregarRastroAguardando`.
 */
export function descarregarRastro(clinicaId: string | null, rastro: Rastro): void {
  try {
    const eventos = rastro.drenar();
    if (!eventos.length) return;
    void gravarEventosTrace(clinicaId, eventos);
  } catch {
    /* observabilidade nunca interrompe o atendimento */
  }
}

/**
 * FASE 1 (Rastreabilidade) — mesma drenagem, porém AGUARDADA dentro da
 * requisição. Usada no fim do turno da Nina para que a evidência exista mesmo
 * quando o worker encerra assim que o handler devolve a resposta.
 */
export async function descarregarRastroAguardando(
  clinicaId: string | null,
  rastro: Rastro,
): Promise<number> {
  try {
    const eventos = rastro.drenar();
    if (!eventos.length) return 0;
    return await gravarEventosTrace(clinicaId, eventos);
  } catch {
    /* observabilidade nunca interrompe o atendimento */
    return 0;
  }
}

/** Lê o trace completo de uma execução, na ordem em que aconteceu. */
export async function lerTrace(traceId: string): Promise<EventoTrace[]> {
  const { data, error } = await supabaseAdmin
    .from("nina_trace_eventos")
    .select(
      "trace_id,execution_id,conversation_id,message_id,cycle_id,node_id,event_type,started_at,finished_at,duration_ms,status,metadata",
    )
    .eq("trace_id", traceId)
    .order("started_at", { ascending: true })
    .limit(1000);
  if (error) {
    console.warn("[nina-tracing] falha ao ler trace:", error.message);
    return [];
  }
  return (data ?? []) as unknown as EventoTrace[];
}
