// Server function que marca um agendamento como "atendimento externo"
// (faturado em outra clínica) e cria o registro em fin_atendimentos com
// valor_clinica = 0, garantindo que apareça no repasse do médico local
// SEM tocar em fin_lancamentos, caixa ou NFS-e.
//
// Ver docs/agenda/atendimento-externo.md (a criar).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buscarValorProcedimento } from "./atendimento-externo.server";

export type MarcarExternoInput = {
  agendamento_id: string;
  clinica_id: string;
  origem_clinica_id: string | null;
  origem_clinica_nome: string | null;
  /** Legado: GRs não têm numeração; mantido apenas por compatibilidade. */
  origem_gr_numero?: string | null;
  /** Opcional: se vazio, usa o preço do serviço na tabela desta clínica. */
  origem_valor?: number | null;
  /** Repasse do médico calculado no cliente (cadastro de repasse). */
  repasse_medico?: number | null;
  /** Convênio do paciente, quando houver. */
  convenio_id?: string | null;
};

export type MarcarExternoResult =
  | { ok: true; fin_atendimento_id: string | null }
  | { ok: false; message: string };

export const marcarAtendimentoExterno = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: MarcarExternoInput) => d)
  .handler(async ({ data, context }): Promise<MarcarExternoResult> => {
    const { supabase } = context;
    if (!data.origem_clinica_id && !(data.origem_clinica_nome ?? "").trim()) {
      return { ok: false, message: "Informe a clínica de origem." };
    }
    const valorInformado = Number(data.origem_valor ?? 0);

    const { data: ag, error: agErr } = await supabase
      .from("agendamentos")
      .select("id,clinica_id,paciente_id,medico_id,inicio,procedimento")
      .eq("id", data.agendamento_id)
      .maybeSingle();
    if (agErr || !ag) return { ok: false, message: "Agendamento não encontrado." };
    if (ag.clinica_id !== data.clinica_id) {
      return { ok: false, message: "Agendamento pertence a outra clínica." };
    }

    // Valor base do repasse: o que o operador informou ou, na falta, o preço
    // do serviço na tabela da clínica que está atendendo (recebendo a GR).
    const valor =
      Number.isFinite(valorInformado) && valorInformado > 0
        ? valorInformado
        : await buscarValorProcedimento(supabase, ag.clinica_id, ag.procedimento);

    // Repasse do médico: vem calculado do cliente pelo cadastro de repasse.
    // Sem informação, mantém o comportamento antigo (valor cheio da tabela).
    const repasseInformado = Number(data.repasse_medico ?? NaN);
    const repasse = Number.isFinite(repasseInformado) && repasseInformado >= 0 ? repasseInformado : valor;

    const { error: upErr } = await supabase
      .from("agendamentos")
      .update({
        origem_externa: true,
        origem_clinica_id: data.origem_clinica_id,
        origem_clinica_nome: (data.origem_clinica_nome ?? "").trim() || null,
        origem_valor: valor,
      })
      .eq("id", data.agendamento_id);
    if (upErr) return { ok: false, message: upErr.message };

    // fin_atendimentos: valor_clinica = 0, valor_medico = origem_valor (0 se
    // não informado). Fica pendente para o setor de repasse quitar como
    // qualquer outro atendimento — só que sem cobrança em caixa aqui.
    const obs = `EXTERNO${data.origem_clinica_nome ? ` — ${data.origem_clinica_nome}` : ""}`;
    const dataDia = new Date(ag.inicio).toISOString().slice(0, 10);
    let finId: string | null = null;
    // Evita duplicidade quando o operador salva duas vezes o mesmo externo.
    const { data: existente } = await supabase
      .from("fin_atendimentos")
      .select("id")
      .eq("agendamento_id", data.agendamento_id)
      .maybeSingle();
    if (existente?.id) {
      finId = existente.id;
      await supabase
        .from("fin_atendimentos")
        .update({
          valor_total: valor,
          valor_medico: repasse,
          valor_clinica: 0,
          forma_pagamento: "externo",
          observacoes: obs,
        })
        .eq("id", finId);
    } else {
      const { data: ins, error: insErr } = await supabase
        .from("fin_atendimentos")
        .insert({
          clinica_id: ag.clinica_id,
          paciente_id: ag.paciente_id,
          medico_id: ag.medico_id,
          data: dataDia,
          procedimento: ag.procedimento,
          valor_total: valor,
          valor_medico: repasse,
          valor_clinica: 0,
          forma_pagamento: "externo",
          status: "confirmado",
          agendamento_id: data.agendamento_id,
          observacoes: obs,
        })
        .select("id")
        .maybeSingle();
      if (insErr) return { ok: false, message: insErr.message };
      finId = ins?.id ?? null;
    }

    return { ok: true, fin_atendimento_id: finId };
  });

/**
 * Desfaz um atendimento externo: apaga o registro em `fin_atendimentos`
 * (quando o repasse ainda não foi pago), zera as marcações de origem externa
 * no agendamento e registra o que foi desfeito no histórico da ficha.
 *
 * Usado pela desmarcação ("Liberar horário") e pelo cancelamento, para que a
 * ficha volte ao estado de um agendamento comum — sem sobrar nada no
 * Financeiro. Nada é apagado do histórico/auditoria.
 */
export const limparAtendimentoExterno = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agendamento_id: string }) => d)
  .handler(async ({ data, context }): Promise<LimparExternoResult> => {
    const claims = context.claims as
      | { email?: string; user_metadata?: { nome?: string } }
      | null;
    return limparExternoCore(context.supabase as never, data.agendamento_id, {
      email: claims?.email ?? null,
      nome: claims?.user_metadata?.nome ?? null,
    });
  });
