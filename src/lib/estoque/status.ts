/**
 * Regras de status de estoque, validade e consumo FEFO.
 * Regra de negócio: baixas consomem primeiro o lote que vence antes
 * (First Expired, First Out). Lotes sem validade são consumidos por último.
 */

export type StatusEstoque = "sem_estoque" | "minimo" | "normal";
export type StatusValidade = "vencido" | "vencendo" | "valido" | "sem_validade";

export const CATEGORIAS_ESTOQUE = [
  { value: "insumos", label: "Insumos" },
  { value: "anestesicos", label: "Anestésicos" },
  { value: "materiais", label: "Materiais" },
  { value: "medicamentos", label: "Medicamentos" },
  { value: "vacinas", label: "Vacinas" },
] as const;

export const MOTIVOS_BAIXA = [
  { value: "consumo", label: "Consumo na triagem/procedimento" },
  { value: "vencido", label: "Vencido" },
  { value: "avaria", label: "Avaria / danificado" },
  { value: "ajuste", label: "Ajuste de inventário" },
] as const;

export function labelCategoria(v: string | null | undefined): string {
  return CATEGORIAS_ESTOQUE.find((c) => c.value === v)?.label ?? "Insumos";
}

export function labelMotivo(v: string | null | undefined): string {
  return MOTIVOS_BAIXA.find((m) => m.value === v)?.label ?? "—";
}

export function statusEstoque(atual: number, minimo: number): StatusEstoque {
  if (atual <= 0) return "sem_estoque";
  if (minimo > 0 && atual <= minimo) return "minimo";
  return "normal";
}

export const STATUS_ESTOQUE_LABEL: Record<StatusEstoque, string> = {
  sem_estoque: "Sem estoque",
  minimo: "Estoque mínimo",
  normal: "Normal",
};

export const STATUS_ESTOQUE_CLASS: Record<StatusEstoque, string> = {
  sem_estoque: "bg-rose-500/15 text-rose-700 font-bold border-rose-500/25",
  minimo: "bg-amber-500/15 text-amber-700 font-semibold border-amber-500/25",
  normal: "bg-emerald-500/15 text-emerald-700 border-emerald-500/25",
};

/** Dias até vencer (negativo = já vencido). Usa data local, sem hora. */
export function diasParaVencer(validade: string | null | undefined, hoje = new Date()): number | null {
  if (!validade) return null;
  const [y, m, d] = validade.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const alvo = new Date(y, m - 1, d);
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo.getTime() - base.getTime()) / 86400000);
}

export function statusValidade(
  validade: string | null | undefined,
  janelaDias = 30,
  hoje = new Date(),
): StatusValidade {
  const dias = diasParaVencer(validade, hoje);
  if (dias === null) return "sem_validade";
  if (dias < 0) return "vencido";
  if (dias <= janelaDias) return "vencendo";
  return "valido";
}

export function fmtValidade(validade: string | null | undefined): string {
  if (!validade) return "—";
  const [y, m, d] = validade.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : "—";
}

export interface LoteBasico {
  id: string;
  lote: string | null;
  validade: string | null;
  quantidade: number;
}

export interface AlocacaoFefo {
  lote_id: string;
  lote: string | null;
  validade: string | null;
  quantidade: number;
}

/**
 * Distribui uma baixa entre os lotes seguindo FEFO.
 * Retorna as alocações e o que sobrou sem lote (quando não há saldo suficiente).
 */
export function alocarFefo(lotes: LoteBasico[], quantidade: number): {
  alocacoes: AlocacaoFefo[];
  restante: number;
} {
  const ordenados = [...lotes]
    .filter((l) => Number(l.quantidade) > 0)
    .sort((a, b) => {
      if (!a.validade && !b.validade) return 0;
      if (!a.validade) return 1;
      if (!b.validade) return -1;
      return a.validade < b.validade ? -1 : a.validade > b.validade ? 1 : 0;
    });

  const alocacoes: AlocacaoFefo[] = [];
  let restante = Math.max(0, quantidade);

  for (const l of ordenados) {
    if (restante <= 0) break;
    const usar = Math.min(Number(l.quantidade), restante);
    if (usar <= 0) continue;
    alocacoes.push({ lote_id: l.id, lote: l.lote, validade: l.validade, quantidade: usar });
    restante = Number((restante - usar).toFixed(4));
  }

  return { alocacoes, restante };
}
