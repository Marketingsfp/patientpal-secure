// Ponto de entrada AUTENTICADO (funcionário logado) do reagendamento.
//
// Toda a regra vive em `reagendar-agendamento.core.server.ts`; aqui só entram
// a autenticação, a validação do payload e o repasse do cliente Supabase do
// usuário. Nenhuma regra ou mensagem mudou.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PgErrorLike } from "./criar-agendamento.types";

const schema = z.object({
  clinica_id: z.string().uuid(),
  agendamento_id: z.string().uuid(),
  novo_inicio: z.string().min(1),
  novo_fim: z.string().min(1),
  novo_medico_id: z.string().uuid().nullable().optional(),
  // Justificativa obrigatória na tela; validada aqui só quanto ao tamanho,
  // porque a integração externa usa o mesmo núcleo com motivo automático.
  motivo: z.string().trim().max(300).optional().nullable(),
});

export type ReagendarAgendamentoInput = z.infer<typeof schema>;
export type { PgErrorLike };

export type ReagendarAgendamentoResult =
  | { ok: true; id: string }
  | { ok: false; validation_error: { message: string; toast_duration?: number } }
  | { ok: false; pg_error: PgErrorLike };

export const reagendarAgendamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data, context }): Promise<ReagendarAgendamentoResult> => {
    const { reagendarAgendamentoCore } = await import("./reagendar-agendamento.core.server");
    return reagendarAgendamentoCore(
      {
        db: context.supabase,
        ator: { tipo: "usuario", userId: context.userId },
      },
      data,
    );
  });
