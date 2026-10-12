/**
 * Estado estruturado do atendimento/agendamento da Nina (server-only).
 *
 * POR QUE EXISTE: o contexto do paciente vivia apenas dentro de UMA chamada
 * do modelo. `identificar_paciente` gravava `ctx.pacienteId` em memória; na
 * mensagem seguinte o contexto era remontado do zero (só pelo telefone), o
 * `pacienteId` voltava a ser nulo e a ferramenta `agendar` devolvia
 * PATIENT_NOT_VERIFIED — o modelo traduzia isso para "esqueci de confirmar
 * seus dados" e pedia CPF/nome/nascimento de novo, mesmo já tendo dito
 * "encontrei seu cadastro".
 *
 * A correção é guardar na PRÓPRIA CONVERSA (coluna `nina_fluxo_estado`) um
 * estado pequeno e estruturado: quem é o paciente (id, primeiro nome, se está
 * identificado/validado), o que já foi escolhido do agendamento e em que
 * etapa o fluxo está. Esse estado é recarregado antes de cada chamada do
 * modelo e reescrito depois das ferramentas.
 *
 * PRIVACIDADE: não guardamos CPF nem data de nascimento aqui. O que interessa
 * é o `paciente_id` interno — é ele que a criação do agendamento usa. Os dados
 * pessoais ficam só no cadastro do paciente.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type { EtapaFluxoNina, EstadoFluxoNina } from "./fluxo-estado-normalizar";
export { estadoVazio, normalizarEstado } from "./fluxo-estado-normalizar";

import type { EstadoFluxoNina } from "./fluxo-estado-normalizar";
import { normalizarEstado, estadoVazio } from "./fluxo-estado-normalizar";
import { reservaDaSessaoAtual } from "./agendamento-sessao";

type Db = SupabaseClient<any, any, any>;

export async function carregarFluxoEstado(
  db: Db,
  clinicaId: string,
  conversaId: string | null,
): Promise<EstadoFluxoNina> {
  if (!conversaId) return estadoVazio();
  const { data } = await db
    .from("atend_conversas")
    .select("nina_fluxo_estado")
    .eq("id", conversaId)
    .eq("clinica_id", clinicaId)
    .maybeSingle();
  return normalizarEstado((data as any)?.nina_fluxo_estado ?? null);
}

export async function salvarFluxoEstado(
  db: Db,
  clinicaId: string,
  conversaId: string | null,
  estado: EstadoFluxoNina,
): Promise<void> {
  if (!conversaId) return;
  try {
    await db
      .from("atend_conversas")
      .update({
        nina_fluxo_estado: { ...estado, updated_at: new Date().toISOString() },
        // Reserva comprovada ou handoff encerram a espera no mesmo UPDATE.
        // Despedida/aviso posterior não podem iniciar outro encaminhamento.
        ...(reservaDaSessaoAtual(estado) || estado.flow.stage === "HANDOFF"
          ? { awaiting_patient_since: null, patient_response_deadline: null }
          : {}),
      } as never)
      .eq("id", conversaId)
      .eq("clinica_id", clinicaId);
  } catch (e) {
    // Estado é otimização de contexto: se falhar, o atendimento continua.
    console.error("[nina-fluxo] falha ao salvar estado", e);
  }
}

/** Encerramento do fluxo: conversa resolvida, cancelada ou sessão nova. */
export async function limparFluxoEstado(
  db: Db,
  clinicaId: string,
  conversaId: string | null,
): Promise<void> {
  if (!conversaId) return;
  try {
    await db
      .from("atend_conversas")
      .update({ nina_fluxo_estado: null } as never)
      .eq("id", conversaId)
      .eq("clinica_id", clinicaId);
  } catch (e) {
    console.error("[nina-fluxo] falha ao limpar estado", e);
  }
}
