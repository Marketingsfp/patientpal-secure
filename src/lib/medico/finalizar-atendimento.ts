/**
 * Grava o prontuário de um agendamento e marca o atendimento como finalizado.
 *
 * Usado pela fila do médico ("Salvar" do editor na fila e "Cliente atendido"
 * na Baixa). Segue exatamente as regras da tela da consulta
 * (app.atendimento-ia.$agendamentoId.tsx → handleSalvar): um prontuário por
 * agendamento, `observacoes` nunca é tocado, e o registro de repasse só é
 * criado quando ainda não existe cobrança nem registro para o agendamento.
 */
import { hojeBR } from "@/lib/date-utils";
import { supabase } from "@/integrations/supabase/client";
import { textoDoProntuario } from "@/lib/prontuario/html";

export async function gravarProntuarioDoAgendamento(p: {
  clinicaId: string;
  pacienteId: string;
  medicoId: string | null;
  agendamentoId: string;
  html: string;
}): Promise<string> {
  const { data: existente, error: e1 } = await supabase
    .from("prontuarios")
    .select("id")
    .eq("agendamento_id", p.agendamentoId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (e1) throw e1;
  const primeira =
    textoDoProntuario(p.html)
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean)
      ?.slice(0, 120) ?? null;
  const campos = {
    clinica_id: p.clinicaId,
    paciente_id: p.pacienteId,
    medico_id: p.medicoId,
    agendamento_id: p.agendamentoId,
    historia_doenca: p.html || null,
  };
  const tabela = supabase.from("prontuarios");
  const { data, error } = existente
    ? await tabela
        .update(campos as never)
        .eq("id", existente.id)
        .select("id")
    : await tabela
        .insert({ ...campos, queixa_principal: primeira, data: new Date().toISOString() } as never)
        .select("id");
  if (error) throw error;
  const linha = (data ?? [])[0] as { id: string } | undefined;
  if (!linha) {
    throw new Error(
      "O prontuário não foi gravado. Só o médico responsável por este atendimento ou a supervisão autorizada podem gravar.",
    );
  }
  return linha.id;
}

/** Devolve a lista de pendências (vazia = tudo certo). */
export async function finalizarAtendimento(p: {
  clinicaId: string;
  pacienteId: string;
  agendamentoId: string;
  procedimento: string | null;
  medico: {
    id: string;
    tipo_repasse?: string | null;
    valor_repasse_padrao?: number | null;
    percentual_repasse_padrao?: number | null;
  } | null;
}): Promise<string[]> {
  const falhas: string[] = [];
  let valorTotal = 0;
  let valorConhecido = true;
  if (p.procedimento) {
    const { data: proc, error } = await supabase
      .from("procedimentos")
      .select("valor_padrao, valor_dinheiro")
      .eq("clinica_id", p.clinicaId)
      .ilike("nome", p.procedimento)
      .maybeSingle();
    if (error) {
      valorConhecido = false;
      falhas.push("o valor do procedimento não pôde ser consultado, e o repasse não foi gerado");
    }
    valorTotal = Number(proc?.valor_dinheiro ?? proc?.valor_padrao ?? 0);
  }
  const { data: lanc, error: eLanc } = await supabase
    .from("fin_lancamentos")
    .select("id, valor")
    .eq("agendamento_id", p.agendamentoId)
    .maybeSingle();
  if (eLanc) {
    valorConhecido = false;
    falhas.push("não foi possível verificar a cobrança do agendamento, e o repasse não foi gerado");
  }
  if (lanc && !valorTotal) valorTotal = Number(lanc.valor ?? 0);
  const { data: finExist, error: eFin } = await supabase
    .from("fin_atendimentos")
    .select("id")
    .eq("agendamento_id", p.agendamentoId)
    .limit(1)
    .maybeSingle();
  if (eFin) {
    valorConhecido = false;
    falhas.push("não foi possível verificar o registro financeiro deste atendimento");
  }
  let valorMedico = 0;
  if (p.medico && valorTotal > 0) {
    valorMedico =
      p.medico.tipo_repasse === "valor"
        ? Number(p.medico.valor_repasse_padrao ?? 0)
        : valorTotal * (Number(p.medico.percentual_repasse_padrao ?? 0) / 100);
  }
  if (valorConhecido && valorTotal > 0 && !lanc && !finExist) {
    const { error } = await supabase.from("fin_atendimentos").insert({
      clinica_id: p.clinicaId,
      paciente_id: p.pacienteId,
      medico_id: p.medico?.id ?? null,
      agendamento_id: p.agendamentoId,
      procedimento: p.procedimento || null,
      data: hojeBR(),
      valor_total: valorTotal,
      valor_medico: valorMedico,
      valor_clinica: Math.max(0, valorTotal - valorMedico),
      status: "realizado",
      lancamento_id: null,
    } as never);
    if (error) falhas.push("o lançamento no financeiro não foi registrado");
  }
  const { error: eAg } = await supabase
    .from("agendamentos")
    .update({
      fluxo_etapa: "finalizado",
      status: "realizado",
      fluxo_atualizado_em: new Date().toISOString(),
    } as never)
    .eq("id", p.agendamentoId);
  if (eAg) falhas.push("o atendimento não foi marcado como finalizado (o paciente segue na fila)");
  return falhas;
}
