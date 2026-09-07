/**
 * FASE 8 — Resolve, no servidor, o que a pessoa autenticada pode ver no módulo
 * Arquitetura. O papel vem sempre de `user_roles` (RLS como o próprio usuário);
 * nada é aceito do frontend além do id da clínica.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  capacidadesDoPapel,
  type CapacidadeArquitetura,
} from "./permissoes";

export type RespostaCapacidades = {
  papel: string | null;
  capacidades: CapacidadeArquitetura[];
};

export const capacidadesArquitetura = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<RespostaCapacidades> => {
    const { data: papeis } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("clinica_id", data.clinicaId);

    const lista = (papeis ?? []).map((p) => String((p as { role: string }).role));
    const capacidades = new Set<CapacidadeArquitetura>();
    for (const papel of lista) capacidadesDoPapel(papel).forEach((c) => capacidades.add(c));

    return {
      papel: lista[0] ?? null,
      capacidades: [...capacidades],
    };
  });
