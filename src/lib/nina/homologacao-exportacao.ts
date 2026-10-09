import { z } from "zod";
import { TIMEZONE_OPERACAO } from "@/lib/atendimento/data-hora";

const dataCalendario = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((valor) => {
    const data = new Date(`${valor}T12:00:00Z`);
    return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
  }, "Informe uma data válida.");

export const periodoExportacaoSchema = z
  .discriminatedUnion("modo", [
    z.object({ modo: z.literal("todos") }),
    z.object({ modo: z.literal("periodo"), inicio: dataCalendario, fim: dataCalendario }),
  ])
  .refine((p) => p.modo === "todos" || p.inicio <= p.fim, {
    message: "A data final deve ser igual ou posterior à data inicial.",
  });

export type PeriodoExportacao = z.infer<typeof periodoExportacaoSchema>;

const calendario = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE_OPERACAO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function diaExportacao(valor: string | Date): string {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "";
  const partes = calendario.formatToParts(data);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value;
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}

export function filtrarMensagensExportacao<T extends { created_at: string }>(
  mensagens: T[],
  periodo: PeriodoExportacao,
): T[] {
  const p = periodoExportacaoSchema.parse(periodo);
  if (p.modo === "todos") return mensagens;
  return mensagens.filter((m) => {
    const dia = diaExportacao(m.created_at);
    return dia >= p.inicio && dia <= p.fim;
  });
}

export function rotuloPeriodoExportacao(periodo: PeriodoExportacao): string {
  if (periodo.modo === "todos") return "Todo o histórico disponível";
  const formatar = (dia: string) => dia.split("-").reverse().join("/");
  return periodo.inicio === periodo.fim
    ? formatar(periodo.inicio)
    : `${formatar(periodo.inicio)} a ${formatar(periodo.fim)}`;
}
