/**
 * FASE 1 — Estrutura ÚNICA de metadados internos das mensagens da Nina.
 *
 * Objetivo: produção, homologação e Test Runner consomem a MESMA estrutura de
 * dados de observabilidade/QA. Este módulo é PURO: não lê banco, não faz rede,
 * não conhece componente visual e não altera nada do comportamento da Nina
 * (prompt, modelo, catálogo, handoff, agendamento).
 *
 * REGRA DURA: nada é inventado. Todo campo ausente vira `null` — nunca um
 * valor estimado, herdado de outra mensagem ou deduzido do texto.
 */

/** Ambientes explicitamente separados (impede misturar teste com métrica real). */
export type AmbienteMensagemNina = "production" | "homologation" | "automated_test";

/** Situação do reporte de erro daquela mensagem, quando existir registro. */
export type SituacaoReporteNina = { status: string; categoria: string | null; em: string } | null;

/** Entrada crua: o que cada tela já tem em mãos, sem consulta extra. */
export type EntradaMetadadosMensagem = {
  messageId: string;
  /** Conversa real (produção). */
  conversaId?: string | null;
  /** Conversa de homologação/Test Runner. */
  conversaTesteId?: string | null;
  isTeste?: boolean | null;
  /** `true` somente quando a mensagem foi produzida por execução automatizada. */
  execucaoAutomatizada?: boolean | null;
  cicloId?: string | null;
  ninaSessionId?: string | null;
  criadaEm?: string | null;
  enviadaEm?: string | null;
  /** Execução da Nina que gerou a mensagem — é o elo com trace e confiança. */
  execucaoId?: string | null;
  /** Snapshot de confiança JÁ persistido. Nunca recalculado aqui. */
  confianca?: { score: number; nivel: string } | null;
  reporte?: SituacaoReporteNina;
};

/** Estrutura compartilhada pelos três ambientes. */
export type MetadadosMensagemNina = {
  message_id: string;
  conversation_id: string | null;
  test_conversation_id: string | null;
  environment: AmbienteMensagemNina;
  cycle_id: string | null;
  nina_session_id: string | null;
  created_at: string | null;
  sent_at: string | null;
  confidence_score: number | null;
  confidence_level: string | null;
  audit_trace_id: string | null;
  report_status: string | null;
  report: SituacaoReporteNina;
};

/** Classificação explícita do ambiente da mensagem. */
export function classificarAmbienteMensagem(entrada: {
  isTeste?: boolean | null;
  execucaoAutomatizada?: boolean | null;
}): AmbienteMensagemNina {
  if (!entrada.isTeste) return "production";
  return entrada.execucaoAutomatizada ? "automated_test" : "homologation";
}

/** Monta os metadados internos de UMA mensagem, sem inventar valores. */
export function montarMetadadosMensagemNina(
  entrada: EntradaMetadadosMensagem,
): MetadadosMensagemNina {
  const environment = classificarAmbienteMensagem(entrada);
  const teste = environment !== "production";
  return {
    message_id: entrada.messageId,
    conversation_id: teste ? null : (entrada.conversaId ?? null),
    test_conversation_id: teste ? (entrada.conversaTesteId ?? entrada.conversaId ?? null) : null,
    environment,
    cycle_id: teste ? (entrada.cicloId ?? null) : (entrada.cicloId ?? null),
    nina_session_id: entrada.ninaSessionId ?? null,
    created_at: entrada.criadaEm ?? null,
    sent_at: entrada.enviadaEm ?? null,
    confidence_score: entrada.confianca ? entrada.confianca.score : null,
    confidence_level: entrada.confianca ? entrada.confianca.nivel : null,
    audit_trace_id: entrada.execucaoId ?? null,
    report_status: entrada.reporte ? entrada.reporte.status : null,
    report: entrada.reporte ?? null,
  };
}

/**
 * IDs de execução das respostas da Nina de uma lista de mensagens, já
 * deduplicados — base para buscar confiança em UM único lote (sem N+1).
 */
export function execucoesDasRespostasNina(
  mensagens: Array<{
    direction?: string | null;
    enviada_por?: string | null;
    execucao_id?: string | null;
  }>,
): string[] {
  const ids = mensagens
    .filter((m) => m.direction === "out" && m.enviada_por === "nina" && m.execucao_id)
    .map((m) => String(m.execucao_id));
  return [...new Set(ids)];
}
