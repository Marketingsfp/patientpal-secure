/** Regras de agendamento definidas pela clínica; não são tipos de pagamento. */
export const MODALIDADES_ATENDIMENTO = {
  hora_marcada: "Hora marcada",
  chegada_com_pre_agendamento: "Ordem de chegada com pré-agendamento",
  chegada_sem_pre_agendamento: "Ordem de chegada sem pré-agendamento",
  ficha: "Por numeração (ficha)",
} as const;
export type ModalidadeAtendimento = keyof typeof MODALIDADES_ATENDIMENTO;
export type ModalidadeResolvida = ModalidadeAtendimento | "nao_definida";
export const REGRA_ANTECEDENCIA_CHEGADA =
  "Para hora marcada e atendimento por ficha, oriente o paciente a chegar com 30 minutos de antecedência para o check-in na Recepção Principal. " +
  "Na hora marcada, conte a antecedência em relação ao horário agendado; por ficha, ao horário de comparecimento informado, sem prometer a hora exata da consulta. " +
  "Essa orientação substitui a regra anterior de 15 minutos, inclusive em textos antigos. Mantenha o horário agendado e a duração da consulta; a antecedência é apenas de chegada. " +
  "Ordem de chegada, com ou sem pré-agendamento, continua sem exigência de antecedência. Preserve suas regras de comparecimento e reserva. " +
  "Escreva a orientação no bloco do atendimento, com frases curtas e a formatação habitual da Nina.";
const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();

/** Lê o campo oficial, nunca a mensagem do paciente nem argumentos do modelo. */
export function interpretarModalidade(texto?: string | null): ModalidadeResolvida | null {
  const t = normalizar(texto ?? "");
  if (!t) return null;
  const modos: ModalidadeAtendimento[] = [];
  if (/\b(?:ficha|fichas|numeracao|senha|senhas)\b/.test(t)) modos.push("ficha");
  if (/\b(?:sem|s\/)\s*(?:pre\s*)?agendamento\b/.test(t)) modos.push("chegada_sem_pre_agendamento");
  if (/\b(?:com|c\/)\s*(?:pre\s*)?agendamento\b/.test(t) && /chegada/.test(t)) modos.push("chegada_com_pre_agendamento");
  if (/hora(?:rio)?\s*marcad[ao]/.test(t)) modos.push("hora_marcada");
  if (modos.length > 1 || (modos[0] === "hora_marcada" && /chegada/.test(t))) return "nao_definida";
  if (modos.length) return modos[0]!;
  // Sem exigência explícita de pré-agendamento, basta comparecer à clínica.
  if (/ordem\s*(?:de\s*)?chegada/.test(t)) return "chegada_sem_pre_agendamento";
  // Rótulo do catálogo confirmado pela clínica; não interpretar uma frase
  // negativa ou a mensagem do paciente como modalidade de atendimento.
  if (/^(?:agendad[oa]|por agendamento)$/.test(t)) return "hora_marcada";
  return null;
}

export function modalidadeDoCatalogo(textos: readonly (string | null | undefined)[]): ModalidadeResolvida | null {
  const modos = [...new Set(textos.map(interpretarModalidade).filter((m) => m !== null))];
  return modos.length > 1 ? "nao_definida" : modos[0] ?? null;
}

export function resolverModalidade(catalogo: ModalidadeResolvida | null, ordemChegada?: boolean | null): ModalidadeResolvida {
  // O catálogo publicado distingue as quatro regras. Um booleano de ordem de
  // chegada, sozinho, não informa se há ou não pré-agendamento.
  return catalogo ?? (ordemChegada === false ? "hora_marcada" : "nao_definida");
}

export function permiteReserva(m: unknown): m is Exclude<ModalidadeAtendimento, "chegada_sem_pre_agendamento"> {
  return m === "hora_marcada" || m === "chegada_com_pre_agendamento" || m === "ficha";
}

export function orientacaoModalidade(m: ModalidadeResolvida): string {
  switch (m) {
    case "hora_marcada": return "Atendimento no horário marcado. Chegue com 30 minutos de antecedência para o check-in na Recepção Principal.";
    case "chegada_com_pre_agendamento": return "É necessário marcar um horário. Entre os pacientes daquele horário, quem chegar primeiro será atendido primeiro. O horário pré-agendado não garante o horário exato da consulta.";
    case "chegada_sem_pre_agendamento": return "Não é necessário agendar horário. Basta ir à clínica nos dias e períodos de atendimento desse profissional. Quem chegar primeiro será atendido primeiro.";
    case "ficha": return "O atendimento é por ficha, seguindo a numeração. Chegue com 30 minutos de antecedência em relação ao horário de comparecimento informado para o check-in na Recepção Principal. Esse horário não é garantia da hora da consulta.";
    default: return "A modalidade de atendimento precisa ser conferida pela equipe. Não prometa horário, ficha ou pré-agendamento.";
  }
}

export function chaveResumoModalidade(m: ModalidadeAtendimento) {
  return m === "chegada_com_pre_agendamento" ? "fluxo.agendamento.revisar_pre_agendamento"
    : m === "ficha" ? "fluxo.agendamento.revisar_ficha" : "fluxo.agendamento.revisar";
}
export function chaveConfirmacaoModalidade(m: ModalidadeAtendimento, ficha?: string | null) {
  return m === "chegada_com_pre_agendamento" ? "fluxo.agendamento.confirmado_pre_agendamento"
    : m === "ficha" ? (ficha ? "fluxo.agendamento.confirmado_ficha" : "fluxo.agendamento.confirmado_ficha_pendente")
    : "fluxo.agendamento.confirmado";
}
