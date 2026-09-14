/**
 * FASE 2 — PREPARAÇÃO DOS LEADS (load test preflight).
 *
 * Antes da primeira mensagem, o início confirmado reinicia os 10 leads e
 * verifica a memória limpa. A retomada preserva baselines já preparados.
 * Só quando todos estiverem READY o teste começa.
 *
 * Este módulo é pura orquestração e decisão (sem banco), para poder ser testado
 * de ponta a ponta; a verificação é injetada por `carga-preflight.server.ts`.
 */

export type SituacaoPreflight = "READY" | "FAILED";

export type ResultadoPreflightLead = {
  leadId: string;
  indice: number;
  situacao: SituacaoPreflight;
  /** true quando o lead já estava limpo (nada foi encerrado). */
  jaLimpo: boolean;
  /** Ciclo de teste anterior que foi encerrado neste reset, quando havia. */
  cicloEncerrado?: string | null;
  /** Sessão (telefone virtual) do lead depois do reset. */
  sessao?: number | null;
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

/** FASE 3 — quantos leads são preparados por chamada (progresso visual). */
export const LOTE_PREFLIGHT = 3;

/** Baseline gravado após verificar a sessão limpa e antes do primeiro disparo. */
export type BaselineLead = {
  runId: string;
  leadId: string;
  leadIndice: number;
  preparedAt: string;
  /** Memória limpa confirmada depois do reset inicial ou verificação idempotente. */
  memoryReset: true;
  previousCycleResolved: true;
  ready: true;
  jaLimpo: boolean;
  /** Ciclo anterior encerrado neste reset (null quando o lead já estava limpo). */
  cicloEncerrado?: string | null;
  /** Sessão/telefone virtual do lead depois do reset. */
  sessao?: number | null;
};

export function baselineLead(entrada: {
  runId: string;
  resultado: ResultadoPreflightLead;
  agora?: Date;
}): BaselineLead {
  return {
    runId: entrada.runId,
    leadId: entrada.resultado.leadId,
    leadIndice: entrada.resultado.indice,
    preparedAt: (entrada.agora ?? new Date()).toISOString(),
    memoryReset: true,
    previousCycleResolved: true,
    ready: true,
    jaLimpo: entrada.resultado.jaLimpo,
    cicloEncerrado: entrada.resultado.cicloEncerrado ?? null,
    sessao: entrada.resultado.sessao ?? null,
  };
}

/** FASE 4 — métricas técnicas do preflight, exibidas nos detalhes do run. */
export type MetricasPreflight = {
  leadsPreparados: number;
  leadsTotal: number;
  falhas: number;
  memoriasResetadas: number;
  ciclosAnterioresEncerrados: number;
};

export function metricasPreflight(baselines: BaselineLead[], total?: number): MetricasPreflight {
  return {
    leadsPreparados: baselines.length,
    leadsTotal: total ?? baselines.length,
    falhas: Math.max(0, (total ?? baselines.length) - baselines.length),
    memoriasResetadas: baselines.filter((b) => !b.jaLimpo).length,
    ciclosAnterioresEncerrados: baselines.filter((b) => Boolean(b.cicloEncerrado)).length,
  };
}

/** Idempotência: leads que ainda não têm baseline READY neste run. */
export function pendentesPreflight<T extends LeadMinimo>(
  leads: T[],
  baselines: { leadId: string }[],
): T[] {
  const prontos = new Set(baselines.map((b) => b.leadId));
  return leads.filter((l) => !prontos.has(l.id));
}

/** Mensagem de preparação interrompida, no formato pedido pelo operador. */
export function descreverPreparacaoParcial(prontos: number, total: number): string {
  const falharam = Math.max(0, total - prontos);
  const plural = falharam === 1 ? "1 lead não está pronto" : `${falharam} leads não estão prontos`;
  return `${prontos} de ${total} leads estão prontos. O teste não foi iniciado porque ${plural}. Confira os motivos abaixo; nenhuma mensagem é enviada antes de todos estarem prontos.`;
}

/**
 * Verifica os participantes com paralelismo limitado e devolve o resumo.
 * Um lead só é marcado READY depois da verificação terminar com sucesso.
 */
export async function prepararLeads<T extends LeadMinimo>(entrada: {
  leads: T[];
  /** Reset inicial autorizado ou verificação de sessão, conforme o chamador. */
  resetar: (
    lead: T,
  ) => Promise<{ jaResolvida?: boolean; cicloEncerrado?: string | null; sessao?: number | null }>;
  /** Quantas verificações simultâneas (padrão 4). */
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
          cicloEncerrado: r?.cicloEncerrado ?? null,
          sessao: r?.sessao ?? null,
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
