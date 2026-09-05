/**
 * Leitura da conversa de origem de um feedback (FASE 2 — somente leitura).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const lerConversaFeedbackNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), conversaId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: linhas, error } = await context.supabase
      .from("whatsapp_mensagens")
      .select("id, direction, body, tipo, enviada_por, recebida_em, transcricao")
      .eq("clinica_id", data.clinicaId)
      .eq("conversa_id", data.conversaId)
      .order("recebida_em", { ascending: true })
      .limit(300);
    if (error) throw new Error(error.message);
    return linhas ?? [];
  });
