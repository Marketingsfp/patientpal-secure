/**
 * FASE 5 — gravação e leitura da telemetria da Nina (server-only).
 *
 * Gravação é best-effort: observabilidade NUNCA pode derrubar um atendimento.
 * Qualquer falha aqui é apenas logada no servidor.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  agregarMetricas,
  sanitizarRegistro,
  type Metricas,
  type RegistroExecucao,
} from "./telemetria";

export async function registrarExecucao(registro: RegistroExecucao): Promise<void> {
  try {
    const linha = sanitizarRegistro(registro as unknown as Record<string, unknown>);
    const { error } = await supabaseAdmin.from("nina_execucoes").insert(linha as never);
    if (error) console.warn("[nina-telemetria] falha ao gravar execução:", error.message);
  } catch (e) {
    console.warn("[nina-telemetria] erro inesperado:", e instanceof Error ? e.message : e);
  }
}

/** Métricas agregadas da clínica no período (padrão: últimos 7 dias). */
export async function metricasNina(
  clinicaId: string,
  desdeISO?: string,
): Promise<Metricas & { desde: string }> {
  const desde =
    desdeISO ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("nina_execucoes")
    .select(
      "clinica_id,conversation_id,perfil,model,thinking_level,route_reason,latency_ms,knowledge_status,tool_calls,success,error_category,handoff,input_tokens,output_tokens,retries",
    )
    .eq("clinica_id", clinicaId)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    console.warn("[nina-telemetria] falha ao ler métricas:", error.message);
    return { ...agregarMetricas([]), desde };
  }
  const registros = (data ?? []) as unknown as RegistroExecucao[];
  return { ...agregarMetricas(registros), desde };
}
