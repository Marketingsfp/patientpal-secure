/**
 * CICLO DE TESTE DA NINA (homologação) — regras puras, sem banco.
 *
 * Cada atendimento de um Lead de teste é um CICLO independente
 * (`test_cycle_id` = `nina_teste_ciclos.id`). Um lead pode ter vários ciclos,
 * mas apenas UM ativo por vez (garantido também por índice único no banco).
 *
 * Histórico (mensagens, traces, execuções, avaliações, métricas, resumos)
 * permanece vinculado ao ciclo em que aconteceu e NUNCA é apagado ao encerrar.
 * O que termina com o ciclo é a MEMÓRIA ATIVA da Nina (estado do fluxo,
 * telefone virtual da sessão, contexto enviado ao modelo).
 *
 * Nada aqui vale para conversas reais de produção.
 */

/** Situação persistida em `nina_teste_ciclos.status`. */
export type StatusCicloTeste =
  | "ativo"
  | "resolvido"
  | "encerrado_handoff"
  | "cancelado"
  | "falhou";

/** Vocabulário conceitual pedido pela homologação. */
export type EstadoCicloTeste =
  | "active"
  | "completed"
  | "completed_handoff"
  | "cancelled"
  | "failed";

const PARA_ESTADO: Record<StatusCicloTeste, EstadoCicloTeste> = {
  ativo: "active",
  resolvido: "completed",
  encerrado_handoff: "completed_handoff",
  cancelado: "cancelled",
  falhou: "failed",
};

const PARA_STATUS: Record<EstadoCicloTeste, StatusCicloTeste> = {
  active: "ativo",
  completed: "resolvido",
  completed_handoff: "encerrado_handoff",
  cancelled: "cancelado",
  failed: "falhou",
};

export const STATUS_CICLO_TESTE = Object.keys(PARA_ESTADO) as StatusCicloTeste[];

export function estadoCiclo(status: string | null | undefined): EstadoCicloTeste {
  return PARA_ESTADO[(status ?? "") as StatusCicloTeste] ?? "active";
}

export function statusCiclo(estado: EstadoCicloTeste): StatusCicloTeste {
  return PARA_STATUS[estado];
}

export function cicloAtivo(status: string | null | undefined): boolean {
  return status === "ativo";
}

/** Motivo do encerramento — usado em `end_reason` e nos relatórios. */
export type MotivoFimCiclo =
  | "resolvido_manual"
  | "reiniciado"
  | "handoff_humano"
  | "cenario_concluido"
  | "cancelado_usuario"
  | "falha_tecnica";

const STATUS_POR_MOTIVO: Record<MotivoFimCiclo, StatusCicloTeste> = {
  resolvido_manual: "resolvido",
  reiniciado: "resolvido",
  cenario_concluido: "resolvido",
  handoff_humano: "encerrado_handoff",
  cancelado_usuario: "cancelado",
  falha_tecnica: "falhou",
};

export function statusPorMotivo(motivo: MotivoFimCiclo): StatusCicloTeste {
  return STATUS_POR_MOTIVO[motivo];
}

export type CicloTeste = {
  id: string;
  lead_id: string;
  status: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  end_reason?: string | null;
  nina_session_id?: string | null;
  conversa_id?: string | null;
};

/** Patch canônico de encerramento — sempre marca fim, motivo e situação. */
export function patchEncerrarCiclo(motivo: MotivoFimCiclo, agoraISO?: string) {
  const agora = agoraISO ?? new Date().toISOString();
  return {
    status: statusPorMotivo(motivo),
    end_reason: motivo,
    ended_at: agora,
    // Encerrar o ciclo É invalidar a memória ativa: o mesmo instante serve de
    // prova, no diagnóstico, de que o reset aconteceu.
    memory_reset_at: agora,
    resolved_at: agora,
  } as const;
}

/** Um ciclo encerrado nunca volta a ser ativo; só um novo ciclo é criado. */
export function podeEncerrar(ciclo: CicloTeste | null | undefined): boolean {
  return Boolean(ciclo && cicloAtivo(ciclo.status));
}

/** Ciclo ativo de um lead (no máximo um). */
export function cicloAtivoDoLead(ciclos: CicloTeste[], leadId: string): CicloTeste | null {
  return ciclos.find((c) => c.lead_id === leadId && cicloAtivo(c.status)) ?? null;
}

