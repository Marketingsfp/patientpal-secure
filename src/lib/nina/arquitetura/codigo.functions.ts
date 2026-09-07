/**
 * FASE 5 — Server function que devolve o trecho de código de um componente da
 * arquitetura. Somente leitura, com dois travamentos:
 *  - o arquivo precisa estar citado no Architecture Manifest;
 *  - o usuário precisa ser admin da clínica (acesso técnico).
 * Nada aqui executa código do fluxo da Nina.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RespostaCodigo =
  | { permitido: false; motivo: "sem_permissao" | "arquivo_nao_liberado" }
  | {
      permitido: true;
      arquivo: string;
      funcao?: string;
      linguagem: string;
      linhaInicial: number;
      trecho: string;
      ocultouSensivel: boolean;
    };

export const verTrechoCodigo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        arquivo: z.string().min(1).max(300),
        funcao: z.string().max(200).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<RespostaCodigo> => {
    const { data: papel } = await context.supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", context.userId)
      .eq("clinica_id", data.clinicaId)
      .eq("role", "admin")
      .maybeSingle();

    if (!papel) return { permitido: false, motivo: "sem_permissao" };

    const { lerTrechoDoArquivo } = await import("./codigo.server");
    const trecho = await lerTrechoDoArquivo(data.arquivo, data.funcao);
    if (!trecho) return { permitido: false, motivo: "arquivo_nao_liberado" };

    return { permitido: true, ...trecho };
  });
