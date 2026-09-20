export type ConversaTesteAlvo = {
  clinicaId: string;
  leadIndice?: number | null;
  conversaId?: string | null;
};

/** O relatório pode abrir um lead apenas na mesma clínica. */
export function leadDoRelatorio<
  T extends { id: string; indice: number; conversaId: string | null },
>(leads: T[], clinicaId: string | undefined, alvo: ConversaTesteAlvo | null | undefined): T | null {
  if (!alvo || !clinicaId || alvo.clinicaId !== clinicaId) return null;
  return (
    leads.find((lead) => Boolean(alvo.conversaId) && lead.conversaId === alvo.conversaId) ??
    leads.find((lead) => lead.indice === alvo.leadIndice) ??
    null
  );
}
