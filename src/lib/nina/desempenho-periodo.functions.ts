/**
 * FASE 5 — Consulta somente leitura do desempenho da Nina por período
 * (dentro/fora do horário oficial publicado, e não classificável).
 *
 * Reaproveita o mesmo recorte de datas/horas do painel e o classificador
 * central. Não cria outra fonte de horário e não altera nada.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolverRecorte, descricaoRecorte } from "@/lib/nina/metricas-filtros";
import type { DesempenhoPeriodo } from "@/lib/nina/desempenho-periodo";

const entrada = z.object({
  clinicaId: z.string().uuid(),
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  diaInteiro: z.boolean().default(true),
  horaInicio: z.string().nullish(),
  horaFim: z.string().nullish(),
  fuso: z.string().nullish(),
  ambiente: z.enum(["producao", "todos"]).default("producao"),
});

export const desempenhoPeriodoNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => entrada.parse(i))
  .handler(async ({ data, context }) => {
    const recorte = resolverRecorte({
      de: data.de,
      ate: data.ate,
      diaInteiro: data.diaInteiro,
      horaInicio: data.horaInicio ?? null,
      horaFim: data.horaFim ?? null,
      fuso: data.fuso ?? null,
    });

    const { data: bruto, error } = await context.supabase.rpc("nina_metricas_periodo", {
      p_clinica: data.clinicaId,
      p_inicios: recorte.janelas.map((j) => j.inicio),
      p_fins: recorte.janelas.map((j) => j.fim),
      p_fuso: recorte.fuso,
      p_incluir_teste: data.ambiente === "todos",
    } as never);
    if (error) throw new Error(error.message);

    return {
      ...((bruto ?? {}) as DesempenhoPeriodo),
      recorte: descricaoRecorte(recorte),
    };
  });
