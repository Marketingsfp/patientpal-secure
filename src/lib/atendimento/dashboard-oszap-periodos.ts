import { z } from "zod";
import { hojeBR } from "@/lib/date-utils";

export const agrupamentosDashboard = {
  dia: "Dias",
  semana: "Semanas",
  mes: "Meses",
  bimestre: "Bimestres",
  trimestre: "Trimestres",
  ano: "Anos",
} as const;
export type AgrupamentoDashboard = keyof typeof agrupamentosDashboard;
export type PeriodoDashboard = { de: string; ate: string };
export const periodoDashboardSchema = z
  .object({ de: z.string().date(), ate: z.string().date() })
  .refine((p) => p.de <= p.ate, {
    path: ["ate"],
    message: "A data inicial deve ser anterior ou igual à final.",
  })
  .refine((p) => p.ate <= hojeBR(), { path: ["ate"], message: "Escolha datas até hoje." });

const iso = (d: Date) => d.toISOString().slice(0, 10);
export function deslocarDia(dia: string, quantidade: number) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + quantidade);
  return iso(d);
}
export function limitesAgrupamento(dia: string, tipo: AgrupamentoDashboard): PeriodoDashboard {
  const d = new Date(`${dia}T12:00:00Z`);
  if (tipo === "dia") return { de: dia, ate: dia };
  if (tipo === "semana") {
    const de = deslocarDia(dia, -((d.getUTCDay() + 6) % 7));
    return { de, ate: deslocarDia(de, 6) };
  }
  const meses = tipo === "ano" ? 12 : tipo === "trimestre" ? 3 : tipo === "bimestre" ? 2 : 1;
  const mes = Math.floor(d.getUTCMonth() / meses) * meses;
  return {
    de: iso(new Date(Date.UTC(d.getUTCFullYear(), mes, 1, 12))),
    ate: iso(new Date(Date.UTC(d.getUTCFullYear(), mes + meses, 0, 12))),
  };
}
/** Períodos civis completos anteriores, sem misturar o dia em andamento. */
export function periodoAnterior(tipo: AgrupamentoDashboard, hoje = hojeBR()) {
  return limitesAgrupamento(deslocarDia(limitesAgrupamento(hoje, tipo).de, -1), tipo);
}
export function periodoPadraoDashboard(hoje = hojeBR()): PeriodoDashboard {
  return { de: deslocarDia(hoje, -30), ate: deslocarDia(hoje, -1) };
}
/** Período imediatamente anterior, com o mesmo número de dias, para comparação. */
export function periodoComparacao(p: PeriodoDashboard): PeriodoDashboard {
  return { de: deslocarDia(p.de, -contarDias(p)), ate: deslocarDia(p.de, -1) };
}
export function contarDias(p: PeriodoDashboard) {
  return (Date.parse(`${p.ate}T12:00:00Z`) - Date.parse(`${p.de}T12:00:00Z`)) / 864e5 + 1;
}
export function diasDoPeriodo(p: PeriodoDashboard) {
  const dias: string[] = [];
  for (let dia = p.de; dia <= p.ate; dia = deslocarDia(dia, 1)) dias.push(dia);
  return dias;
}
/** Inclui os dias sem movimento e recorta semanas/meses pelas datas escolhidas. Soma os campos de `vazio`. */
export function agruparDiasDashboard<C extends string>(
  dias: ({ dia: string } & Record<C, number>)[],
  periodo: PeriodoDashboard,
  tipo: AgrupamentoDashboard,
  vazio: () => Record<C, number>,
) {
  const fonte = new Map(dias.map((d) => [d.dia, d]));
  const grupos = new Map<
    string,
    Record<C, number> & { de: string; ate: string; parcial: boolean; dias: number }
  >();
  for (const dia of diasDoPeriodo(periodo)) {
    const limites = limitesAgrupamento(dia, tipo);
    const grupo = grupos.get(limites.de) ?? {
      ...vazio(),
      de: dia,
      ate: dia,
      dias: 0,
      parcial: limites.de < periodo.de || limites.ate > periodo.ate,
    };
    grupo.ate = dia;
    grupo.dias++;
    const valores = fonte.get(dia);
    if (valores)
      for (const chave of Object.keys(vazio()) as C[])
        (grupo as Record<C, number>)[chave] += valores[chave];
    grupos.set(limites.de, grupo);
  }
  return [...grupos.values()];
}
