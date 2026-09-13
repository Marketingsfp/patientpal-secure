/**
 * PREFLIGHT DO TESTE DE CARGA (server-only).
 *
 * REGRA DA HOMOLOGAÇÃO — o preflight NÃO reinicia lead nenhum. Reiniciar uma
 * sessão existente é ação exclusiva do botão "Resolver / Reiniciar teste".
 * Aqui só verificamos se cada participante já está com sessão limpa; quem
 * ainda tiver conversa/ciclo aberto é sinalizado ao operador, que decide se
 * reinicia manualmente. Nada aqui toca WhatsApp real nem produção.
 */
import { prepararLeads, type ResumoPreflight } from "@/lib/nina/carga-preflight";
import { carregarLead, type LeadRow } from "@/lib/nina/teste-console.server";

export const MENSAGEM_RESET_MANUAL =
  'Sessão em andamento: use "Resolver / Reiniciar teste" neste lead antes de iniciar.';

export async function prepararLeadsCarga(entrada: {
  admin: any;
  clinicaId: string;
  leads: LeadRow[];
  userId: string | null;
  paralelismo?: number;
}): Promise<ResumoPreflight> {
  return await prepararLeads<LeadRow>({
    leads: entrada.leads,
    paralelismo: entrada.paralelismo ?? 4,
    // "resetar" aqui é apenas a verificação: nunca escreve nada.
    resetar: async (lead) => {
      const atual = await carregarLead(entrada.admin, entrada.clinicaId, lead.id);
      if (atual.conversa_id || atual.ciclo_id) throw new Error(MENSAGEM_RESET_MANUAL);
      return { jaResolvida: true, cicloEncerrado: null, sessao: atual.sessao_seq };
    },
  });
}
