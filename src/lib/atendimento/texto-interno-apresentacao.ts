/** Apresentação para a equipe. Nunca altera o registro original de diagnóstico. */
export function contemRegistroTecnico(texto: string): boolean {
  const semEmails = texto.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "");
  return (
    /\b[a-z][a-z\d]*(?:_[a-z\d]+)+\b/i.test(semEmails) ||
    /[{}]|\[\s*["{]/.test(texto) ||
    /\b(?:[\w]*Error|Exception|SQLSTATE|PGRST\d+|UNAUTHORIZED|UNDEFINED|NULL|CLARIFY|BLOCK|HANDOFF|runtime|fallback|trace|stack|timeout|tokens?|prompt|retrieval|JSON|API|RLS|supabase|confidence-v\d+)\b/i.test(
      texto,
    ) ||
    /\b(?:HTTP\s+[45]\d\d|at\s+\S+\s+\(.*:\d+|select\s+.+\s+from\s+)/i.test(texto) ||
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(texto)
  );
}

/** Texto livre operacional continua visível; payloads e erros técnicos ficam no diagnóstico. */
export function textoOperacional(valor: unknown, alternativa: string | null = null): string | null {
  if (typeof valor !== "string" || !valor.trim()) return alternativa;
  const texto = valor.trim();
  return texto.length > 600 || contemRegistroTecnico(texto) ? alternativa : texto;
}

export function motivoParaAtendimento(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  const motivos: Array<[RegExp, string]> = [
    [
      /\bCATALOGO_IDENTIFICACAO_NAO_ESCLARECIDA\b/i,
      "A Nina pediu esclarecimento uma vez e ainda não conseguiu identificar com segurança o atendimento ou o profissional solicitado. A equipe dará continuidade.",
    ],
    [
      /\bCATALOGO_SEM_REGISTRO\b/i,
      "A Nina não encontrou a consulta ou o procedimento solicitado na base de conhecimentos.",
    ],
    [
      /\b(?:MISSING_REQUIRED_SOURCE|MSSING_REQUIRED_SOURCE|UNGROUNDED_CLAIM|informacao_indisponivel)\b/i,
      "A equipe precisa conferir as informações solicitadas pelo paciente.",
    ],
    [
      /\b(?:ENTIDADE_AMBIGUA|INTENCAO_AMBIGUA|AMBIGUOUS_ENTITY)\b/i,
      "É necessário esclarecer a solicitação do paciente antes de continuar.",
    ],
    [
      /\b(?:patient_response_timeout|timeout_sem_resposta)\b/i,
      "O paciente não respondeu à última mensagem da Nina em 30 minutos.",
    ],
    [
      /\b(?:patient_request|pedido_do_paciente|solicitacao_paciente)\b/i,
      "O paciente pediu atendimento humano.",
    ],
    [
      /\b(?:AGENDA_SEM_VAGAS|NO_AVAILABILITY)\b/i,
      "A Nina consultou a agenda e não encontrou vagas disponíveis para o atendimento solicitado. A equipe dará continuidade ao agendamento.",
    ],
    [
      /\b(?:sem_vagas|sem_disponibilidade|slot_unavailable|no_slots_available)\b/i,
      "Não foi encontrada uma vaga disponível para o agendamento solicitado.",
    ],
    [
      /\b(?:limite_rodadas|max_rounds|tool_error|llm_error|watchdog_timeout)\b/i,
      "A Nina não conseguiu concluir a solicitação. A equipe dará continuidade ao atendimento.",
    ],
  ];
  const traducao = motivos.find(([padrao]) => padrao.test(valor));
  return (
    traducao?.[1] ??
    textoOperacional(valor, "A equipe dará continuidade à solicitação do paciente.")
  );
}

/** O registro de envio do protocolo não comprova que uma atendente assumiu. */
export function avisoProtocolo(evento: {
  motivo?: string | null;
  detalhes?: unknown;
}): string | null {
  const det = (evento.detalhes ?? {}) as Record<string, unknown>;
  const motivo = evento.motivo ?? "";
  const extraido = /^Protocolo\s+([\w.-]+)\s+(gerado|informado)/i.exec(motivo);
  const protocolo = textoOperacional(det.protocol_number ?? extraido?.[1]);
  if (!protocolo) return null;
  if (det.protocolo_informado === true || extraido?.[2]?.toLowerCase() === "informado")
    return `Protocolo ${protocolo} informado ao paciente`;
  if (extraido?.[2]?.toLowerCase() === "gerado") return `Protocolo ${protocolo} gerado`;
  return null;
}
