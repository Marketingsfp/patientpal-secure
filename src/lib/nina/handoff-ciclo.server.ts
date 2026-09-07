/**
 * FASE 2 — HANDOFF COMO EVENTO TERMINAL DO CICLO DE TESTE.
 *
 * Quando a Nina encaminha um Lead de teste para atendimento humano, aquele
 * ciclo termina: o status vira `encerrado_handoff`, `ended_at`/`end_reason`
 * são gravados e a MEMÓRIA ATIVA da Nina é zerada (estado de fluxo, dados
 * temporários, vaga escolhida, confirmação pendente, prazos de espera,
 * identificação em curso e o telefone virtual da sessão).
 *
 * Nada de histórico é apagado: mensagens, eventos, traces, execuções,
 * avaliações, relatórios e o resumo do handoff continuam vinculados ao ciclo
 * encerrado — apenas deixam de ser contexto ativo do próximo ciclo.
 *
 * Só vale para conversas de homologação (`atend_conversas.is_teste`).
 * Conversas reais de produção não são tocadas por este módulo.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { divisorFimCiclo, patchEncerrarCiclo } from "./ciclo-teste";

import { telefoneSessao } from "./teste-console.server";

export type ResultadoHandoffCiclo = {
  /** Encerrou o ciclo agora (false = não é teste, sem ciclo, ou já encerrado). */
  encerrado: boolean;
  cicloId: string | null;
  motivo?: "nao_e_teste" | "sem_ciclo" | "ja_encerrado";
};

/**
 * Encerra o ciclo de teste da conversa por handoff. Idempotente: só o primeiro
 * processamento encerra; repetições retornam `encerrado: false`.
 */
export async function encerrarCicloTestePorHandoff(args: {
  clinicaId: string;
  conversaId: string;
  agoraISO?: string;
}): Promise<ResultadoHandoffCiclo> {
  const agora = args.agoraISO ?? new Date().toISOString();

  const { data: conv } = await supabaseAdmin
    .from("atend_conversas")
    .select("id, is_teste, teste_ciclo_id")
    .eq("id", args.conversaId)
    .eq("clinica_id", args.clinicaId)
    .maybeSingle();

  const linha = conv as { is_teste?: boolean; teste_ciclo_id?: string | null } | null;
  if (!linha?.is_teste) return { encerrado: false, cicloId: null, motivo: "nao_e_teste" };
  const cicloId = linha.teste_ciclo_id ?? null;
  if (!cicloId) return { encerrado: false, cicloId: null, motivo: "sem_ciclo" };

  // Idempotência: o UPDATE só alcança um ciclo AINDA ativo. Se outro
  // processamento do mesmo handoff chegou antes, nada é reescrito.
  const { data: encerrados } = await supabaseAdmin
    .from("nina_teste_ciclos")
    .update(patchEncerrarCiclo("handoff_humano", agora) as never)
    .eq("id", cicloId)
    .eq("clinica_id", args.clinicaId)
    .eq("status", "ativo")
    .select("id, lead_id, indice, sessao_seq");

  const ciclo = (encerrados ?? [])[0] as
    | { id: string; lead_id: string; indice: number; sessao_seq: number }
    | undefined;
  if (!ciclo) return { encerrado: false, cicloId, motivo: "ja_encerrado" };

  // Memória ativa da Nina do ciclo encerrado. O handoff (fila, status, resumo,
  // motivo) já foi gravado por `encaminharParaHumano` e é preservado.
  await supabaseAdmin
    .from("atend_conversas")
    .update({
      nina_fluxo_estado: null,
      identidade_confirmada: false,
      identidade_perguntada_em: null,
      identidade_tentativas: 0,
      awaiting_patient_since: null,
      patient_response_deadline: null,
    } as never)
    .eq("id", args.conversaId)
    .eq("clinica_id", args.clinicaId);

  // Próxima mensagem do lead abre um ciclo novo, com telefone virtual novo:
  // nenhum estado transacional do ciclo anterior sobrevive.
  const proxima = (ciclo.sessao_seq ?? 0) + 1;
  await supabaseAdmin
    .from("nina_teste_leads")
    .update({
      sessao_seq: proxima,
      telefone_sessao: telefoneSessao(ciclo.indice, proxima),
      conversa_id: null,
      ciclo_id: null,
      ciclo_iniciado_em: null,
      resolvido_em: agora,
      status: "ativa",
    } as never)
    .eq("id", ciclo.lead_id)
    .eq("clinica_id", args.clinicaId)
    .eq("ciclo_id", cicloId);

  // Divisor visual no histórico (só para leitura humana; não vai ao modelo).
  try {
    const { registrarMarcadorSistema } = await import("@/lib/atendimento/handoff.server");
    await registrarMarcadorSistema({
      clinicaId: args.clinicaId,
      conversaId: args.conversaId,
      texto: divisorFimCiclo(ciclo.sessao_seq, "handoff_humano"),
    });
  } catch (e) {
    console.error("[handoff-ciclo] falha ao registrar divisor", e);
  }

  return { encerrado: true, cicloId };

}
