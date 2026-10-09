import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizarTelefone } from "@/lib/atendimento/telefone";
import { camposCadastroFaltantes, type DadosCadastro } from "./cadastro-paciente";
import type { CtxNinaPaciente } from "./paciente-tools.server";

/** Telefone é contato, não prova sozinho quem é o paciente. */
export async function consultarCadastroConfirmado(ctx: CtxNinaPaciente): Promise<{
  dados: DadosCadastro;
  confirmado: boolean;
  camposFaltantes: ReturnType<typeof camposCadastroFaltantes>;
}> {
  const teste = ctx.teste || ctx.origem === "homologacao";
  const whatsapp = normalizarTelefone(ctx.telefone ?? ctx.estado?.whatsapp_remetente);
  let dados: DadosCadastro = { telefone: whatsapp };
  let confirmado = false;
  if (ctx.pacienteId && ctx.estado?.patient.validated) {
    let consulta = supabaseAdmin
      .from("pacientes")
      .select("id,nome,data_nascimento,telefone,ativo,is_mock_data,teste")
      .eq("clinica_id", ctx.clinicaId)
      .eq("id", ctx.pacienteId)
      .eq("is_mock_data", Boolean(teste));
    consulta = consulta.eq("teste", Boolean(teste));
    const { data, error } = await consulta.maybeSingle();
    if (error) throw new Error("Falha ao consultar cadastro do paciente");
    if (!data || !data.ativo || Boolean(data.is_mock_data || data.teste) !== Boolean(teste))
      throw new Error("Cadastro vinculado indisponível neste ambiente");
    dados = {
      nome: data.nome,
      data_nascimento: data.data_nascimento,
      telefone:
        ctx.estado?.patient.telefone_confirmado?.paciente_id === data.id ? data.telefone : whatsapp,
    };
    confirmado = true;
  }
  return { dados, confirmado, camposFaltantes: camposCadastroFaltantes(dados) };
}

/** Atualiza só o paciente já vinculado; a RPC grava contato e auditoria atomicamente. */
export async function alterarTelefoneSolicitado(
  ctx: CtxNinaPaciente,
  dados: { nome: string; data_nascimento: string; telefone: string },
): Promise<boolean> {
  const pedido = ctx.estado?.patient.alteracao_telefone;
  if (!pedido) return true;
  // Homologação nunca altera o contato: descarta o pedido e mantém o número da conversa.
  const teste = Boolean(ctx.teste || ctx.origem === "homologacao");
  if (teste) {
    ctx.estado!.patient.alteracao_telefone = null;
    return true;
  }
  if (
    !pedido.telefone ||
    !ctx.pacienteId ||
    (pedido.paciente_id && pedido.paciente_id !== ctx.pacienteId)
  )
    return false;
  // Leia o valor persistido para CAS; o telefone da conversa pode ser secundário.
  const { data: atual, error: leitura } = await supabaseAdmin
    .from("pacientes")
    .select("telefone")
    .eq("id", ctx.pacienteId)
    .eq("clinica_id", ctx.clinicaId)
    .eq("is_mock_data", teste)
    .eq("teste", teste)
    .eq("ativo", true)
    .maybeSingle();
  if (leitura || !atual) return false;
  const { data, error } = await supabaseAdmin.rpc(
    "nina_alterar_telefone_paciente" as never,
    {
      _clinica_id: ctx.clinicaId,
      _conversa_id: ctx.conversaId,
      _paciente_id: ctx.pacienteId,
      _nome: dados.nome,
      _data_nascimento: dados.data_nascimento,
      _telefone_anterior: atual.telefone,
      _telefone_novo: pedido.telefone,
      _solicitacao: pedido.mensagem,
    } as never,
  );
  const r = data as { ok?: boolean; paciente_id?: string; telefone?: string } | null;
  if (error || !r?.ok || r.paciente_id !== ctx.pacienteId || r.telefone !== pedido.telefone)
    return false;
  dados.telefone = pedido.telefone;
  ctx.estado!.patient.telefone_confirmado = {
    paciente_id: ctx.pacienteId,
    telefone: pedido.telefone,
  };
  ctx.estado!.patient.alteracao_telefone = null;
  return true;
}
