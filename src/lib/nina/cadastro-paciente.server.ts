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
  let dados: DadosCadastro = { telefone: normalizarTelefone(ctx.telefone) };
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
      telefone: normalizarTelefone(ctx.telefone) || data.telefone,
    };
    confirmado = true;
  }
  return { dados, confirmado, camposFaltantes: camposCadastroFaltantes(dados) };
}
