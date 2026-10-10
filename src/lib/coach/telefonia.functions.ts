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

// Nome da chave é parâmetro, mas restrito à lista fechada do servidor.
const chaveSegredo = z.enum(["sufficit_api_token"]);

export const estadoSegredoTelefonia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ clinicaId: z.string().uuid(), chave: chaveSegredo }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const guard = await import("./guard.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "write");
    const s = await import("./telefonia-sufficit.server");
    return s.estadoSegredo(data.clinicaId, data.chave);
  });

export const salvarTokenTelefonia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const r = z
      .object({
        clinicaId: z.string().uuid(),
        chave: chaveSegredo,
        valor: z.string().trim().min(1).max(8000),
      })
      .safeParse(data);
    // Mensagem própria: o erro do zod poderia citar o valor recebido.
    if (!r.success) throw new Error("Dados inválidos. Confira o token e tente novamente.");
    return r.data;
  })
  .handler(async ({ data, context }) => {
    const guard = await import("./guard.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "write");
    const s = await import("./telefonia-sufficit.server");
    return s.salvarSegredo(data.clinicaId, data.chave, data.valor);
  });

export const removerTokenTelefonia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ clinicaId: z.string().uuid(), chave: chaveSegredo }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const guard = await import("./guard.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "write");
    const s = await import("./telefonia-sufficit.server");
    return s.removerSegredo(data.clinicaId, data.chave);
  });
