import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { EstadoManualPresenca } from "./presenca-manual";

/** Online e Offline encerram a pausa; cliques repetidos em Pausa preservam o início. */
export async function consultarInicioCronometroPausa(
  db: SupabaseClient<Database>,
  args: { clinicaId: string; userId: string; estado: EstadoManualPresenca | null; versao: number },
): Promise<string | null> {
  if (args.estado !== "PAUSA") return null;
  const base = () => db.from("atend_presenca_manual_log")
    .select("estado, versao, created_at")
    .eq("clinica_id", args.clinicaId)
    .eq("user_id", args.userId)
    // Reconstrói a mesma versão da presença, mesmo se outra aba gravar durante a leitura.
    .lte("versao", args.versao);
  const { data: encerramento, error: erroEncerramento } = await base().in("estado", ["ONLINE", "OFFLINE"])
    .order("versao", { ascending: false }).limit(1).maybeSingle();
  if (erroEncerramento) throw erroEncerramento;
  const { data: pausa, error: erroPausa } = await base().eq("estado", "PAUSA")
    .gt("versao", encerramento?.versao ?? -1)
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
