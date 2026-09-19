import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PROMPTS_POR_PAGINA, type PaginaPromptsCarga } from "./carga-prompts";

export const listarPromptsCarga = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        busca: z.string().trim().max(120).default(""),
        offset: z.number().int().min(0).max(1_000_000).default(0),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<PaginaPromptsCarga> => {
    let q = context.supabase
      .from("nina_carga_prompts")
      .select("id,pedido,created_at,ultimo_usado_em")
      .eq("clinica_id", data.clinicaId)
      .eq("user_id", context.userId);
    if (data.busca) q = q.ilike("pedido", `%${data.busca.replace(/[\\%_]/g, "\\$&")}%`);
    const { data: rows, error } = await q
      .order("ultimo_usado_em", { ascending: false })
      .order("id", { ascending: true })
      .range(data.offset, data.offset + PROMPTS_POR_PAGINA);
    if (error) throw new Error("Não foi possível carregar seus prompts salvos.");
    return {
      prompts: (rows ?? []).slice(0, PROMPTS_POR_PAGINA),
      temMais: (rows?.length ?? 0) > PROMPTS_POR_PAGINA,
    };
  });
