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
    const { data: conv, error } = await context.supabase
      .from("atend_conversas")
      .select("id, clinica_id, handoff_em")
      .eq("id", data.conversaId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!conv) throw new Error("Conversa não encontrada");

    // O resumo deixou de ser exclusivo do handoff: qualquer desfecho relevante
    // (agendamento concluído, conversa resolvida, timeout) gera uma versão.
    const { count } = await context.supabase
      .from("atend_handoff_resumos")
      .select("id", { count: "exact", head: true })
      .eq("conversa_id", data.conversaId);
    const temResumo = (count ?? 0) > 0;
    if (!conv.handoff_em && !temResumo) return null;

    const { garantirResumoHandoff } = await import("./handoff-resumo.server");
    return await garantirResumoHandoff({
      clinicaId: data.clinicaId,
      conversaId: data.conversaId,
      forcar: data.forcar === true,
      ignorarHandoff: !conv.handoff_em,
    });
  });

