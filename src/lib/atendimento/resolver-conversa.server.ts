/**
 * RESOLVER CONVERSA — núcleo único de encerramento.
 *
 * É o MESMO caminho usado quando um atendente clica em "Resolver" e quando a
 * Nina encerra automaticamente o atendimento. Não existe uma segunda lógica
 * de encerramento no sistema.
 *
 * O que faz: cancela prazos/estados transacionais, grava status encerrado,
 * limpa responsável ativo, registra o evento na timeline e atualiza o resumo
 * vigente para refletir o desfecho final.
 *
 * O que NUNCA faz: apagar histórico, mensagens, CRM, agendamentos, auditoria
 * ou resumos anteriores (que ficam como histórico).
 */

type Db = {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export type ResolverConversaArgs = {
  clinicaId: string;
  conversaId: string;
  /** Atendente que resolveu. `null` = resolução automática pela Nina. */
  userId: string | null;
  /** Resolução automática da Nina após o paciente confirmar que não precisa de mais nada. */
  automatico?: boolean;
  motivo?: string | null;
};

export async function resolverConversaCore(
  db: Db,
  args: ResolverConversaArgs,
): Promise<{ ok: true; protocol: string | null }> {
  const { data: dono } = await db
    .from("atend_conversas")
    .select("atribuida_user_id, last_assigned_user_id, nina_fluxo_estado")
    .eq("id", args.conversaId)
    .eq("clinica_id", args.clinicaId)
    .maybeSingle();

  const { data: prot } = await db.rpc("atend_gerar_protocolo", { _clinica_id: args.clinicaId });

  // Prazos de espera e estados transacionais morrem com a resolução.
  const { limparEsperaPaciente } = await import("@/lib/nina/espera-paciente.server");
  await limparEsperaPaciente(args.clinicaId, args.conversaId);
  const { encerrarEstadosTransacionais } = await import("@/lib/nina/sessao");
  const { normalizarEstado } = await import("@/lib/nina/fluxo-estado-normalizar");
  const estadoEncerrado = encerrarEstadosTransacionais(
    normalizarEstado((dono as { nina_fluxo_estado?: unknown } | null)?.nina_fluxo_estado ?? null),
  );

  const agoraISO = new Date().toISOString();
  const ultimoAtendente =
    (dono as { atribuida_user_id?: string | null } | null)?.atribuida_user_id ??
    (dono as { last_assigned_user_id?: string | null } | null)?.last_assigned_user_id ??
    args.userId ??
    null;

  const { error } = await db
    .from("atend_conversas")
    .update({
      status: "closed",
      owner_type: "AI",
      ai_enabled: true,
      atribuida_user_id: null,
      last_assigned_user_id: ultimoAtendente,
      resolved_by: args.userId,
      resolved_at: agoraISO,
      closed_at: agoraISO,
      protocol_number: (prot as string) ?? null,
      nina_fluxo_estado: { ...estadoEncerrado, updated_at: agoraISO },
      handoff_resumo: null,
      handoff_motivo: null,
      awaiting_patient_since: null,
      patient_response_deadline: null,
    })
    .eq("id", args.conversaId)
    .eq("clinica_id", args.clinicaId);
  if (error) throw new Error((error as { message?: string }).message ?? "Falha ao resolver conversa");

  const { error: errEvento } = await db.from("atend_conversa_eventos").insert({
    clinica_id: args.clinicaId,
    conversa_id: args.conversaId,
    evento: "FINALIZADA",
    user_id: args.userId,
    motivo: args.motivo ?? null,
    detalhes: {
      protocolo: (prot as string) ?? null,
      resolvido_por: args.userId,
      resolvido_em: agoraISO,
      ultimo_atendente: ultimoAtendente,
      automatico: Boolean(args.automatico),
      ...(args.automatico ? { resolvido_por_nome: "Nina" } : {}),
    },
  });
  if (errEvento)
    console.error("[resolver-conversa] evento não registrado", (errEvento as any)?.message);

  // Resumo vigente passa a representar o resultado FINAL do atendimento.
  try {
    const { registrarDesfechoResumo } = await import("./handoff-resumo.server");
    await registrarDesfechoResumo({
      clinicaId: args.clinicaId,
      conversaId: args.conversaId,
      desfecho: "conversa_resolvida",
      resolvidoPor: args.userId,
    });
  } catch (e) {
    console.error("[resolver-conversa] falha ao atualizar resumo", e);
  }

  return { ok: true, protocol: (prot as string) ?? null };
}
