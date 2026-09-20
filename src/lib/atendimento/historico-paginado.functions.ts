import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Cursor = z.object({
  em: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
  tipo: z.enum(["evento", "mensagem"]),
});
export const PedidoHistorico = z
  .object({
    clinicaId: z.string().uuid(),
    conversaId: z.string().uuid(),
    antes: Cursor.optional(),
    depois: Cursor.optional(),
  })
  .refine((d) => !(d.antes && d.depois), "Informe apenas uma direção do histórico");

export const listarPaginaHistorico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => PedidoHistorico.parse(i))
  .handler(async ({ data, context }) => {
    const { carregarPaginaHistorico } = await import("./historico-paginado.server");
    return carregarPaginaHistorico(context.supabase, context.userId, data);
  });
