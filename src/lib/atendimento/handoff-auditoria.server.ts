/**
 * FASE 6 (server) — persistência e leitura da trilha de auditoria do handoff.
 *
 * Custo: nada disso entra no caminho normal das mensagens. As consultas só
 * acontecem QUANDO existe handoff (uma gravação) ou quando alguém pede a
 * trilha explicitamente (auditoria / Test Runner).
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  auditoriaCompleta,
  montarRegistroAuditoriaHandoff,
  type EntradaAuditoriaHandoff,
  type RegistroAuditoriaHandoff,
} from "./handoff-auditoria";

/** Evento único que guarda o registro consolidado. */
export const EVENTO_AUDITORIA_HANDOFF = "HANDOFF_AUDITORIA";

/**
 * Grava (uma única inserção) o registro consolidado do handoff.
 * Nunca lança: auditoria não pode derrubar a transferência.
 */
export async function registrarAuditoriaHandoff(args: {
  clinicaId: string;
  entrada: EntradaAuditoriaHandoff;
}): Promise<RegistroAuditoriaHandoff | null> {
  const registro = montarRegistroAuditoriaHandoff(args.entrada);
  const completa = auditoriaCompleta(registro);
  try {
    const { error } = await supabaseAdmin.from("atend_conversa_eventos").insert({
      clinica_id: args.clinicaId,
      conversa_id: registro.conversation_id,
      evento: EVENTO_AUDITORIA_HANDOFF,
      motivo: registro.protocol_number
        ? `Handoff auditado · Protocolo ${registro.protocol_number}`
        : "Handoff auditado sem protocolo",
      detalhes: {
        ...registro,
        auditoria_completa: completa.ok,
        auditoria_faltando: completa.faltando,
      } as never,
    });
    if (error) {
      console.error("[handoff-auditoria] falha ao gravar", error.message);
      return registro;
    }
  } catch (e) {
    console.error("[handoff-auditoria] erro inesperado", e);
  }
  return registro;
}

/** Trilha completa dos handoffs de uma conversa (mais recente primeiro). */
export async function lerTrilhaHandoff(args: {
  clinicaId: string;
  conversaId: string;
  limite?: number;
}): Promise<RegistroAuditoriaHandoff[]> {
  const { data, error } = await supabaseAdmin
    .from("atend_conversa_eventos")
    .select("detalhes, created_at")
    .eq("clinica_id", args.clinicaId)
    .eq("conversa_id", args.conversaId)
    .eq("evento", EVENTO_AUDITORIA_HANDOFF)
    .order("created_at", { ascending: false })
    .limit(args.limite ?? 20);
  if (error) {
    console.error("[handoff-auditoria] falha ao ler trilha", error.message);
    return [];
  }
  return ((data ?? []) as Array<{ detalhes: unknown }>)
    .map((l) => l.detalhes as RegistroAuditoriaHandoff | null)
    .filter((r): r is RegistroAuditoriaHandoff => Boolean(r?.conversation_id));
}
