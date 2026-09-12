import { dataClinicaDe, hojeBR } from "@/lib/date-utils";
import { addDias } from "@/lib/financeiro/periodos";

export const brl = (v: number | string | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—";

export type Periodo = "hoje" | "ontem" | "semana" | "mes" | "personalizado";

/**
 * Intervalo de datas puras (YYYY-MM-DD) de cada botão do filtro do Dashboard.
 *
 * Tudo aqui é aritmética de data pura no fuso da clínica. A versão anterior
 * montava um `Date` com hora local (`setHours(23, 59, 59, 999)`) e depois
 * cortava o `toISOString()`, que resolve em UTC: no Brasil, o fim do dia
 * local cai já na madrugada do dia seguinte em UTC, e o botão "Ontem"
 * devolvia 11/09 **até 12/09** — dois dias somados. Era por isso que "Ontem"
 * mostrava mais dinheiro do que o mesmo dia escolhido à mão em "Período".
 */
export function rangeFromPeriodo(p: Periodo, custom?: { from: Date; to: Date }) {
  const hoje = hojeBR();
  if (p === "ontem") {
    // Dia anterior inteiro: a tesouraria fecha o caixa do dia que passou.
    const ontem = addDias(hoje, -1);
    return { from: ontem, to: ontem };
  }
  if (p === "semana") {
    // Semana civil, de domingo a sábado. O dia da semana é lido em UTC a
    // partir da data pura, e não do relógio do navegador.
    const domingo = addDias(hoje, -new Date(`${hoje}T00:00:00Z`).getUTCDay());
    return { from: domingo, to: addDias(domingo, 6) };
  }
  if (p === "mes") {
    const [ano, mes] = hoje.split("-").map(Number);
    // Dia 0 do mês seguinte = último dia deste mês.
    return {
      from: `${hoje.slice(0, 7)}-01`,
      to: new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10),
    };
  }
  if (p === "personalizado" && custom) {
    return {
      from: dataClinicaDe(custom.from) ?? hoje,
      to: dataClinicaDe(custom.to) ?? hoje,
    };
  }
  return { from: hoje, to: hoje };
}
