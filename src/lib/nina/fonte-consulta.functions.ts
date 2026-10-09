import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FONTES_CONSULTA } from "./fonte-consulta";

const entrada = z.object({ clinicaId: z.string().uuid() });
async function servico(contexto: { supabase: any; userId: string }) {
  const [{ gerenciarFonteConsulta }, { supabaseAdmin }] = await Promise.all([
    import("./fonte-consulta-admin.server"),
    import("@/integrations/supabase/client.server"),
  ]);
  return gerenciarFonteConsulta(contexto, supabaseAdmin);
}
export const carregarFonteConsulta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => entrada.parse(v))
  .handler(async ({ data, context }) => (await servico(context)).carregar(data.clinicaId));

export const aplicarFonteConsulta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    entrada
      .extend({ fonte: z.enum(FONTES_CONSULTA), revisaoEsperada: z.string().nullable() })
      .parse(v),
  )
  .handler(async ({ data, context }) =>
    (await servico(context)).aplicar(data.clinicaId, data.fonte, data.revisaoEsperada),
  );
