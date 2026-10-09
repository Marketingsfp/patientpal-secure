import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * NFS-e parte 1b — corrige um lote de notas emitidas pelo XML oficial.
 * Acionado manualmente (admin). Idempotente: só pega `retorno_conferencia is null`.
 * Só grava aliquota_iss, valor_iss e retorno_conferencia.
 */
export const corrigirIssLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        limite: z.number().int().min(1).max(100),
        emitenteId: z.string().uuid(),
        reprocessarFalhas: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: m } = await context.supabase
      .from("clinica_memberships")
      .select("role")
      .eq("clinica_id", data.clinicaId)
      .eq("user_id", context.userId)
      .eq("ativo", true)
      .maybeSingle();
    if (!["admin", "financeiro"].includes(String(m?.role ?? "").toLowerCase()))
      throw new Error("Apenas administrador ou financeiro");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { executarLoteBackfill } = await import("./nfse-backfill.server");
    return executarLoteBackfill(supabaseAdmin, data.clinicaId, data.limite, {
      emitenteId: data.emitenteId,
      reprocessarFalhas: data.reprocessarFalhas,
    });
  });
