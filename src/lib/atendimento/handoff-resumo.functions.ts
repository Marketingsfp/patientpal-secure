/**
 * Resumo automático da Nina no handoff — ponte cliente → servidor.
 * A geração acontece sob demanda (ao abrir a conversa) e pode ser refeita
 * pelo atendente. Só membros da clínica da conversa enxergam o resumo.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Schema = z.object({
  clinicaId: z.string().uuid(),
  conversaId: z.string().uuid(),
  forcar: z.boolean().optional(),
});

export const obterResumoHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Schema.parse(d))
  .handler(async ({ data, context }) => {
    // Autorização pelo próprio RLS: se a conversa não aparecer para este
    // usuário, ele não é membro da clínica e não recebe resumo nenhum.
    {
      const { assertAcessoConversa } = await import("./acesso-conversa.server");
      await assertAcessoConversa(context.supabase, context.userId, data.clinicaId, data.conversaId);
    }
    const { obterPainelResumo } = await import("./handoff-resumo.server");
    return await obterPainelResumo({
      clinicaId: data.clinicaId,
      conversaId: data.conversaId,
      forcar: data.forcar === true,
    });
  });
