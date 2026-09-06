/**
 * FASE 6 — chave de ativação controlada da análise por IA.
 *
 * Desligar a análise NÃO desliga o reporte de erro nem a consulta da
 * auditoria: apenas impede novas chamadas pagas ao modelo avaliador.
 * Sem linha gravada = ligado (comportamento atual preservado).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const FLAG_ANALISE_IA = "nina_analise_ia_ativa";

export const MSG_ANALISE_DESATIVADA =
  "Análise com IA desativada para esta clínica. O reporte e a auditoria continuam disponíveis.";

export async function analiseIAAtivaNaClinica(clinicaId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("clinica_feature_flags")
    .select("ativo")
    .eq("clinica_id", clinicaId)
    .eq("flag_key", FLAG_ANALISE_IA)
    .maybeSingle();
  // Falha de leitura não pode derrubar a revisão: mantém o padrão ligado.
  if (error) return true;
  if (!data) return true;
  return Boolean(data.ativo);
}
