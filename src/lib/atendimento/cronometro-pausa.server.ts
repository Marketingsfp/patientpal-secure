import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { EstadoManualPresenca } from "./presenca-manual";

/** Leitura do histórico existente: Offline e cliques repetidos não encerram o contador. */
export async function consultarInicioCronometroPausa(
  db: SupabaseClient<Database>,
  args: { clinicaId: string; userId: string; estado: EstadoManualPresenca | null; versao: number },
): Promise<string | null> {
  if (!args.estado || args.estado === "ONLINE") return null;
  const base = () => db.from("atend_presenca_manual_log")
    .select("estado, versao, created_at")
    .eq("clinica_id", args.clinicaId)
    .eq("user_id", args.userId)
    // Reconstrói a mesma versão da presença, mesmo se outra aba gravar durante a leitura.
    .lte("versao", args.versao);
  const { data: online, error: erroOnline } = await base().eq("estado", "ONLINE")
    .order("versao", { ascending: false }).limit(1).maybeSingle();
  if (erroOnline) throw erroOnline;
  const { data: pausa, error: erroPausa } = await base().eq("estado", "PAUSA")
    .gt("versao", online?.versao ?? -1)
    .order("versao", { ascending: true }).limit(1).maybeSingle();
  if (erroPausa) throw erroPausa;
  return pausa?.created_at ?? null;
}

/** Uma falha de leitura do relógio não pode desfazer uma presença já confirmada. */
export async function lerInicioCronometroPausa(
  ...args: Parameters<typeof consultarInicioCronometroPausa>
): Promise<string | null | undefined> {
  try {
    return await consultarInicioCronometroPausa(...args);
  } catch {
    return undefined;
  }
}
