import { z } from "zod";
import { janelaDiaClinica } from "@/lib/date-utils";

export const periodoCentralSchema = z
  .object({
    de: z.string().date().optional(),
    ate: z.string().date().optional(),
  })
  .refine((p) => !p.de || !p.ate || p.de <= p.ate, {
    message: "A data inicial deve ser igual ou anterior à data final.",
    path: ["ate"],
  });

export type PeriodoCentral = z.infer<typeof periodoCentralSchema>;

/** Abertura da conversa, com o último dia inteiro no fuso da clínica. */
export function limitesPeriodoCentral(periodo: PeriodoCentral) {
  const p = periodoCentralSchema.parse(periodo);
  return {
    inicio: p.de ? janelaDiaClinica(p.de).inicio : undefined,
    fim: p.ate ? janelaDiaClinica(p.ate).fimExclusivo : undefined,
  };
}

export function aplicarPeriodoCentral<
  T extends {
    gte: (campo: string, valor: string) => T;
    lt: (campo: string, valor: string) => T;
  },
>(q: T, periodo: PeriodoCentral, campo = "created_at"): T {
  const { inicio, fim } = limitesPeriodoCentral(periodo);
  if (inicio) q = q.gte(campo, inicio);
  if (fim) q = q.lt(campo, fim);
  return q;
}
