/** Helpers para regras de preço de convênios do Cartão Benefícios. */

export interface CbRegra {
  id: string;
  convenio_id: string;
  especialidade_id: string | null;
  /** Serviço específico (procedimento) ao qual esta regra se aplica. Null = qualquer serviço. */
  procedimento_id?: string | null;
  tipo: string | null;
  modo: string; // "valor_fixo" | "percentual_desconto"
  valor: number | null;
  percentual: number | null;
  prioridade: number;
  ativo?: boolean;
  limite_qtd?: number | null;
  limite_periodo?: string | null; // "dia" | "semana" | "mes"
  limite_escopo?: string | null; // "contrato" | "paciente"
  excedente_modo?: string | null; // "percentual_particular" | "valor_fixo" | "particular" | "bloquear"
  excedente_percentual?: number | null;
  excedente_valor?: number | null;
  /**
   * Nº de mensalidades pagas que o contrato precisa ter antes desta regra
   * (desconto do convênio) valer. 0 = imediato.
   */
  carencia_mensalidades?: number | null;
  /** Regra é cortesia — exibida como "Gratuito" no sistema. */
  gratuito?: boolean | null;
}

/** Retorna true se o contrato já cumpriu a carência exigida pela regra. */
export function carenciaCumprida(regra: CbRegra | null, mensalidadesPagas: number): boolean {
  if (!regra) return true;
  const min = Number(regra.carencia_mensalidades ?? 0) || 0;
  if (min <= 0) return true;
  return mensalidadesPagas >= min;
}

/**
 * Escolhe a regra mais específica e de maior prioridade para a combinação
 * (procedimento, especialidade, tipo). Especificidade: serviço específico >
 * especialidade+tipo > especialidade > tipo > genérica.
 */
export function findRegra(
  regras: CbRegra[],
  especialidadeId: string | null | undefined,
  tipo: string | null | undefined,
  procedimentoId?: string | null,
): CbRegra | null {
  const tipoNorm = (tipo ?? "").toLowerCase() || null;
  const espId = especialidadeId || null;
  const procId = procedimentoId || null;
  const candidates = regras.filter((r) => {
    if (r.ativo === false) return false;
    if (r.procedimento_id) {
      // regra específica por serviço só bate se o serviço confere
      if (!procId || r.procedimento_id !== procId) return false;
      return true;
    }
    if (r.especialidade_id && r.especialidade_id !== espId) return false;
    if (r.tipo && r.tipo.toLowerCase() !== tipoNorm) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  const score = (r: CbRegra) =>
    (r.procedimento_id ? 100 : 0) +
    (r.especialidade_id ? 10 : 0) +
    (r.tipo ? 5 : 0) +
    (r.prioridade || 0) * 0.01;
  return candidates.slice().sort((a, b) => score(b) - score(a))[0];
}

export function computeValor(
  regra: CbRegra | null,
  baseDinheiro: number,
  baseOutros: number,
): { dinheiro: number; outros: number } | null {
  if (!regra) return null;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  if (regra.modo === "valor_fixo") {
    const v = Number(regra.valor) || 0;
    return { dinheiro: round2(v), outros: round2(v) };
  }
  if (regra.modo === "percentual_desconto") {
    const p = Number(regra.percentual) || 0;
    const k = 1 - p / 100;
    return { dinheiro: round2(baseDinheiro * k), outros: round2(baseOutros * k) };
  }
  return null;
}
