import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { lerPublicados, COLUNAS_SERVICO } from "./catalogo-turno.server";
import type { ServicoPublicado } from "./catalogo-conhecimento";
import type { ProcedimentoSolicitado } from "./procedimento-sessao";

export class VinculoProcedimentoError extends Error {
  readonly codigo = "PROCEDIMENTO_AGENDA_NAO_VINCULADO";
}

/** O ID do catálogo identifica a publicação; procedimento_id identifica a agenda.
 * Nunca inferir este vínculo pelo nome, pelo executor ou pela especialidade. */
export async function resolverProcedimentoOperacional(clinicaId: string, pedido: ProcedimentoSolicitado) {
  if (pedido.clinica_id !== clinicaId) throw new VinculoProcedimentoError("O pedido pertence a outra clínica.");
  const publicados = await lerPublicados<ServicoPublicado>("nina_cat_servicos", COLUNAS_SERVICO, clinicaId, [pedido.catalogo_id]);
  const publicado = publicados.find(s => s.id === pedido.catalogo_id);
  if (!publicado?.procedimento_id)
    throw new VinculoProcedimentoError("O atendimento foi encontrado na base, mas falta seu vínculo por ID com o procedimento da agenda.");
  if (pedido.procedimento_id && pedido.procedimento_id !== publicado.procedimento_id)
    throw new VinculoProcedimentoError("O vínculo do procedimento mudou após a escolha. A equipe precisa conferir antes de reservar.");
  const { data, error } = await supabaseAdmin.from("procedimentos").select("id, nome, tipo")
    .eq("clinica_id", clinicaId).eq("id", publicado.procedimento_id).eq("ativo", true).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !["exame", "procedimento"].includes(data.tipo))
    throw new VinculoProcedimentoError("O procedimento vinculado não está ativo nesta clínica ou possui categoria incompatível.");
  return { id: data.id, nome: data.nome };
}

/** Ausência de configuração não é ausência de vagas. Só retornar agendas que
 * declaram executar exatamente este procedimento e pertencem à clínica. */
export async function agendasDoProcedimento(clinicaId: string, procedimentoId: string) {
  const { data: procedimento, error: erroProcedimento } = await supabaseAdmin.from("procedimentos")
    .select("id").eq("clinica_id", clinicaId).eq("id", procedimentoId).eq("ativo", true).maybeSingle();
  if (erroProcedimento) throw new Error(erroProcedimento.message);
  if (!procedimento) throw new VinculoProcedimentoError("Procedimento da agenda ausente ou inativo nesta clínica.");
  const { data, error } = await supabaseAdmin.from("medico_agenda_procedimentos").select("agenda_id")
    .eq("clinica_id", clinicaId).eq("procedimento_id", procedimentoId);
  if (error) throw new Error(error.message);
  const ids = [...new Set((data ?? []).map(v => v.agenda_id))];
  if (!ids.length) throw new VinculoProcedimentoError("Nenhuma agenda está vinculada ao ID deste procedimento; a equipe deve conferir o cadastro.");
  const { data: agendas, error: erroAgendas } = await supabaseAdmin.from("medico_agendas").select("id")
    .eq("clinica_id", clinicaId).eq("ativo", true).in("id", ids);
  if (erroAgendas) throw new Error(erroAgendas.message);
  if (!agendas?.length) throw new VinculoProcedimentoError("As agendas vinculadas ao procedimento estão inativas ou fora desta clínica.");
  return agendas.map(a => a.id);
}
