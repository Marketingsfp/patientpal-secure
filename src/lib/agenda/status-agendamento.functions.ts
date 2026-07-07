// Fonte única para MUDANÇA DE STATUS de agendamentos.
//
// Espelha 1:1 as regras do `mudarStatus` clássico
// (`src/routes/_authenticated/app.agenda.tsx`, linhas ~2581-2630) + a
// gravação de `executado_por/executado_em` usada por `iniciarAtendimentoEnf`
// e `concluirAtendimentoManual` (linhas ~2632-2665).
//
// Regras preservadas literalmente:
//   1. "Realizado" só por médico da clínica OU por admin/gestor/financeiro/
//      recepcao (linha 2582-2593).
//   2. "Realizado" bloqueado se a data do agendamento for futura (linha
//      2594-2601).
//   3. Ao cancelar, o vínculo com `orcamento_id` é liberado (linha 2604-2605).
//   4. Cancelamento em cascata opcional quando o agendamento faz parte de
//      um pacote (linha 2606-2624). A decisão é do caller — este handler
//      só recebe `cascatear_pacote`.
//   5. Ao marcar como "Realizado", registra `executado_por` = user logado
//      e `executado_em` = agora (necessário para o repasse médico).
//
// Nenhuma regra nova. Nenhuma mensagem nova. Este arquivo NÃO faz toasts,
// NÃO invalida queries e NÃO fecha modais — responsabilidade do caller.
// SRP: só altera o status persistido.

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
    const { supabase, userId } = context;
    const { agendamento_ids, novo_status, cascatear_pacote } = data;
    const primaryId = agendamento_ids[0];

    const { data: ag, error: e0 } = await supabase
      .from("agendamentos")
      .select("id,clinica_id,inicio,status,pacote_id,orcamento_id,paciente_nome")
      .eq("id", primaryId)
      .maybeSingle();
    if (e0) throw new Error(e0.message);
    if (!ag) throw new Error("Agendamento não encontrado.");

    // Regras 1 e 2 — "Realizado".
    if (novo_status === "realizado") {
      const { data: link } = await supabase
        .from("clinica_memberships")
        .select("role")
        .eq("clinica_id", ag.clinica_id)
        .eq("user_id", userId)
        .eq("ativo", true)
        .maybeSingle();
      const role = (link?.role ?? "").toLowerCase();
      const podeRealizar =
        role === "medico" ||
        ["admin", "gestor", "financeiro", "recepcao"].includes(role);
      if (!podeRealizar) {
        throw new Error("Sem permissão para marcar como 'Realizado'.");
      }
      const inicio = new Date(ag.inicio);
      const hojeFim = new Date();
      hojeFim.setHours(23, 59, 59, 999);
      if (inicio.getTime() > hojeFim.getTime()) {
        throw new Error(
          "Não é possível baixar como Realizado um atendimento de data futura.",
        );
      }
    }

    // Payload — regras 3 e 5.
    const payload: {
      status: StatusAgendamento;
      orcamento_id?: null;
      executado_por?: string;
      executado_em?: string;
    } = { status: novo_status };
    if (novo_status === "cancelado" && ag.orcamento_id) {
      payload.orcamento_id = null;
    }
    if (novo_status === "realizado") {
      payload.executado_por = userId;
      payload.executado_em = new Date().toISOString();
    }

    // Regra 4 — cascata de pacote.
    let ids: string[] = [...new Set(agendamento_ids)];
    if (novo_status === "cancelado" && ag.pacote_id && cascatear_pacote) {
      const { data: irmaos } = await supabase
        .from("agendamentos")
        .select("id")
        .eq("pacote_id", ag.pacote_id)
        .neq("status", "cancelado");
      const irmaoIds = (irmaos ?? []).map((x) => x.id);
      ids = Array.from(new Set([...ids, ...irmaoIds]));
    }

    const { error } = await supabase
      .from("agendamentos")
      .update(payload as never)
      .in("id", ids);
    if (error) throw new Error(error.message);

    return { ids, count: ids.length };
  });

/**
 * Lista agendamentos "irmãos" de pacote (mesmo `pacote_id`, ainda ativos)
 * para o caller decidir se pergunta ao usuário sobre cascata de cancelamento.
 * Espelha o SELECT feito inline em `mudarStatus` (linhas ~2610-2615).
 */
export const listarIrmaosDoPacote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ agendamento_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: ag } = await supabase
      .from("agendamentos")
      .select("pacote_id")
      .eq("id", data.agendamento_id)
      .maybeSingle();
    if (!ag?.pacote_id) return [] as Array<{ id: string; inicio: string; procedimento: string | null }>;
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