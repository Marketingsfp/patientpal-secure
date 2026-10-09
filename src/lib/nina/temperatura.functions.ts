import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { temperaturaSchema } from "./temperatura";

const entrada = z.object({ clinicaId: z.string().uuid() });
async function servico(contexto: { supabase: any; userId: string }) {
  const [{ gerenciarTemperaturaNina }, { supabaseAdmin }] = await Promise.all([
    import("./temperatura.server"),
    import("@/integrations/supabase/client.server"),
  ]);
  return gerenciarTemperaturaNina(contexto, supabaseAdmin);
}
export const carregarTemperaturaNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => entrada.parse(v))
  .handler(async ({ data, context }) => (await servico(context)).carregar(data.clinicaId));

export const salvarTemperaturaNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    entrada
      .extend({ temperatura: temperaturaSchema, revisaoEsperada: z.string().nullable() })
      .parse(v),
  )
  .handler(async ({ data, context }) =>
    (await servico(context)).salvar(data.clinicaId, data.temperatura, data.revisaoEsperada),
  );
