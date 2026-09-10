/**
 * FASE 3 — AUTORIZAÇÃO PRÉVIA DAS AÇÕES DA NINA (parte pura, testável).
 *
 * Uma única porta decide se uma operação de ESCRITA pode ser tentada. Todas as
 * rotas (gate determinístico, ferramentas chamadas pelo modelo e retornos
 * antecipados) passam por aqui antes de qualquer gravação.
 *
 * Regras que este módulo garante:
 * - criar um agendamento NOVO nunca exige `appointment_id` nem
 *   `agendamentoConfirmado` — isso seria exigir o resultado antes da causa;
 * - consulta de disponibilidade bem-sucedida SEM vagas não autoriza nada;
 * - vaga de outro profissional, outra data ou outro intervalo não serve;
 * - consentimento precisa estar amarrado ao MESMO slot resumido ao paciente;
 * - a revisão da conversa usada no raciocínio precisa ser a atual.
 *
 * Nada aqui acessa banco: é contrato puro, para poder ser testado sem efeitos.
 */

export type OperacaoNina =
  | "criar_agendamento"
  | "cancelar_agendamento"
  | "identificar_paciente"
  | "consultar_agendamento";

/** Operações que gravam algo no sistema. */
export const OPERACOES_DE_ESCRITA: ReadonlySet<OperacaoNina> = new Set<OperacaoNina>([
  "criar_agendamento",
  "cancelar_agendamento",
  "identificar_paciente",
]);

export type CodigoRecusa =
  | "CLINICA_AUSENTE"
  | "PACIENTE_NAO_IDENTIFICADO"
  | "PACIENTE_NAO_VALIDADO"
  | "PACIENTE_DESATUALIZADO"
  | "PROFISSIONAL_AUSENTE"
  | "PROCEDIMENTO_AUSENTE"
  | "INTERVALO_INVALIDO"
  | "DISPONIBILIDADE_NAO_CONSULTADA"
  | "SEM_VAGA_DISPONIVEL"
  | "VAGA_NAO_CORRESPONDENTE"
  | "CONSENTIMENTO_AUSENTE"
  | "CONSENTIMENTO_DE_OUTRO_SLOT"
  | "REVISAO_OBSOLETA"
  | "AGENDAMENTO_ID_AUSENTE"
  | "DADOS_IDENTIFICACAO_INCOMPLETOS";

export type VagaConsultada = {
  medicoId: string;
  inicio: string;
  fim: string;
};

export type PacienteAutorizacao = {
  id?: string | null;
  nome?: string | null;
  identificado?: boolean;
  validado?: boolean;
  /**
   * A identificação foi concluída (ou reconfirmada) no ciclo atual. Não é
   * obrigatória: um paciente já validado nesta conversa continua válido em
   * turnos seguintes. Serve apenas para registrar a origem da evidência.
   */
  atualizadoNoTurno?: boolean;
  /** Evidência de identidade expirada/invalidada explicitamente. */
  evidenciaInvalidada?: boolean;
};

export type EntradaAutorizacao = {
  operacao: OperacaoNina;
  clinicaId?: string | null;
  paciente?: PacienteAutorizacao;
  medicoId?: string | null;
  procedimento?: string | null;
  intervalo?: { inicio?: string | null; fim?: string | null };
  /** A consulta de disponibilidade chegou a ser executada com sucesso. */
  disponibilidadeConsultada?: boolean;
  /** Vagas REAIS devolvidas pela consulta (lista vazia = sem vaga). */
  vagasConsultadas?: VagaConsultada[];
  consentimento?: {
    confirmado?: boolean;
    medicoId?: string | null;
    inicio?: string | null;
    fim?: string | null;
  };
  revisao?: { processada?: number | null; atual?: number | null };
  /** Só para operações sobre uma reserva já existente. */
  agendamentoId?: string | null;
  /** Dados obrigatórios da identificação (nome, cpf, nascimento). */
  dadosIdentificacao?: { nome?: string | null; cpf?: string | null; data_nascimento?: string | null };
  /** Base opcional da chave de idempotência (conversa/telefone). */
  idempotenciaBase?: string | null;
};

export type Autorizacao =
  | { autorizado: true; operacao: OperacaoNina; chaveIdempotencia: string; motivos: [] }
  | { autorizado: false; operacao: OperacaoNina; motivos: CodigoRecusa[] };

const vazio = (v?: string | null): boolean => !v || String(v).trim() === "";

function mesmoInstante(a?: string | null, b?: string | null): boolean {
  if (vazio(a) || vazio(b)) return false;
  const ta = Date.parse(String(a));
  const tb = Date.parse(String(b));
  if (Number.isNaN(ta) || Number.isNaN(tb)) return String(a).trim() === String(b).trim();
  return ta === tb;
}

