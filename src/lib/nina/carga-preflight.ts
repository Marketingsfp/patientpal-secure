/**
 * FASE 2 — PREPARAÇÃO DOS LEADS (load test preflight).
 *
 * Antes da PRIMEIRA mensagem de um novo teste de carga, todos os leads que vão
 * participar daquela execução passam por um reset real e confirmado. Só quando
 * TODOS estiverem READY o teste pode começar.
 *
 * Este módulo é pura orquestração e decisão (sem banco), para poder ser testado
 * de ponta a ponta; o reset real é injetado por `carga-preflight.server.ts`.
 */

export type SituacaoPreflight = "READY" | "FAILED";

export type ResultadoPreflightLead = {
  leadId: string;
  indice: number;
  situacao: SituacaoPreflight;
  /** true quando o lead já estava limpo (nada foi encerrado). */
  jaLimpo: boolean;
  /** Motivo técnico curto, apenas quando falhou. */
  erro?: string;
};

export type ResumoPreflight = {
  /** Gate do teste: só é `true` quando todos os participantes ficaram READY. */
  pronto: boolean;
  total: number;
  prontos: number;
  falhas: ResultadoPreflightLead[];
  resultados: ResultadoPreflightLead[];
};

export const MENSAGEM_FALHA_PREFLIGHT = "Não foi possível preparar todos os Leads de Teste.";

/** Participantes reais daquela execução (nunca todos os leads da clínica). */
export function leadsParticipantes<T>(leads: T[], leadsAtivos: number): T[] {
  const quantidade = Math.max(0, Math.min(Math.trunc(leadsAtivos), leads.length));
  return leads.slice(0, quantidade);
}

/** Texto de erro mostrado ao operador, sem dados sensíveis. */
export function descreverFalhaPreflight(resumo: ResumoPreflight): string {
  const detalhes = resumo.falhas
    .map((f) => `Lead ${String(f.indice).padStart(2, "0")}: ${f.erro ?? "falha desconhecida"}`)
    .join("; ");
  return detalhes ? `${MENSAGEM_FALHA_PREFLIGHT} ${detalhes}` : MENSAGEM_FALHA_PREFLIGHT;
}

type LeadMinimo = { id: string; indice: number };

/**
 * Executa o reset de todos os participantes com paralelismo limitado e devolve
 * o resumo. Um lead só é marcado READY DEPOIS de o reset ter terminado e sido
 * confirmado — nunca antes.
 */
export async function prepararLeads<T extends LeadMinimo>(entrada: {
  leads: T[];
  resetar: (lead: T) => Promise<{ jaResolvida?: boolean }>;
  /** Quantos resets simultâneos (padrão 4). */
  paralelismo?: number;
}): Promise<ResumoPreflight> {
  const leads = entrada.leads;
  const limite = Math.max(1, entrada.paralelismo ?? 4);
  const resultados: ResultadoPreflightLead[] = new Array(leads.length);

  let proximo = 0;
  const trabalhador = async () => {
    for (;;) {
      const i = proximo++;
      if (i >= leads.length) return;
      const lead = leads[i]!;
      try {
        const r = await entrada.resetar(lead);
        resultados[i] = {
          leadId: lead.id,
          indice: lead.indice,
          situacao: "READY",
          jaLimpo: Boolean(r?.jaResolvida),
        };
      } catch (e) {
        resultados[i] = {
          leadId: lead.id,
          indice: lead.indice,
          situacao: "FAILED",
          jaLimpo: false,
          erro: String((e as Error)?.message ?? e).slice(0, 200),
        };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(limite, leads.length) }, trabalhador));

  const finais = resultados.filter(Boolean) as ResultadoPreflightLead[];
  const falhas = finais.filter((r) => r.situacao === "FAILED");
  return {
    pronto: finais.length === leads.length && falhas.length === 0,
    total: leads.length,
    prontos: finais.filter((r) => r.situacao === "READY").length,
    falhas,
    resultados: finais,
  };
}
