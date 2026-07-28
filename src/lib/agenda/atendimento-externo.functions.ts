// Server function que marca um agendamento como "atendimento externo"
// (faturado em outra clínica) e cria o registro em fin_atendimentos com
// valor_clinica = 0, garantindo que apareça no repasse do médico local
// SEM tocar em fin_lancamentos, caixa ou NFS-e.
//
// Ver docs/agenda/atendimento-externo.md (a criar).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MarcarExternoInput = {
  agendamento_id: string;
  clinica_id: string;
  origem_clinica_id: string | null;
  origem_clinica_nome: string | null;
  origem_gr_numero: string;
  origem_valor: number | null;
};

export type MarcarExternoResult =
  | { ok: true; fin_atendimento_id: string | null }
  | { ok: false; message: string };

export const marcarAtendimentoExterno = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: MarcarExternoInput) => d)
  .handler(async ({ data, context }): Promise<MarcarExternoResult> => {
    const { supabase } = context;
    const gr = (data.origem_gr_numero ?? "").trim();
    if (!gr) return { ok: false, message: "Informe o número da GR da clínica de origem." };
    if (!data.origem_clinica_id && !(data.origem_clinica_nome ?? "").trim()) {
      return { ok: false, message: "Informe a clínica de origem." };
    }

    const { data: ag, error: agErr } = await supabase
      .from("agendamentos")
      .select("id,clinica_id,paciente_id,medico_id,inicio,procedimento")
      .eq("id", data.agendamento_id)
      .maybeSingle();
    if (agErr || !ag) return { ok: false, message: "Agendamento não encontrado." };
    if (ag.clinica_id !== data.clinica_id) {
      return { ok: false, message: "Agendamento pertence a outra clínica." };
    }

    const { error: upErr } = await supabase
      .from("agendamentos")
      .update({
        origem_externa: true,
        origem_clinica_id: data.origem_clinica_id,
        origem_clinica_nome: (data.origem_clinica_nome ?? "").trim() || null,
        origem_gr_numero: gr,
        origem_valor: data.origem_valor,
      })
      .eq("id", data.agendamento_id);
    if (upErr) return { ok: false, message: upErr.message };

    // fin_atendimentos: valor_clinica = 0, valor_medico = origem_valor (0 se
    // não informado). Fica pendente para o setor de repasse quitar como
    // qualquer outro atendimento — só que sem cobrança em caixa aqui.
    const valor = Number(data.origem_valor ?? 0);
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
          valor_medico: valor,
          valor_clinica: 0,
          forma_pagamento: "externo",
          observacoes: `EXTERNO — GR ${gr}${data.origem_clinica_nome ? ` · ${data.origem_clinica_nome}` : ""}`,
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
          valor_medico: valor,
          valor_clinica: 0,
          forma_pagamento: "externo",
          status: "confirmado",
          agendamento_id: data.agendamento_id,
          observacoes: `EXTERNO — GR ${gr}${data.origem_clinica_nome ? ` · ${data.origem_clinica_nome}` : ""}`,
        })
        .select("id")
        .maybeSingle();
      if (insErr) return { ok: false, message: insErr.message };
      finId = ins?.id ?? null;
    }

    return { ok: true, fin_atendimento_id: finId };
  });
