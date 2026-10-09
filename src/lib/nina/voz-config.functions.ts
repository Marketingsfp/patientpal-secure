import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { vozConfigSchema, previaVozSchema } from "./voz-config";

const entrada = z.object({ clinicaId: z.string().uuid() });
async function servico(contexto: { supabase: any; userId: string }) {
  const [{ gerenciarVozNina }, { supabaseAdmin }] = await Promise.all([
    import("./voz-config.server"),
    import("@/integrations/supabase/client.server"),
  ]);
  const headers = getRequest()?.headers;
  const ip =
    (headers?.get("cf-connecting-ip") ?? headers?.get("x-forwarded-for")?.split(",")[0] ?? "")
      .trim()
      .slice(0, 100) || null;
  return gerenciarVozNina({ ...contexto, ip }, supabaseAdmin);
}
export const carregarVozNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => entrada.parse(v))
  .handler(async ({ data, context }) => (await servico(context)).carregar(data.clinicaId));
export const salvarVozNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    entrada
      .extend({
        configuracao: vozConfigSchema,
        audioAtivo: z.boolean(),
        revisaoEsperada: z.string().nullable(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) =>
    (await servico(context)).salvar(
      data.clinicaId,
      data.configuracao,
      data.audioAtivo,
      data.revisaoEsperada,
    ),
  );
export const ouvirPreviaVozNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    entrada.extend({ configuracao: vozConfigSchema, texto: previaVozSchema }).parse(v),
  )
  .handler(async ({ data, context }) =>
    (await servico(context)).previa(data.clinicaId, data.configuracao, data.texto),
  );