/** Diagnóstico: aponta estados inconsistentes gravados no banco. */
export function inconsistenciasCiclos(ciclos: CicloTeste[]): string[] {
  const problemas: string[] = [];
  const ativosPorLead = new Map<string, number>();
  for (const c of ciclos) {
    if (cicloAtivo(c.status)) {
      ativosPorLead.set(c.lead_id, (ativosPorLead.get(c.lead_id) ?? 0) + 1);
      if (c.ended_at) problemas.push(`ciclo ${c.id} ativo com data de encerramento`);
    } else if (!c.ended_at) {
      problemas.push(`ciclo ${c.id} encerrado sem data de encerramento`);
    }
  }
  for (const [leadId, n] of ativosPorLead) {
    if (n > 1) problemas.push(`lead ${leadId} com ${n} ciclos ativos`);
  }
  return problemas;
}

/** Identificador da sessão de memória da Nina para o ciclo. */
export function novoNinaSessionId(cicloId: string): string {
  return `nina_sess_${cicloId}`;
}

/* ---------------- FASE 3 — divisores visuais entre ciclos ----------------
 * Marcadores só para a leitura humana do console de homologação. São gravados
 * como mensagem de sistema e NUNCA entram no contexto enviado ao modelo.
 */

const ROTULO_FIM: Record<MotivoFimCiclo, string> = {
  resolvido_manual: "Resolvido manualmente",
  reiniciado: "Reiniciado",
  handoff_humano: "handoff para atendimento humano",
  cenario_concluido: "Cenário concluído",
  cancelado_usuario: "Cancelado",
  falha_tecnica: "Falha técnica",
};

export function divisorFimCiclo(sessaoSeq: number | null | undefined, motivo: MotivoFimCiclo) {
  return `───── Ciclo ${sessaoSeq ?? "?"} encerrado — ${ROTULO_FIM[motivo]} ─────`;
}

export function divisorInicioCiclo(sessaoSeq: number | null | undefined) {
  return `───── Ciclo ${sessaoSeq ?? "?"} iniciado — nova sessão da Nina ─────`;
}

/* ---------------- FASE 5 — diagnóstico dos ciclos (QA) -------------------
 * Leitura de auditoria: prova que o ciclo foi encerrado e que a memória ativa
 * foi invalidada, sem apagar nada. Puro: recebe as linhas já lidas do banco.
 */

export type LinhaDiagnosticoCiclo = {
  ciclo_seq: number;
  cycle_id: string;
  nina_session_id: string | null;
  cycle_status: EstadoCicloTeste;
  end_reason: string | null;
  started_at: string | null;
  ended_at: string | null;
  memory_reset_at: string | null;
  conversa_id: string | null;
  sessao: number | null;
  memoria_resetada: boolean;
};

export type CicloDiagnosticoRow = CicloTeste & {
  memory_reset_at?: string | null;
  sessao_seq?: number | null;
  created_at?: string | null;
};

/** Ordena do ciclo mais antigo para o mais novo e numera (ciclo 1, 2, 3…). */
export function diagnosticoCiclos(ciclos: CicloDiagnosticoRow[]): LinhaDiagnosticoCiclo[] {
  const ordenados = [...ciclos].sort((a, b) =>
    String(a.started_at ?? a.created_at ?? "").localeCompare(
      String(b.started_at ?? b.created_at ?? ""),
    ),
  );
  return ordenados.map((c, i) => ({
    ciclo_seq: i + 1,
    cycle_id: c.id,
    nina_session_id: c.nina_session_id ?? null,
    cycle_status: estadoCiclo(c.status),
    end_reason: c.end_reason ?? null,
    started_at: c.started_at ?? c.created_at ?? null,
    ended_at: c.ended_at ?? null,
    memory_reset_at: c.memory_reset_at ?? null,
    conversa_id: c.conversa_id ?? null,
    sessao: c.sessao_seq ?? null,
    memoria_resetada: !cicloAtivo(c.status) && Boolean(c.memory_reset_at),
  }));
}

/** Ciclos encerrados sem prova de reset — usado nas checagens de QA. */
export function ciclosSemProvaDeReset(linhas: LinhaDiagnosticoCiclo[]): LinhaDiagnosticoCiclo[] {
  return linhas.filter((l) => l.cycle_status !== "active" && !l.memoria_resetada);
}
