/**
 * Encerramento automático da Nina — camada de banco.
 *
 * Ligado por clínica pela flag `nina_encerramento_automatico_enabled`. Sem
 * linha em `clinica_feature_flags` = desligado (comportamento anterior).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decidirEncerramento, garantirMensagemFinal } from "./encerramento-automatico";
import { normalizarEstado } from "./fluxo-estado-normalizar";

export const FLAG_NINA_ENCERRAMENTO_AUTOMATICO = "nina_encerramento_automatico_enabled";

export async function flagEncerramentoAutomaticoAtiva(
  clinicaId: string | null,
): Promise<boolean> {
  if (!clinicaId) return false;
  const { data, error } = await supabaseAdmin
    .from("clinica_feature_flags")
    .select("ativo")
    .eq("clinica_id", clinicaId)
    .eq("flag_key", FLAG_NINA_ENCERRAMENTO_AUTOMATICO)
    .maybeSingle();
  if (error || !data) return false;
  return Boolean((data as { ativo?: boolean }).ativo);
}

export type AvaliacaoEncerramento = {
  encerrar: boolean;
  motivo: string;
  conversaId: string | null;
  /** Resposta ajustada para conter a mensagem final obrigatória. */
  resposta: string;
};

/**
 * Decide, ANTES do envio, se este turno encerra o atendimento e devolve a
 * resposta já com a mensagem final completa. A resolução só acontece depois
 * que o envio for confirmado (`resolverConversaPelaNina`).
 */
export async function avaliarEncerramentoAutomatico(args: {
  clinicaId: string;
  telefone: string | null;
  mensagemPaciente: string;
  resposta: string;
  handoffPendente?: boolean;
}): Promise<AvaliacaoEncerramento> {
  const negativo = (motivo: string): AvaliacaoEncerramento => ({
    encerrar: false,
    motivo,
    conversaId: null,
    resposta: args.resposta,
  });
  if (!args.telefone) return negativo("sem telefone");
  if (!(await flagEncerramentoAutomaticoAtiva(args.clinicaId))) return negativo("flag desligada");

  const { estadoConversaPorTelefone } = await import("@/lib/atendimento/handoff.server");
  const conv = (await estadoConversaPorTelefone(args.clinicaId, args.telefone)) as
    | ({ id?: string | null } & Record<string, unknown>)
    | null;
  if (!conv?.id) return negativo("conversa não localizada");

  const { data } = await supabaseAdmin
    .from("atend_conversas")
    .select("nina_fluxo_estado")
    .eq("id", conv.id)
    .eq("clinica_id", args.clinicaId)
    .maybeSingle();
  const estado = normalizarEstado((data as { nina_fluxo_estado?: unknown } | null)?.nina_fluxo_estado ?? null);

  const decisao = decidirEncerramento({
    mensagemPaciente: args.mensagemPaciente,
    estado,
    handoffPendente: args.handoffPendente ?? false,
  });
  if (!decisao.encerrar) return negativo(decisao.motivo);

  const { data: clinica } = await supabaseAdmin
    .from("clinicas")
    .select("nome")
    .eq("id", args.clinicaId)
    .maybeSingle();
  const nomeUnidade = ((clinica as { nome?: string } | null)?.nome ?? "").trim() || "nossa unidade";

  return {
    encerrar: true,
    motivo: decisao.motivo,
    conversaId: String(conv.id),
    resposta: garantirMensagemFinal(args.resposta, nomeUnidade),
  };
}

/** Resolve a conversa pelo MESMO mecanismo do botão "Resolver". */
export async function resolverConversaPelaNina(args: {
  clinicaId: string;
  conversaId: string;
}): Promise<void> {
  const { resolverConversaCore } = await import("@/lib/atendimento/resolver-conversa.server");
  await resolverConversaCore(supabaseAdmin as never, {
    clinicaId: args.clinicaId,
    conversaId: args.conversaId,
    userId: null,
    automatico: true,
    motivo: "Encerramento automático após conclusão do atendimento",
  });
}
