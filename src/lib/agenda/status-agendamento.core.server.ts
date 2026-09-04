// Núcleo (server-only) da MUDANÇA DE STATUS de agendamentos.
//
// Extraído sem alteração de comportamento de `status-agendamento.functions.ts`,
// que hoje só embrulha esta função com a autenticação do funcionário. A API de
// integração externa usa o mesmo núcleo para cancelar.
//
// Regras preservadas literalmente:
//   1. "Realizado" só por médico da clínica OU por admin/gestor/financeiro/recepcao.
//   2. "Realizado" bloqueado se a data do agendamento for futura.
//   3. Ao cancelar, o vínculo com `orcamento_id` é liberado.
//   4. Cancelamento em cascata opcional quando faz parte de um pacote.
//   5. Ao marcar como "Realizado", grava `executado_por` / `executado_em`.
//
// Não faz toasts, não invalida queries, não fecha modais.

import { hojeBR, janelaDiaClinica } from "@/lib/date-utils";
import { limparExternoCore } from "./atendimento-externo.server";
import { assertEscopoRegistro, type CtxAgenda } from "./ator.server";
import { motivoFinal } from "./motivo-final";

export const STATUS_AGENDAMENTO = [
  "agendado",
  "confirmado",
  "em_atendimento",
  "realizado",
  "cancelado",
  "faltou",
] as const;
export type StatusAgendamento = (typeof STATUS_AGENDAMENTO)[number];

export type AtualizarStatusCoreInput = {
  agendamento_ids: string[];
  novo_status: StatusAgendamento;
  cascatear_pacote?: boolean;
  /**
   * Justificativa do cancelamento. Obrigatória nas telas de Agenda (a
   * recepção informa num modal antes de confirmar) e ignorada nos demais
   * status. Quando o cancelamento vem de uma integração externa — que não
   * tem como abrir modal nenhum — o motivo é preenchido automaticamente
   * abaixo, para que o histórico nunca fique sem explicação.
   */
  motivo?: string | null;
};

export async function atualizarStatusAgendamentoCore(
  ctx: CtxAgenda,
  input: AtualizarStatusCoreInput,
): Promise<{ ids: string[]; count: number }> {
  const supabase = ctx.db;
  const { agendamento_ids, novo_status } = input;
  const cascatear_pacote = input.cascatear_pacote ?? false;
  const primaryId = agendamento_ids[0];

  const { data: ag, error: e0 } = await supabase
    .from("agendamentos")
    .select("id,clinica_id,inicio,status,pacote_id,orcamento_id,paciente_nome,origem_integracao")
    .eq("id", primaryId)
    .maybeSingle();
  if (e0) throw new Error(e0.message);
  if (!ag) throw new Error("Agendamento não encontrado.");
  // Escopo obrigatório sob service role (no-op para funcionário logado).
  assertEscopoRegistro(ctx.ator, ag as { clinica_id: string; origem_integracao: string | null });

  // Regras 1 e 2 — "Realizado".
  if (novo_status === "realizado") {
    if (ctx.ator.tipo !== "usuario") {
      throw new Error("A integração externa não pode marcar um atendimento como 'Realizado'.");
    }
    const { data: link } = await supabase
      .from("clinica_memberships")
      .select("role")
      .eq("clinica_id", ag.clinica_id)
      .eq("user_id", ctx.ator.userId)
      .eq("ativo", true)
      .maybeSingle();
    const role = (link?.role ?? "").toLowerCase();
    const podeRealizar =
      role === "medico" || ["admin", "gestor", "financeiro", "recepcao"].includes(role);
    if (!podeRealizar) {
      throw new Error("Sem permissão para marcar como 'Realizado'.");
    }
    // Fim do dia civil da CLÍNICA (America/Sao_Paulo), não do fuso do runtime.
    const { fimExclusivo } = janelaDiaClinica(hojeBR());
    if (new Date(ag.inicio).getTime() >= new Date(fimExclusivo).getTime()) {
      throw new Error("Não é possível baixar como Realizado um atendimento de data futura.");
    }
  }

  // Payload — regras 3 e 5.
  const payload: {
    status: StatusAgendamento;
    orcamento_id?: null;
    executado_por?: string;
    executado_em?: string;
    cancelamento_motivo?: string | null;
    cancelamento_em?: string | null;
    cancelamento_por?: string | null;
  } = { status: novo_status };
  if (novo_status === "cancelado" && ag.orcamento_id) {
    payload.orcamento_id = null;
  }
  // Regra 6 — o cancelamento nunca fica sem justificativa. Ela entra no mesmo
  // UPDATE do status, de modo que o gatilho de auditoria grave motivo e status
  // na mesma linha e o histórico consiga exibir os dois juntos.
  if (novo_status === "cancelado") {
    const motivo = motivoFinal(input.motivo, ctx.ator, "cancelamento");
    payload.cancelamento_motivo = motivo;
    payload.cancelamento_em = motivo ? new Date().toISOString() : null;
    payload.cancelamento_por = motivo && ctx.ator.tipo === "usuario" ? ctx.ator.userId : null;
  }
  if (novo_status === "realizado" && ctx.ator.tipo === "usuario") {
    payload.executado_por = ctx.ator.userId;
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

  let update = supabase
    .from("agendamentos")
    .update(payload as never)
    .in("id", ids);
  // Sob service role, o UPDATE também é cercado pela clínica da chave.
  if (ctx.ator.tipo === "integracao") {
    update = update.eq("clinica_id", ctx.ator.clinica_id);
  }
  const { error } = await update;
  if (error) throw new Error(error.message);

  // Cancelamento também desfaz o atendimento externo (remove o registro no
  // Financeiro e zera as marcações de origem), deixando só o histórico.
  if (novo_status === "cancelado") {
    const autor =
      ctx.ator.tipo === "usuario"
        ? { email: ctx.ator.email ?? null, nome: ctx.ator.nome ?? null }
        : { email: null, nome: `Integração ${ctx.ator.origem_integracao}` };
    for (const id of ids) {
      const res = await limparExternoCore(supabase as never, id, autor);
      if (!res.ok) throw new Error(res.message);
    }
  }

  return { ids, count: ids.length };
}
