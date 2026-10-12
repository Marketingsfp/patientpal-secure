/**
 * Liga/desliga a Nina "que agenda" por clínica.
 *
 * Desde 11/10/2026 a Nina é informativa; a partir de 12/10/2026 ela agenda
 * somente os itens do catálogo marcados com "Nina pode agendar". As ferramentas
 * de agenda só aparecem quando a flag da clínica está ligada E existe ao menos
 * um item publicado marcado; a decisão por item fica no executor das ferramentas.
 * Sem nenhum item marcado, o atendimento é exatamente o informativo.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TRANSICAO_AGENDAMENTO_ATIVA } from "./transicao-agendamento";

export const FLAG_NINA_AGENDA = "nina_agenda_ativa";

async function flagDaClinica(clinicaId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("clinica_feature_flags")
    .select("ativo")
    .eq("clinica_id", clinicaId)
    .eq("flag_key", FLAG_NINA_AGENDA)
    .maybeSingle();
  // Falha de leitura não pode derrubar o atendimento: mantém o padrão ligado.
  if (error) return true;
  if (!data) return true;
  return Boolean(data.ativo);
}

export async function ferramentasAgendaAtivas(clinicaId: string): Promise<boolean> {
  if (!(await flagDaClinica(clinicaId))) return false;
  if (!TRANSICAO_AGENDAMENTO_ATIVA) return true;
  try {
    const { algumItemPodeAgendar } = await import("./regras-catalogo.server");
    return await algumItemPodeAgendar(clinicaId);
  } catch {
    // Catálogo indisponível: na dúvida a Nina não agenda.
    return false;
  }
}
