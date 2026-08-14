export const brl = (v: number | string | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—";

export type Periodo = "hoje" | "semana" | "mes" | "personalizado";

export function rangeFromPeriodo(p: Periodo, custom?: { from: Date; to: Date }) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  if (p === "hoje") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (p === "semana") {
    const d = start.getDay();
    start.setDate(start.getDate() - d);
    start.setHours(0, 0, 0, 0);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (p === "mes") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
    end.setHours(23, 59, 59, 999);
  } else if (p === "personalizado" && custom) {
    return {
      from: custom.from.toISOString().slice(0, 10),
      to: custom.to.toISOString().slice(0, 10),
    };
  }
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}
