import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { periodoDashboardSchema } from "./dashboard-oszap-periodos";

export const consultarResumoDashboardOsZap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), periodo: periodoDashboardSchema }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { carregarResumoDashboardOsZap } = await import("./dashboard-oszap.server");
    return carregarResumoDashboardOsZap(
      context.supabase,
      context.userId,
      data.clinicaId,
      data.periodo,
    );
  });
