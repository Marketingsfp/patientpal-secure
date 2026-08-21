// Ponto de entrada AUTENTICADO (funcionário logado) da mudança de status.
//
// Toda a regra vive em `status-agendamento.core.server.ts`; aqui só entram a
// autenticação, a validação do payload e o repasse do cliente Supabase do
// usuário. Nenhuma regra ou mensagem mudou.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const STATUS_AGENDAMENTO = [
  "agendado",
  "confirmado",
  "em_atendimento",
  "realizado",
  "cancelado",
  "faltou",
] as const;
export type StatusAgendamento = (typeof STATUS_AGENDAMENTO)[number];

const schema = z.object({
  // Um ou mais agendamentos da MESMA sessão (pacote de exames = múltiplos ids).
  // O primeiro id é usado como referência para validações (data futura, pacote).
  agendamento_ids: z.array(z.string().uuid()).min(1),
  novo_status: z.enum(STATUS_AGENDAMENTO),
  cascatear_pacote: z.boolean().optional().default(false),
});

export type AtualizarStatusInput = z.infer<typeof schema>;

export const atualizarStatusAgendamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { atualizarStatusAgendamentoCore } = await import("./status-agendamento.core.server");
    const claims = context.claims as { email?: string; user_metadata?: { nome?: string } } | null;
    return atualizarStatusAgendamentoCore(
      {
        db: context.supabase,
        ator: {
          tipo: "usuario",
          userId: context.userId,
          email: claims?.email ?? null,
          nome: claims?.user_metadata?.nome ?? null,
        },
      },
      data,
    );
  });

/**
 * Lista agendamentos "irmãos" de pacote (mesmo `pacote_id`, ainda ativos)
 * para o caller decidir se pergunta ao usuário sobre cascata de cancelamento.
 */
export const listarIrmaosDoPacote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ agendamento_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: ag } = await supabase
      .from("agendamentos")
      .select("pacote_id")
      .eq("id", data.agendamento_id)
      .maybeSingle();
    if (!ag?.pacote_id)
      return [] as Array<{ id: string; inicio: string; procedimento: string | null }>;
    const { data: irmaos } = await supabase
      .from("agendamentos")
      .select("id,inicio,procedimento,status")
      .eq("pacote_id", ag.pacote_id)
      .neq("status", "cancelado");
    return (irmaos ?? []).filter((x) => x.id !== data.agendamento_id) as Array<{
      id: string;
      inicio: string;
      procedimento: string | null;
    }>;
  });
