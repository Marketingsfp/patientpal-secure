/**
 * FASE 5 — verificações objetivas da atribuição automática para o Test Runner.
 *
 * São conferências determinísticas, feitas sobre o que o sistema registrou na
 * auditoria da atribuição (`atend_conversa_eventos` → detalhes). Não dependem
 * do avaliador de IA (Sol), que continua responsável apenas pelo que é
 * subjetivo: naturalidade, clareza, adequação da mensagem.
 */

export type CandidatoAvaliado = {
  user_id: string;
  /** Perfil TELEFONIA em Cadastros › Perfis (fonte oficial da elegibilidade). */
  perfil_telefonia?: boolean;
  /** Nome antigo do mesmo campo, mantido para eventos já gravados. */
  permission_telefonia?: boolean;
  presence_status: string;
  aceita_novas?: boolean;
  presenca_recente?: boolean;
  em_pausa?: boolean;
  admin: boolean;
  load_at_selection?: number;
  elegivel: boolean;
  motivo_exclusao: string | null;
};

/** Registro de auditoria de uma atribuição automática. */
export type AuditoriaAtribuicao = {
  conversation_id: string;
  handoff_event_id?: string | null;
  selected_user_id: string | null;
  perfil_telefonia?: boolean;
  permission_telefonia?: boolean;
  presence_status?: string | null;
  load_at_selection?: number | null;
  unit_queue?: string | null;
  assignment_method?: string | null;
  assigned_at?: string | null;
  candidates_evaluated?: CandidatoAvaliado[];
};

export type VerificacaoAtribuicao = {
  assigned_user_has_telefonia: boolean;
  assigned_user_online: boolean;
  assigned_user_admin: boolean;
  duplicate_assignment: boolean;
  audit_complete: boolean;
  /** Falhas encontradas, em linguagem direta, para o relatório do teste. */
  falhas: string[];
};

const CAMPOS_OBRIGATORIOS: (keyof AuditoriaAtribuicao)[] = [
  "conversation_id",
  "selected_user_id",
  "presence_status",
  "assignment_method",
  "assigned_at",
];

/**
 * Confere uma atribuição. `eventosDaConversa` recebe todas as atribuições
 * automáticas registradas para a mesma conversa, para detectar duplicidade.
 */
export function verificarAtribuicao(
  auditoria: AuditoriaAtribuicao,
  eventosDaConversa: AuditoriaAtribuicao[] = [auditoria],
): VerificacaoAtribuicao {
  const escolhido = (auditoria.candidates_evaluated ?? []).find(
    (c) => c.user_id === auditoria.selected_user_id,
  );

  // Perfil TELEFONIA: aceita o nome atual e o antigo (eventos já gravados).
  const temTelefonia = escolhido
    ? (escolhido.perfil_telefonia ?? escolhido.permission_telefonia) === true
    : (auditoria.perfil_telefonia ?? auditoria.permission_telefonia) === true;
  // FASE 2 — presença é manual: `presenca_recente` (heartbeat) é só informação
  // técnica e não decide mais se o atendente estava disponível.
  const online = escolhido
    ? escolhido.presence_status === "ONLINE" &&
      escolhido.aceita_novas !== false &&
      escolhido.em_pausa !== true
    : auditoria.presence_status === "ONLINE";
  const admin = escolhido ? escolhido.admin : false;

  const atribuicoes = eventosDaConversa.filter((e) => e.selected_user_id);
  const duplicada = atribuicoes.length > 1;

  const auditCompleta = CAMPOS_OBRIGATORIOS.every(
    (k) => auditoria[k] !== undefined && auditoria[k] !== null,
  );

  const falhas: string[] = [];
  if (!auditoria.selected_user_id) falhas.push("nenhum atendente foi atribuído");
  if (!temTelefonia) falhas.push("atendente atribuído sem o perfil Telefonia");
  if (!online) falhas.push("atendente atribuído não estava Online");
  if (admin) falhas.push("atendente atribuído é administrador");
  if (duplicada) falhas.push("conversa recebeu mais de uma atribuição automática");
  if (!auditCompleta) falhas.push("auditoria da atribuição incompleta");

  return {
    assigned_user_has_telefonia: temTelefonia,
    assigned_user_online: online,
    assigned_user_admin: admin,
    duplicate_assignment: duplicada,
    audit_complete: auditCompleta,
    falhas,
  };
}

export type CriterioAtribuicao = { criterio: string; esperado: boolean; obtido: boolean; ok: boolean };

/** Lista PASS/FAIL pronta para o relatório do Test Runner. */
export function criteriosDeAtribuicao(v: VerificacaoAtribuicao): CriterioAtribuicao[] {
  const linha = (criterio: string, esperado: boolean, obtido: boolean): CriterioAtribuicao => ({
    criterio,
    esperado,
    obtido,
    ok: esperado === obtido,
  });
  return [
    linha("assigned_user_has_telefonia", true, v.assigned_user_has_telefonia),
    linha("assigned_user_online", true, v.assigned_user_online),
    linha("assigned_user_admin", false, v.assigned_user_admin),
    linha("duplicate_assignment", false, v.duplicate_assignment),
    linha("audit_complete", true, v.audit_complete),
  ];
}

/** Motivos de exclusão em texto curto, para a tela de diagnóstico/homologação. */
export function resumoExclusoes(
  candidatos: CandidatoAvaliado[],
  nomePorUser: Record<string, string> = {},
): string[] {
  const rotulo: Record<string, string> = {
    // Motivo atual devolvido por `atend_pool_telefonia_avaliacao` (perfil real).
    sem_perfil_telefonia: "sem Telefonia",
    // Nome antigo, mantido para eventos já gravados na auditoria.
    missing_telefonia_permission: "sem Telefonia",
    admin_excluido: "Admin",
    em_pausa: "Pausa",
    nao_aceita_novas: "não aceita novas",
    presenca_desatualizada: "presença desatualizada",
    capacidade_lotada: "capacidade lotada",
    setor_incompativel: "setor incompatível",
    status_offline: "Offline",
    status_away: "Ausente",
    status_busy: "Ocupado",
  };
  return candidatos.map((c) => {
    const nome = nomePorUser[c.user_id] ?? c.user_id;
    if (c.elegivel) return `${nome} → elegível`;
    return `${nome} → excluído: ${rotulo[c.motivo_exclusao ?? ""] ?? c.motivo_exclusao ?? "motivo desconhecido"}`;
  });
}
