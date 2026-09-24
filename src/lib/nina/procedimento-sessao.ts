import type { EstadoFluxoNina } from "./fluxo-estado-normalizar";
import type { ResultadoConhecimento } from "./knowledge-contract";
import { conhecimentoDaMesmaSessao } from "./confidence/conhecimento-sessao";
import { limparEscolhaAgendamento } from "./agendamento-escolha";

/** Identidade do pedido, independente da última busca auxiliar e da especialidade. */
export type ProcedimentoSolicitado = {
  clinica_id: string; session_id: string; catalogo_id: string; nome: string;
  tipo_atendimento: "exame_procedimento";
};

export function procedimentoDaSessao(estado: EstadoFluxoNina | undefined, clinicaId: string): ProcedimentoSolicitado | null {
  if (!estado?.session_id) return null;
  const salvo = estado.appointment.procedimento_solicitado;
  if (salvo?.clinica_id === clinicaId && salvo.session_id === estado.session_id &&
    salvo.tipo_atendimento === "exame_procedimento" && salvo.catalogo_id && salvo.nome) return salvo;
  const contexto = conhecimentoDaMesmaSessao(estado.knowledge_context, clinicaId, estado.session_id);
  if (contexto?.consulta.tipo_atendimento !== "exame_procedimento" || contexto.esclarecimento?.tipo === "procedimento") return null;
  const refs = contexto.referencias.filter(r => r.registro && r.procedimento);
  if (!refs.length || refs.some(r => r.registro !== refs[0]!.registro || r.procedimento !== refs[0]!.procedimento)) return null;
  return { clinica_id: clinicaId, session_id: estado.session_id, catalogo_id: refs[0]!.registro,
    nome: refs[0]!.procedimento!, tipo_atendimento: "exame_procedimento" };
}

export function lembrarProcedimentoSolicitado(estado: EstadoFluxoNina | undefined, clinicaId: string,
  resultado: ResultadoConhecimento, novaSolicitacao = false) {
  if (!estado?.session_id || estado.appointment.appointment_id) return;
  if (novaSolicitacao) {
    estado.knowledge_context = null;
    estado.appointment.procedimento_solicitado = null;
    limparEscolhaAgendamento(estado);
    estado.appointment.slot_options = null;
    estado.appointment.procedure = null;
  }
  const anterior = procedimentoDaSessao(estado, clinicaId);
  if (anterior && !novaSolicitacao) {
    estado.appointment.procedimento_solicitado = anterior;
    return;
  }
  if (!resultado.found || resultado.esclarecimento?.tipo === "procedimento") return;
  const registros = resultado.records;
  const r = registros[0];
  if (!r?.id || !r.procedimento || registros.some(item => item.tipo !== "servico" || item.id !== r.id || item.procedimento !== r.procedimento)) return;
  estado.appointment.procedimento_solicitado = { clinica_id: clinicaId, session_id: estado.session_id,
    catalogo_id: r.id, nome: r.procedimento, tipo_atendimento: "exame_procedimento" };
}

export function vagaPreservaProcedimento(estado: EstadoFluxoNina | undefined, clinicaId: string,
  vaga: { procedimento: string | null; catalogo_id?: string | null; tipo_atendimento?: string } | undefined) {
  const pedido = procedimentoDaSessao(estado, clinicaId);
  return !pedido || !!vaga && vaga.catalogo_id === pedido.catalogo_id &&
    vaga.tipo_atendimento === pedido.tipo_atendimento && vaga.procedimento === pedido.nome;
}
