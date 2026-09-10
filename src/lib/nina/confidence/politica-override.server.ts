/**
 * FASE 9 / FASE 6 — configuração efetiva de confiança por clínica (server-only).
 *
 * A política padrão só muda quando existe uma proposta que:
 *   1. foi criada como sugestão,
 *   2. foi APROVADA por uma pessoa,
 *   3. foi APLICADA por uma pessoa.
 *
 * A Nina nunca escreve aqui. Ajuste inválido é descartado individualmente,
 * preservando os ajustes válidos — não se joga fora a configuração inteira.
 *
 * FALHA DE LEITURA (FASE 6): não voltamos silenciosamente ao padrão como se a
 * política da clínica seguisse ativa. Mantemos a última configuração conhecida
 * por até `JANELA_DEGRADADA_MS`, marcada como `cache_vencido`; passado esse
 * prazo, cai para `fallback_padrao` — sempre declarado e auditável.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  montarConfiguracao,
  type ConfiguracaoEfetiva,
  type PropostaParaConfiguracao,
} from "./configuracao";
import type { PoliticaConfianca } from "./policy";

const TTL_MS = 60_000;
/** Por quanto tempo a última configuração conhecida ainda pode ser usada. */
export const JANELA_DEGRADADA_MS = 10 * 60_000;

const cache = new Map<string, { em: number; cfg: ConfiguracaoEfetiva }>();

export async function configuracaoEfetiva(clinicaId: string): Promise<ConfiguracaoEfetiva> {
  const hit = cache.get(clinicaId);
  if (hit && Date.now() - hit.em < TTL_MS) return hit.cfg;

  let propostas: PropostaParaConfiguracao[] | null = null;
  let motivoFalha: string | null = null;
  try {
    const { data, error } = await supabaseAdmin
      .from("nina_confianca_propostas")
      .select("id, tipo, alvo, valor_sugerido, aplicado_em, aplicado_por")
      .eq("clinica_id", clinicaId)
      .eq("status", "aplicada")
      .order("aplicado_em", { ascending: true });
    if (error) motivoFalha = `leitura_falhou: ${error.message}`;
    else
      propostas = (data ?? []).map((r) => ({
        id: String((r as Record<string, unknown>)["id"] ?? ""),
        tipo: String((r as Record<string, unknown>)["tipo"] ?? ""),
        alvo: String((r as Record<string, unknown>)["alvo"] ?? ""),
        valor: (r as Record<string, unknown>)["valor_sugerido"],
        aplicadoEm: (r as Record<string, unknown>)["aplicado_em"]
          ? String((r as Record<string, unknown>)["aplicado_em"])
          : null,
        aplicadoPor: (r as Record<string, unknown>)["aplicado_por"]
          ? String((r as Record<string, unknown>)["aplicado_por"])
          : null,
      }));
  } catch (e) {
    motivoFalha = `leitura_falhou: ${e instanceof Error ? e.message : "erro desconhecido"}`;
  }

  if (propostas) {
    const cfg = montarConfiguracao(propostas);
    cache.set(clinicaId, { em: Date.now(), cfg });
    return cfg;
  }

  // ---- leitura indisponível: comportamento explícito, nunca silencioso ----
  if (hit && Date.now() - hit.em < JANELA_DEGRADADA_MS) {
    return {
      ...hit.cfg,
      origem: "cache_vencido",
      degradada: true,
      motivoDegradacao: motivoFalha ?? "leitura_indisponivel",
    };
  }
  return montarConfiguracao([], {
    origemFalha: "fallback_padrao",
    motivoFalha: motivoFalha ?? "leitura_indisponivel",
  });
}

/** Compatibilidade: só os parâmetros vigentes. */
export async function politicaEfetiva(clinicaId: string): Promise<PoliticaConfianca> {
  return (await configuracaoEfetiva(clinicaId)).parametros;
}

export function limparCachePolitica(clinicaId?: string): void {
  if (clinicaId) cache.delete(clinicaId);
  else cache.clear();
}
