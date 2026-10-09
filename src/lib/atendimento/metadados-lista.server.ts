import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { carregarAberturasInbox } from "./conversa-nova.server";
import type { ConversaNova } from "./conversa-nova";

/** Recebe apenas linhas já autorizadas. As duas leituras não dependem entre si. */
export async function carregarMetadadosLista<T extends ConversaNova>(
  db: SupabaseClient<Database>,
  clinicaId: string,
  userId: string,
  linhas: T[],
) {
  const tempos: Record<string, number> = {};
  const [naoLidas, comAberturas] = await Promise.all([
    (async () => {
      const inicio = Date.now();
      if (!linhas.length) return new Map<string, number>();
      const { data, error } = await db.rpc("atend_nao_lidas", {
        _clinica_id: clinicaId,
        _conversa_ids: linhas.map((r) => r.id),
      });
      if (error) throw new Error(error.message);
      tempos.nao_lidas = Date.now() - inicio;
      return new Map((data ?? []).map((c) => [c.conversa_id, Number(c.nao_lidas) || 0]));
    })(),
    (async () => {
      const inicio = Date.now();
      const rows = await carregarAberturasInbox(db, clinicaId, linhas, userId);
      tempos.aberturas = Date.now() - inicio;
      return rows;
    })(),
  ]);
  return { naoLidas, comAberturas, tempos };
}
