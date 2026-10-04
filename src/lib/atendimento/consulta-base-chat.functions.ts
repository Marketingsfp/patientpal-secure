import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const consultarBaseChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        termo: z.string().trim().max(120).default(""),
        pagina: z.number().int().min(0).max(10000).default(0),
        registro: z
          .object({ tipo: z.enum(["servico", "profissional"]), id: z.string().min(1).max(200) })
          .optional(),
      })
      .refine((i) => i.registro || i.termo.length >= 2, "Digite pelo menos dois caracteres.")
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { consultarBaseChatCore } = await import("./consulta-base-chat.server");
    return consultarBaseChatCore(context.supabase, context.userId, data, async (clinicaId) => {
      const { lerFonteOperacional } = await import("@/lib/nina/fonte-operacional.server");
      return lerFonteOperacional(clinicaId);
    });
  });
