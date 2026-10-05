import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const base = z.object({ clinicaId: z.string().uuid(), tipo: z.enum(["servico", "profissional"]) });
const item = base.extend({ id: z.string().uuid() });
const origem = item.extend({ fonteId: z.string().uuid() });
export const preverImportacaoCompleta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { importacaoCompleta } = await import("./catalogo-importacao.server");
    return importacaoCompleta(context).prever(data.clinicaId);
  });
export const aplicarImportacaoCompleta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid(), assinatura: z.string().regex(/^[a-f0-9]{64}$/),
    alvos: z.array(z.object({ tipo: z.enum(["servico", "profissional"]), fonteId: z.string().uuid(), assinatura: z.string().regex(/^[a-f0-9]{64}$/) })).min(1).max(50),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { importacaoCompleta } = await import("./catalogo-importacao.server");
    return importacaoCompleta(context).aplicar(data.clinicaId, data.assinatura, data.alvos);
  });
async function servico(contexto: { supabase: any; userId: string }) {
  const [{ sincronizacaoManual }, { lerFonteParaSincronizacao }, { perguntarJev }] =
    await Promise.all([
      import("./catalogo-sincronizacao.server"),
      import("./fonte-operacional.server"),
      import("./jev.server"),
    ]);
  return sincronizacaoManual(contexto, {
    lerFonte: lerFonteParaSincronizacao,
    perguntar: perguntarJev,
  });
}
export const opcoesSincronizacaoManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => base.parse(i))
  .handler(async ({ data, context }) => (await servico(context)).opcoes(data.clinicaId, data.tipo));
export const mapearCatalogoComJev = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => item.parse(i))
  .handler(async ({ data, context }) =>
    (await servico(context)).mapear(data.clinicaId, data.tipo, data.id),
  );
export const preverSincronizacaoManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => origem.parse(i))
  .handler(async ({ data, context }) =>
    (await servico(context)).prever(data.clinicaId, data.tipo, data.id, data.fonteId),
  );
export const aplicarSincronizacaoManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    origem
      .extend({
        assinatura: z.string().regex(/^[a-f0-9]{64}$/),
        esperadoUpdatedAt: z.string().datetime({ offset: true }),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) =>
    (await servico(context)).aplicar(data.clinicaId, data.tipo, data),
  );
