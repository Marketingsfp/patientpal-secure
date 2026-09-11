/**
 * FASE 2 — execução real do preflight do teste de carga (server-only).
 *
 * Reutiliza a rotina canônica de reset da homologação (`resetarLeadTeste`),
 * a mesma acionada pelo botão "Resolver" do console. Nada aqui toca WhatsApp
 * real nem conversas de produção: só os leads sintéticos participantes.
 */
import { prepararLeads, type ResumoPreflight } from "@/lib/nina/carga-preflight";
import { resetarLeadTeste, type LeadRow } from "@/lib/nina/teste-console.server";

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
    resetar: (lead) =>
      resetarLeadTeste(entrada.admin, {
        clinicaId: entrada.clinicaId,
        leadId: lead.id,
        userId: entrada.userId,
        origem: "carga_preflight",
      }),
  });
}
