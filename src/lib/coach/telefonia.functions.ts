/**
 * Diagnóstico da telefonia Sufficit no Coach. Só gestão (escrita) do Coach.
 * Nada aqui grava a amostra: ela volta para a tela e só.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const entrada = (data: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(data);

export const testarConexaoTelefonia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(entrada)
  .handler(async ({ data, context }) => {
    const guard = await import("./guard.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "write");
    const s = await import("./telefonia-sufficit.server");
    const config = await s.estadoConfigSufficit(data.clinicaId);
    const ping = await s.pingSufficit(data.clinicaId);
    return { config, ping };
  });

export const amostrarChamadasTelefonia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(entrada)
  .handler(async ({ data, context }) => {
    const guard = await import("./guard.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "write");
    const s = await import("./telefonia-sufficit.server");
    return s.amostraChamadasSufficit(data.clinicaId, 5);
  });
