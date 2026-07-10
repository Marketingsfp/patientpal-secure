import type { OrcV2 } from "./orcamento-card";

export type DerivedStatus = "aberto" | "convertido" | "expirado" | "cancelado";

/** Deriva o status visual do orçamento a partir dos dados brutos. */
export function deriveStatus(o: OrcV2): DerivedStatus {
  if ((o.status ?? "").toLowerCase() === "cancelado") return "cancelado";
  if ((o.agendamentos_total ?? 0) > 0) return "convertido";
  if (o.validade_dias && o.validade_dias > 0) {
    const exp = new Date(o.created_at).getTime() + o.validade_dias * 86_400_000;
    if (exp < Date.now()) return "expirado";
  }
  return "aberto";
}

export const STATUS_META: Record<
  DerivedStatus,
  { label: string; dot: string; badge: string; border: string }
> = {
  aberto: {
    label: "Aberto",
    dot: "bg-amber-500",
    badge:
      "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800",
    border: "border-l-amber-500",
  },
  convertido: {
    label: "Convertido",
    dot: "bg-emerald-500",
    badge:
      "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800",
    border: "border-l-emerald-500",
  },
  expirado: {
    label: "Expirado",
    dot: "bg-red-500",
    badge:
      "bg-red-100 text-red-900 border-red-300 dark:bg-red-900/30 dark:text-red-200 dark:border-red-800",
    border: "border-l-red-500",
  },
  cancelado: {
    label: "Cancelado",
    dot: "bg-zinc-500",
    badge:
      "bg-zinc-200 text-zinc-800 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700",
    border: "border-l-zinc-500",
  },
};

export const HIGH_VALUE_THRESHOLD = 2000;

export interface OrcamentoAlertas {
  expirando: boolean; // vence em <= 3 dias e ainda aberto
  altoValor: boolean; // acima do limite
  parcial: boolean; // convertido parcialmente (itens_consumidos < itens_total)
  aguardaPagto: boolean; // convertido mas nenhum realizado
  cadastroIncompleto: boolean; // sem telefone/cpf
}

export function computeAlertas(o: OrcV2): OrcamentoAlertas {
  const st = deriveStatus(o);
  let expirando = false;
  if (st === "aberto" && o.validade_dias && o.validade_dias > 0) {
    const exp = new Date(o.created_at).getTime() + o.validade_dias * 86_400_000;
    const diasRestantes = (exp - Date.now()) / 86_400_000;
    expirando = diasRestantes >= 0 && diasRestantes <= 3;
  }
  const parcial =
    st === "convertido" &&
    (o.itens_total ?? 0) > 0 &&
    (o.itens_consumidos ?? 0) < (o.itens_total ?? 0);
  const aguardaPagto = st === "convertido" && (o.agendamentos_realizados ?? 0) === 0;
  const cadastroIncompleto = !o.paciente_telefone || !o.paciente_cpf;
  return {
    expirando,
    altoValor: Number(o.valor_total) >= HIGH_VALUE_THRESHOLD,
    parcial,
    aguardaPagto,
    cadastroIncompleto,
  };
}
