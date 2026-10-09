/**
 * Jev — Etapa C: limites ajustáveis por clínica e relatório de calibragem.
 * Puro (sem rede). Sem configuração gravada, valem os padrões aprovados.
 * Possível regra de negócio — validar com a equipe da clínica.
 */
export type LimitesJev = {
  urgencia: number;
  pedido_atendente: number;
  irritacao: number;
  conferencia: number;
  escolha: number;
};

export const LIMITES_JEV_PADRAO: LimitesJev = {
  urgencia: 0.5,
  pedido_atendente: 0.7,
  irritacao: 0.8,
  conferencia: 0.7,
  escolha: 0.8,
};

export const LIMITE_MIN = 0.3;
export const LIMITE_MAX = 0.95;

export const ROTULO_LIMITE: Record<keyof LimitesJev, string> = {
  urgencia: "Urgência clínica (transfere com prioridade alta)",
  pedido_atendente: "Pedido para falar com atendente",
  irritacao: "Paciente irritado",
  conferencia: "Conferência antes do envio (segura a resposta)",
  escolha: "Certeza mínima para entender o “sim” e o horário",
};

/** Valor fora da faixa ou ausente = padrão. Nunca aceita limite extremo. */
export function normalizarLimites(
  bruto: Partial<Record<keyof LimitesJev, unknown>> | null | undefined,
): LimitesJev {
  const out = { ...LIMITES_JEV_PADRAO };
  for (const k of Object.keys(out) as (keyof LimitesJev)[]) {
    const v = Number(bruto?.[k]);
    if (
      bruto?.[k] !== null &&
      bruto?.[k] !== undefined &&
      Number.isFinite(v) &&
      v >= LIMITE_MIN &&
      v <= LIMITE_MAX
    )
      out[k] = v;
  }
  return out;
}

/** Sinais de transferência medidos no relatório (gravados nas decisões da fase 2). */
export const SINAIS_CALIBRAGEM = [
  "urgencia",
  "pedido_atendente",
  "irritacao",
  "entendimento",
] as const;
export type SinalCalibragem = (typeof SINAIS_CALIBRAGEM)[number];

export type FaixaCalibragem = { de: number; ate: number; casos: number };
export type RelatorioSinal = { sinal: SinalCalibragem; total: number; faixas: FaixaCalibragem[] };

/** Conta casos por faixa de 0,1 da pontuação de cada sinal. */
export function relatorioCalibragem(
  respostas: Array<Record<string, unknown> | null>,
): RelatorioSinal[] {
  return SINAIS_CALIBRAGEM.map((sinal) => {
    const faixas: FaixaCalibragem[] = Array.from({ length: 10 }, (_, i) => ({
      de: i / 10,
      ate: (i + 1) / 10,
      casos: 0,
    }));
    let total = 0;
    for (const r of respostas) {
      const v = (r?.[sinal] as { noul?: unknown } | undefined)?.noul;
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      faixas[Math.min(9, Math.max(0, Math.floor(v * 10)))]!.casos++;
      total++;
    }
    return { sinal, total, faixas };
  });
}

/** Quantos casos passariam do limite informado (para simular um limite novo). */
export function casosAcima(rel: RelatorioSinal, limite: number): number {
  return rel.faixas.filter((f) => f.de >= limite - 1e-9).reduce((s, f) => s + f.casos, 0);
}
