import { z } from "zod";
import { ESTADOS_MANUAIS } from "./presenca-manual";

export const resultadoDistribuicaoFilaSchema = z.object({
  status: z.enum(["concluida", "bloqueada", "erro", "pendente"]),
  distribuidas: z.number().int().nonnegative(),
  pendentes: z.number().int().nonnegative(),
  motivo: z.string().nullable(),
  meu: z
    .object({
      carga_atual: z.number().int().nonnegative(),
      // Sempre null: Online não tem limite de conversas. Mantido para compatibilidade da resposta.
      capacidade: z.number().int().positive().nullable(),
      elegivel: z.boolean(),
      motivo: z.string().nullable(),
    })
    .nullable()
    .optional(),
});

export type ResultadoDistribuicaoFila = z.infer<typeof resultadoDistribuicaoFilaSchema>;

export const resultadoPresencaDistribuicaoSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(false),
    conflito: z.literal(true),
    versao: z.number().int().nonnegative(),
  }),
  z.object({
    ok: z.literal(true),
    conflito: z.literal(false),
    estado: z.enum(ESTADOS_MANUAIS),
    versao: z.number().int().nonnegative(),
    em: z.string(),
    distribuidas: z.number().int().nonnegative(),
    distribuicao: resultadoDistribuicaoFilaSchema,
    pausaId: z.string().uuid().nullable().optional(),
    cronometroPausaInicio: z.string().nullable().optional(),
  }),
]);

export type ResultadoPresencaDistribuicao = z.infer<typeof resultadoPresencaDistribuicaoSchema>;
