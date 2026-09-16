/** Apresentação do fluxo atual. O histórico original continua preservado no banco. */
const ETAPAS_MOTOR = new Set([
  "confidence.decision",
  "answer.verify",
  "answer.review",
  "answer.low_confidence_handoff",
  "answer.rule_check",
  "answer.rule_block",
  "answer.rule_retry",
]);

export function eventoDoMotor(registro: Record<string, unknown>): boolean {
  const etapa = String(registro.node_id ?? registro.etapa ?? "");
  const titulo = registro.titulo;
  return ETAPAS_MOTOR.has(etapa) || /^(confidence\.|confianca\.|answer\.rule_)/.test(etapa) ||
    (registro.tipo === "validacao" && (
      titulo === "Fonte ausente: nova consulta antes de decidir" ||
      titulo === "Reconstrução limitada com dados oficiais"
    ));
}

const CAMPOS_MOTOR = new Set([
  "confianca", "avaliacoes", "avaliacao_operacional", "nota_do_texto_entregue",
  "bloqueios", "decisoes", "decisao_id",
]);

/** Remove apenas os campos do avaliador; não modifica textos do modelo ou da entrega. */
function semCamposMotor(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor
    .filter((v) => !v || typeof v !== "object" || !eventoDoMotor(v as Record<string, unknown>))
    .map(semCamposMotor);
  if (!valor || typeof valor !== "object") return valor;
  return Object.fromEntries(Object.entries(valor).filter(([chave]) => !CAMPOS_MOTOR.has(chave))
    .map(([chave, conteudo]) => [chave, chave === "lacunas" && Array.isArray(conteudo)
      ? conteudo.filter((v) => v !== "confianca")
      : semCamposMotor(conteudo)]));
}

export function registrosSemMotor<T extends Record<string, unknown>>(registros: T[]): T[] {
  return registros.filter((registro) => !eventoDoMotor(registro))
    .map((registro) => semCamposMotor(registro) as T);
}
