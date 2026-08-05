// Helper server-only do atendimento externo. Fica fora do *.functions.ts por
// causa do split de server functions (o bundler apaga declarações irmãs).
import { valorDaTabela, type PrecosProcedimento } from "./atendimento-externo-preco";

export async function buscarValorProcedimento(
  supabase: { from: (t: string) => any },
  clinicaId: string,
  procedimento: string | null,
): Promise<number> {
  const nome = (procedimento ?? "").trim();
  if (!nome) return 0;
  const { data } = await supabase
    .from("procedimentos")
    .select("nome,valor_dinheiro,valor_dinheiro_pix,valor_padrao")
    .eq("clinica_id", clinicaId)
    .ilike("nome", nome)
    .limit(1)
    .maybeSingle();
  return valorDaTabela(data as PrecosProcedimento | null);
}

export type LimparExternoResult =
  | { ok: true; limpou: boolean }
  | { ok: false; message: string };

/**
 * Desfaz um atendimento externo: remove o registro em `fin_atendimentos`
 * (somente se o repasse ainda não foi pago), zera as marcações de origem
 * externa no agendamento e grava no histórico da ficha o que foi desfeito.
 */
export async function limparExternoCore(
  supabase: { from: (t: string) => any },
  agendamentoId: string,
  autor: { email: string | null; nome: string | null },
): Promise<LimparExternoResult> {
  const { data: ag } = await supabase
    .from("agendamentos")
    .select(
      "id,clinica_id,paciente_nome,procedimento,origem_externa,origem_clinica_nome,origem_valor",
    )
    .eq("id", agendamentoId)
    .maybeSingle();
  if (!ag) return { ok: false, message: "Agendamento não encontrado." };

  const { data: fin } = await supabase
    .from("fin_atendimentos")
    .select("id,valor_medico,repasse_pago,forma_pagamento")
    .eq("agendamento_id", agendamentoId)
    .maybeSingle();

  const ehExterno = !!ag.origem_externa || fin?.forma_pagamento === "externo";
  if (!ehExterno) return { ok: true, limpou: false };

  if (fin?.repasse_pago) {
    return {
      ok: false,
      message:
        "O repasse deste atendimento externo já foi pago. Estorne o repasse no Financeiro antes de liberar o horário.",
    };
  }

  // 1) Histórico primeiro — precisa sobreviver à limpeza.
  const valorRepasse = Number(fin?.valor_medico ?? ag.origem_valor ?? 0);
  const texto =
    `Atendimento externo desfeito. Paciente: ${ag.paciente_nome ?? "—"}. ` +
    `Origem: ${ag.origem_clinica_nome ?? "—"}. ` +
    `Serviço: ${ag.procedimento ?? "—"}. ` +
    `Repasse revertido: R$ ${valorRepasse.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`;
  await supabase.from("agendamento_historico_notas").insert({
    clinica_id: ag.clinica_id,
    agendamento_id: ag.id,
    user_email: autor.email,
    user_nome: autor.nome,
    texto,
  });

  // 2) Remove o lançamento externo do Financeiro.
  if (fin?.id) {
    const { error: delErr } = await supabase.from("fin_atendimentos").delete().eq("id", fin.id);
    if (delErr) return { ok: false, message: delErr.message };
  }

  // 3) Zera as marcações de origem externa.
  const { error: upErr } = await supabase
    .from("agendamentos")
    .update({
      origem_externa: false,
      origem_clinica_id: null,
      origem_clinica_nome: null,
      origem_valor: null,
    })
    .eq("id", ag.id);
  if (upErr) return { ok: false, message: upErr.message };

  return { ok: true, limpou: true };
}