/** Existe vaga consultada que cobre exatamente profissional + intervalo pedidos. */
export function vagaCorresponde(
  vagas: VagaConsultada[] | undefined,
  medicoId?: string | null,
  inicio?: string | null,
  fim?: string | null,
): boolean {
  if (!vagas || vagas.length === 0) return false;
  return vagas.some(
    (v) =>
      String(v.medicoId) === String(medicoId ?? "") &&
      mesmoInstante(v.inicio, inicio) &&
      (vazio(fim) || mesmoInstante(v.fim, fim)),
  );
}

function chave(e: EntradaAutorizacao): string {
  const base = e.idempotenciaBase ?? "sem-conversa";
  if (e.operacao === "criar_agendamento")
    return `${e.operacao}|${base}|${e.medicoId ?? ""}|${e.intervalo?.inicio ?? ""}`;
  if (e.operacao === "identificar_paciente")
    return `${e.operacao}|${base}|${e.dadosIdentificacao?.cpf ?? ""}`;
  return `${e.operacao}|${base}|${e.agendamentoId ?? ""}`;
}

function pacienteRecusas(p: PacienteAutorizacao | undefined): CodigoRecusa[] {
  const m: CodigoRecusa[] = [];
  if (!p || vazio(p.id) || p.identificado !== true) m.push("PACIENTE_NAO_IDENTIFICADO");
  else if (p.validado !== true) m.push("PACIENTE_NAO_VALIDADO");
  else if (p.evidenciaInvalidada === true) m.push("PACIENTE_DESATUALIZADO");
  return m;
}

/**
 * Confere as pré-condições da operação pretendida. Nunca executa nada.
 */
export function autorizarAcao(entrada: EntradaAutorizacao): Autorizacao {
  const motivos: CodigoRecusa[] = [];
  const { operacao } = entrada;

  if (vazio(entrada.clinicaId)) motivos.push("CLINICA_AUSENTE");

  // Revisão da conversa: raciocínio feito sobre estado antigo não grava nada.
  const rev = entrada.revisao;
  if (
    rev &&
    typeof rev.processada === "number" &&
    typeof rev.atual === "number" &&
    rev.processada !== rev.atual
  )
    motivos.push("REVISAO_OBSOLETA");

  if (operacao === "identificar_paciente") {
    const d = entrada.dadosIdentificacao;
    if (!d || vazio(d.nome) || vazio(d.cpf) || vazio(d.data_nascimento))
      motivos.push("DADOS_IDENTIFICACAO_INCOMPLETOS");
  }

  if (operacao === "criar_agendamento") {
    motivos.push(...pacienteRecusas(entrada.paciente));
    if (vazio(entrada.medicoId)) motivos.push("PROFISSIONAL_AUSENTE");
    if (vazio(entrada.procedimento)) motivos.push("PROCEDIMENTO_AUSENTE");

    const inicio = entrada.intervalo?.inicio;
    const fim = entrada.intervalo?.fim;
    const tInicio = vazio(inicio) ? NaN : Date.parse(String(inicio));
    const tFim = vazio(fim) ? NaN : Date.parse(String(fim));
    if (Number.isNaN(tInicio) || Number.isNaN(tFim) || tFim <= tInicio)
      motivos.push("INTERVALO_INVALIDO");

    // Disponibilidade: consulta bem-sucedida com lista vazia NÃO é vaga.
    const vagas = entrada.vagasConsultadas;
    if (entrada.disponibilidadeConsultada !== true && (!vagas || vagas.length === 0))
      motivos.push("DISPONIBILIDADE_NAO_CONSULTADA");
    else if (!vagas || vagas.length === 0) motivos.push("SEM_VAGA_DISPONIVEL");
    else if (!vagaCorresponde(vagas, entrada.medicoId, inicio, fim))
      motivos.push("VAGA_NAO_CORRESPONDENTE");

    // Consentimento explícito, amarrado ao mesmo slot que foi resumido.
    const c = entrada.consentimento;
    if (!c || c.confirmado !== true) motivos.push("CONSENTIMENTO_AUSENTE");
    else if (
      !mesmoInstante(c.inicio, inicio) ||
      (!vazio(c.fim) && !mesmoInstante(c.fim, fim)) ||
      (!vazio(c.medicoId) && String(c.medicoId) !== String(entrada.medicoId ?? ""))
    )
      motivos.push("CONSENTIMENTO_DE_OUTRO_SLOT");
  }

  if (operacao === "cancelar_agendamento" || operacao === "consultar_agendamento") {
    if (operacao === "cancelar_agendamento") motivos.push(...pacienteRecusas(entrada.paciente));
    if (vazio(entrada.agendamentoId)) motivos.push("AGENDAMENTO_ID_AUSENTE");
  }

  const unicos = [...new Set(motivos)];
  if (unicos.length > 0) return { autorizado: false, operacao, motivos: unicos };
  return { autorizado: true, operacao, chaveIdempotencia: chave(entrada), motivos: [] };
}
