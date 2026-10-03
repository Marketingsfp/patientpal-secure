import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const consultarResumoDashboardOsZap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        dias: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(7),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { carregarResumoDashboardOsZap } = await import("./dashboard-oszap.server");
    return carregarResumoDashboardOsZap(
      context.supabase,
      context.userId,
      data.clinicaId,
      data.dias,
    );
  });

export const consultarFilaHumanaDashboardOsZap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const [{ carregarFilaHumanaDashboard }, { supabaseAdmin }] = await Promise.all([
      import("./dashboard-oszap.server"),
      import("@/integrations/supabase/client.server"),
    ]);
    return carregarFilaHumanaDashboard(
      context.supabase,
      supabaseAdmin,
      context.userId,
      data.clinicaId,
    );
  });
