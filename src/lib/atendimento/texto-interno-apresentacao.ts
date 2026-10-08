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

/** Preserva o contexto legível (item, profissional ou causa) sem expor erros brutos. */
function complementoMotivo(valor: string): string {
  const sufixo = valor.slice(valor.indexOf(":") + 1).trim();
  if (!valor.includes(":")) {
    const livre = textoOperacional(valor);
    return livre ? ` Detalhe: ${livre}` : "";
  }
  const seguro = textoOperacional(sufixo);
  return seguro ? ` Detalhe: ${seguro}` : "";
}

export const MOTIVO_TRANSFERENCIA_AUSENTE = "Motivo não registrado neste atendimento.";

export function motivoParaAtendimento(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  const motivos: Array<[RegExp, string]> = [
    [/^\s*(?:\[[^\]]+\]\s*)?CANCELAMENTO_SOLICITADO\b/i, "O paciente solicitou cancelamento. A Nina encaminhou para a equipe humana realizar o atendimento; não executou o cancelamento."],
    [/^\s*(?:\[[^\]]+\]\s*)?REMARCACAO_SOLICITADA\b/i, "O paciente solicitou remarcação. A Nina encaminhou para a equipe humana realizar a alteração; não remarcou nem cancelou a reserva anterior."],
    [/\bLISTA_PROFISSIONAIS_EXTENSA\b/i, "A especialidade pedida tem mais de 8 profissionais para apresentar. Pela regra da clínica, a equipe apresenta as opções ao paciente."],
    [/\bATENDIMENTO_NAO_INFORMADO\b/i, "O paciente não informou qual consulta, exame, procedimento ou profissional deseja após a Nina perguntar. A equipe continuará o atendimento sem indicação clínica pela IA."],
    [
      /\bHORARIOS_HABITUAIS_NAO_INFORMADOS\b/i,
      "Faltam dias e horários habituais cadastrados para o profissional. A equipe precisa confirmar esses horários para continuar o atendimento.",
    ],
    [
      /^(?:\[[^\]]+\]\s*)?(?:CATALOGO_ATENDIMENTO_HUMANO\s*\/\s*)?PROFISSIONAL[_\s]+(?:[EÉ]\s+)?SFP\b/i,
      "Regra SFP: atendimento encaminhado para a equipe humana por estar vinculado ao profissional SFP.",
    ],
    [
      /\bCATALOGO_ATENDIMENTO_HUMANO\b/i,
      "O cadastro consultado exige atendimento humano para este item.",
    ],
    [
      /\bJEV_URGENCIA_CLINICA\b/i,
      "O Jev identificou sinais de possível urgência clínica; a Nina encaminhou com prioridade para a equipe.",
    ],
    [
      /\bJEV_PEDIDO_ATENDENTE\b/i,
      "O Jev identificou um pedido do paciente para falar com uma atendente.",
    ],
    [
      /\bJEV_IRRITACAO\b/i,
      "O Jev identificou irritação ou insatisfação do paciente acima do limite configurado.",
    ],
    [
      /\bJEV_DUVIDA_REPETIDA\b/i,
      "O Jev identificou dificuldade persistente de entendimento após tentativas de esclarecimento.",
    ],
    [
      /\bFOTO_NAO_LIDA_APOS_NOVA_TENTATIVA\b/i,
      "A Nina não conseguiu ler a nova foto enviada após pedir outra imagem. A equipe precisa conferir o documento.",
    ],
    [
      /\bFOTO_REQUER_AVALIACAO_HUMANA\b/i,
      "O conteúdo da foto exige avaliação humana e não pode ser tratado pela leitura administrativa da Nina.",
    ],
    [
      /\bVAGA_ESCOLHIDA_INDISPONIVEL\b/i,
      "Não foi possível concluir a reserva da vaga escolhida. A equipe deve conferir a disponibilidade sem substituir a escolha do paciente.",
    ],
    [
      /\bNINA_PROCESSING_FAILED\b/i,
      "O processamento da resposta da Nina falhou definitivamente. O sistema encaminhou para evitar deixar o paciente sem atendimento.",
    ],
    [
      /\b(?:LIMITE_RODADAS|max_rounds)\b/i,
      "A Nina atingiu o limite de etapas de processamento sem produzir uma resposta ao paciente.",
    ],
    [
      /\bMOTIVO_NAO_INFORMADO\b/i,
      "A Nina solicitou transferência, mas não informou o motivo. É necessário conferir os detalhes técnicos.",
    ],

    [
      /\bMODALIDADE_NAO_DEFINIDA\b/i,
      "A Nina encontrou o atendimento, mas a modalidade de agendamento não está definida ou apresenta informações divergentes. A equipe precisa confirmar se é horário marcado ou ordem de chegada e se exige pré-agendamento.",
    ],
    [
      /\bMODALIDADE_ALTERADA\b/i,
      "A modalidade ou a agenda do atendimento mudou após a escolha do paciente. A equipe precisa conferir as condições atuais antes de concluir o agendamento.",
    ],
    [
      /\bCATALOGO_MEDICO_NAO_IDENTIFICADO\b/i,
      "A Nina encontrou a consulta, mas não conseguiu identificar o médico desejado após reapresentar a lista e pedir uma nova escolha. A equipe deve confirmar o profissional.",
    ],
    [
      /\bCATALOGO_MEDICO_SEM_REGISTRO\b/i,
      "A Nina não encontrou o médico informado no cadastro do sistema. A equipe deve conferir o profissional solicitado.",
    ],
    [
      /\bFALHA_OPERACIONAL_AGENDAMENTO\b.*\bATENDIMENTO_AGENDA_NAO_VINCULADO\b/i,
      "A Nina encontrou vagas, mas não conseguiu vinculá-las à consulta ou ao procedimento solicitado. A equipe precisa conferir a ligação entre o catálogo e a agenda.",
    ],
    [
      /\bFALHA_OPERACIONAL_AGENDAMENTO\b/i,
      "Uma falha operacional impediu a Nina de concluir o agendamento. A equipe precisa conferir os dados e a agenda antes de tentar novamente.",
    ],
    [
      /\bCATALOGO_IDENTIFICACAO_NAO_ESCLARECIDA\b.*\bduas\b/i,
      "A Nina pediu esclarecimento duas vezes e ainda não conseguiu identificar com segurança o atendimento ou o profissional solicitado. A equipe dará continuidade.",
    ],
    [
      /\bCATALOGO_IDENTIFICACAO_NAO_ESCLARECIDA\b/i,
      "A Nina pediu esclarecimento e ainda não conseguiu identificar com segurança o atendimento ou o profissional solicitado. A equipe dará continuidade.",
    ],
    [
      /\bCATALOGO_SEM_REGISTRO\b/i,
      "A Nina não encontrou a consulta ou o procedimento solicitado no cadastro do sistema.",
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
      /\btool_error\b/i,
      "Uma ferramenta de atendimento falhou e a Nina não conseguiu continuar automaticamente.",
    ],
    [/\bllm_error\b/i, "O modelo de conversa apresentou uma falha ao produzir a resposta."],
    [
      /\bwatchdog_timeout\b/i,
      "O processamento excedeu o tempo de espera e o sistema encaminhou para a equipe.",
    ],
  ];
  const traducao = motivos.find(([padrao]) => padrao.test(valor));
  return (
    (traducao ? traducao[1] + complementoMotivo(valor) : null) ??
    textoOperacional(
      valor,
      "O motivo registrado contém informações técnicas. Consulte os detalhes técnicos da transferência.",
    )
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
