/** Formato legado do selo de confiança (motor desativado em 16/09/2026). Apenas tipos, sem acesso ao banco. */
export type ConfiancaDaMensagem = {
  execucao_id: string;
  score: number;
  nivel: "HIGH" | "MEDIUM" | "LOW";
  resultado: string;
  bloqueadores: string[];
  registrado_em: string;
  policy_version: string | null;
  /** Erro reportado depois pela equipe para a MESMA resposta (mesma execução). */
  erro_reportado: ErroReportadoVinculado | null;
  /**
   * FASE 7 — HIGH_CONFIDENCE_ERROR: alta confiança declarada que mesmo assim
   * foi reportada como erro. Derivado do snapshot + reporte já gravados.
   */
  alta_confianca_com_erro: boolean;
  /**
   * FASE 6 — o que este registro avalia. Só `answer_confidence` é confiança
   * DA RESPOSTA; `action_safety` avalia a AÇÃO e nunca vira nota do texto.
   */
  avaliacao: "answer_confidence" | "action_safety";
  /** FASE 6 — configuração efetiva usada quando a resposta foi produzida. */
  config_id: string | null;
  /**
   * FASE 6 (identidade da saída) — o que exatamente foi avaliado: texto
   * completo, áudio integral ou resumo falado. Sem isto o selo do texto
   * apareceria em cima de um áudio com outro conteúdo.
   */
  representacao?: string | null;
  /** FASE 6 — impressão digital do conteúdo avaliado (confere com o entregue?). */
  texto_final_hash?: string | null;
};

/** Vínculo entre o snapshot de confiança e o reporte de erro da equipe. */
export type ErroReportadoVinculado = {
  id: string;
  status: string;
  categoria: string | null;
  created_at: string;
};
