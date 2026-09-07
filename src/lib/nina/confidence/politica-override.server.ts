/**
 * FASE 9 — política efetiva por clínica (server-only).
 *
 * A política padrão só muda quando existe uma proposta que:
 *   1. foi criada como sugestão,
 *   2. foi APROVADA por uma pessoa,
 *   3. foi APLICADA por uma pessoa.
 *
 * A Nina nunca escreve aqui. Qualquer ajuste inválido ou que enfraqueça
 * bloqueadores absolutos é descartado e a política padrão prevalece.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { mesclarPolitica, type AjustePolitica } from "./calibracao";
import { POLITICA_PADRAO, type PoliticaConfianca } from "./policy";

const TTL_MS = 60_000;
const cache = new Map<string, { em: number; politica: PoliticaConfianca }>();

export async function politicaEfetiva(clinicaId: string): Promise<PoliticaConfianca> {
  const hit = cache.get(clinicaId);
  if (hit && Date.now() - hit.em < TTL_MS) return hit.politica;

  let politica = POLITICA_PADRAO;
  try {
    const { data, error } = await supabaseAdmin
      .from("nina_confianca_propostas")
      .select("tipo, alvo, valor_sugerido, aplicado_em, aplicado_por")
      .eq("clinica_id", clinicaId)
      .eq("status", "aplicada")
      .order("aplicado_em", { ascending: true });
    if (!error && data && data.length > 0) {
      const ajustes: AjustePolitica[] = [];
      for (const r of data) {
        if (!r.aplicado_por) continue; // exige responsável humano
        if (r.tipo !== "AJUSTAR_PESO" && r.tipo !== "AJUSTAR_LIMITE") continue;
        const valor = Number(r.valor_sugerido);
        if (!Number.isFinite(valor)) continue;
        ajustes.push({ alvo: r.alvo, valor });
      }
      if (ajustes.length > 0) {
        try {
          politica = mesclarPolitica(POLITICA_PADRAO, ajustes);
        } catch {
          politica = POLITICA_PADRAO; // ajuste inválido: mantém o padrão
        }
      }
    }
  } catch {
    politica = POLITICA_PADRAO;
  }

  cache.set(clinicaId, { em: Date.now(), politica });
  return politica;
}

export function limparCachePolitica(clinicaId?: string): void {
  if (clinicaId) cache.delete(clinicaId);
  else cache.clear();
}
