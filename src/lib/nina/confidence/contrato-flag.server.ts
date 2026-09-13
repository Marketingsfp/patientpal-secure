/**
 * FASE 1 — seleção EXPLÍCITA entre a leitura atual das instruções e o novo
 * contrato de regras. Padrão seguro: `atual`.
 *
 * Enquanto a clínica não gravar a flag, nada muda no atendimento: o contrato
 * novo só é usado por quem pedir, e uma implementação parcial nunca é ligada
 * sozinha em produção.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const FLAG_CONTRATO_REGRAS = "nina_contrato_regras";

/**
 * - `atual`: leitura em vigor (`extrairRegrasPublicadas`).
 * - `sombra`: compila o contrato novo e registra, sem influenciar a decisão.
 * - `novo`: contrato novo passa a valer (somente após as próximas fases).
 */
export type ImplementacaoRegras = "atual" | "sombra" | "novo";

export function implementacaoDeFlag(valor: unknown, ativo: boolean): ImplementacaoRegras {
  if (!ativo) return "atual";
  return valor === "novo" || valor === "sombra" ? valor : "atual";
}

export async function implementacaoRegras(clinicaId: string): Promise<ImplementacaoRegras> {
  try {
    const { data, error } = await supabaseAdmin
      .from("clinica_feature_flags")
      .select("ativo, config")
      .eq("clinica_id", clinicaId)
      .eq("flag_key", FLAG_CONTRATO_REGRAS)
      .maybeSingle();
    if (error || !data) return "atual";
    const cfg = (data.config ?? null) as { implementacao?: unknown } | null;
    return implementacaoDeFlag(cfg?.implementacao, data.ativo === true);
  } catch {
    return "atual";
  }
}
