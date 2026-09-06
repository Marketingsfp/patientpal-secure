/**
 * FASE 4 — HORÁRIO OFICIAL PARA AS RESPOSTAS DA NINA (regras puras).
 *
 * Lê SOMENTE o cadastro publicado na Base de Conhecimentos (mesma fonte usada
 * pelas métricas) e reaproveita o classificador central da Fase 3. Não há
 * segunda fonte de horário e nada é inventado aqui.
 *
 * Limites propositais:
 *  - Horário da clínica ≠ horário de um profissional ≠ vaga disponível.
 *    Disponibilidade real continua vindo da Agenda.
 *  - Sem calendário publicado, sem versão válida para a data ou dia sem
 *    configuração => "não sei", nunca "fechado".
 */
import {
  calendarioAplicavel,
  classificarPeriodo,
  FUSO_PADRAO,
  type CalendarioPublicado,
  type EscopoEvento,
  type MotivoClassificacao,
  type ResultadoClassificacao,
} from "./classificador-periodo";

export type FaixaDia = { inicio: string; fim: string };

export type DiaOficial = {
  /** 0 = domingo ... 6 = sábado */
  dia_semana: number;
  /** true = fechado explicitamente; false = aberto; null = não configurado. */
  fechado: boolean | null;
  faixas: FaixaDia[];
};

export type HorarioOficialData = {
  encontrado: boolean;
  data: string | null;
  /** Fechado explicitamente no cadastro (dia fechado ou exceção de fechamento). */
  fechado: boolean | null;
  faixas: FaixaDia[];
  /** Houve exceção publicada para essa data específica. */
  excecao: boolean;
  versao: number | null;
  versao_id: string | null;
  fuso: string;
  escopo: { clinica_id: string | null; unidade_id: string | null };
  motivo: MotivoClassificacao | null;
  /** Frase interna para o modelo — nunca é o texto final ao paciente. */
  instrucao: string;
};

export const AVISO_AGENDA =
  "Este é o horário de funcionamento da clínica. Ele não é horário de um profissional específico nem vaga disponível — disponibilidade real só pela Agenda.";

const NOMES_DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function nomeDia(dia: number): string {
  return NOMES_DIAS[dia] ?? "?";
}

/** Data (AAAA-MM-DD) → dia da semana, sem depender do fuso do servidor. */
export function diaDaSemanaISO(data: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data ?? ""));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCDay();
}

/**
 * Horário oficial de uma data específica, respeitando vigência e exceções.
 * `classificarPeriodo` continua sendo a única regra de período (Fase 3): aqui
 * ele é usado no meio-dia local só para obter versão e motivo já resolvidos.
 */
export function horarioOficialDoDia(params: {
  data: string;
  escopo: EscopoEvento;
  calendarios: CalendarioPublicado[];
  fuso?: string | null;
}): HorarioOficialData {
  const fuso = params.fuso || FUSO_PADRAO;
  const escopo = {
    clinica_id: params.escopo?.clinica_id ?? null,
    unidade_id: params.escopo?.unidade_id ?? null,
  };
  const dow = diaDaSemanaISO(params.data);
  const vazio = (motivo: MotivoClassificacao | null, instrucao: string): HorarioOficialData => ({
    encontrado: false,
    data: dow === null ? null : params.data,
    fechado: null,
    faixas: [],
    excecao: false,
    versao: null,
    versao_id: null,
    fuso,
    escopo,
    motivo,
    instrucao,
  });

  if (dow === null) return vazio("timestamp_ausente_ou_invalido", "Data inválida — peça a data ao paciente.");
  if (!escopo.clinica_id) return vazio("escopo_nao_identificavel", "Escopo não identificado — não afirme horário.");

  if ((params.calendarios ?? []).length === 0)
    return vazio(
      "sem_calendario_publicado",
      "Não há horário oficial publicado — diga que não tem essa informação confirmada. Nunca diga que está fechado.",
    );

  const { calendario, conflito } = calendarioAplicavel(params.calendarios ?? [], escopo, params.data);
  if (conflito)
    return vazio(
      "conflito_de_configuracao",
      "Há mais de um horário oficial para essa data — não afirme horário; siga o esclarecimento ou o atendimento humano.",
    );
  if (!calendario)
    return vazio(
      "sem_versao_para_a_data",
      "Não há horário oficial publicado para essa data — diga que não tem essa informação confirmada e ofereça atendimento humano. Nunca diga que está fechado.",
    );

  const excecoes = (calendario.excecoes ?? []).filter((e) => e.data === params.data);
  const fechadoExcecao = excecoes.some((e) => e.tipo === "fechado");
  const especiais = excecoes.filter((e) => e.tipo === "especial" && e.hora_inicio && e.hora_fim);

  const base = {
    encontrado: true,
    data: params.data,
    versao: calendario.versao,
    versao_id: calendario.versao_id,
    fuso: calendario.fuso || fuso,
    escopo,
    motivo: null as MotivoClassificacao | null,
  };

  if (fechadoExcecao)
    return {
      ...base,
      fechado: true,
      faixas: [],
      excecao: true,
      motivo: "excecao_fechado",
      instrucao: `Fechado nessa data por exceção publicada. ${AVISO_AGENDA}`,
    };

  if (especiais.length > 0)
    return {
      ...base,
      fechado: false,
      faixas: especiais.map((e) => ({ inicio: String(e.hora_inicio), fim: String(e.hora_fim) })),
      excecao: true,
      motivo: "excecao_especial_dentro",
      instrucao: `Horário especial publicado para essa data. ${AVISO_AGENDA}`,
    };

  const dia = (calendario.dias ?? []).find((d) => d.dia_semana === dow);
  if (!dia)
    return {
      ...base,
      encontrado: false,
      fechado: null,
      faixas: [],
      excecao: false,
      motivo: "dia_nao_configurado",
      instrucao:
        "Esse dia não está configurado no cadastro oficial — não afirme que está fechado; diga que não tem confirmação e ofereça atendimento humano.",
    };

  if (dia.fechado)
    return {
      ...base,
      fechado: true,
      faixas: [],
      excecao: false,
      motivo: "dia_fechado",
      instrucao: `Fechado nesse dia da semana pelo cadastro oficial. ${AVISO_AGENDA}`,
    };

  const faixas = (dia.faixas ?? [])
    .filter((f) => f?.hora_inicio && f?.hora_fim)
    .map((f) => ({ inicio: String(f.hora_inicio), fim: String(f.hora_fim) }));

  if (faixas.length === 0)
    return {
      ...base,
      encontrado: false,
      fechado: null,
      faixas: [],
      excecao: false,
      motivo: "dia_nao_configurado",
      instrucao: "Dia sem faixa cadastrada — não afirme horário nem fechamento.",
    };

  return {
    ...base,
    fechado: false,
    faixas,
    excecao: false,
    instrucao: `Horário oficial publicado. ${AVISO_AGENDA}`,
  };
}

/** Programação semanal vigente na data de referência (pergunta genérica). */
export function semanaOficial(params: {
  referencia: string;
  escopo: EscopoEvento;
  calendarios: CalendarioPublicado[];
  fuso?: string | null;
}): { encontrado: boolean; versao: number | null; fuso: string; dias: DiaOficial[]; motivo: MotivoClassificacao | null } {
  const fuso = params.fuso || FUSO_PADRAO;
  const { calendario, conflito } = calendarioAplicavel(
    params.calendarios ?? [],
    params.escopo,
    params.referencia,
  );
  if (conflito || !calendario)
    return {
      encontrado: false,
      versao: null,
      fuso,
      dias: [],
      motivo: conflito ? "conflito_de_configuracao" : "sem_versao_para_a_data",
    };

  const dias: DiaOficial[] = [];
  for (let d = 0; d < 7; d += 1) {
    const cfg = (calendario.dias ?? []).find((x) => x.dia_semana === d);
    if (!cfg) {
      dias.push({ dia_semana: d, fechado: null, faixas: [] });
      continue;
    }
    dias.push({
      dia_semana: d,
      fechado: cfg.fechado ? true : false,
      faixas: (cfg.faixas ?? [])
        .filter((f) => f?.hora_inicio && f?.hora_fim)
        .map((f) => ({ inicio: String(f.hora_inicio), fim: String(f.hora_fim) })),
    });
  }
  return { encontrado: true, versao: calendario.versao, fuso: calendario.fuso || fuso, dias, motivo: null };
}

/** Está aberto AGORA? Usa exclusivamente o classificador central da Fase 3. */
export function abertoNoInstante(params: {
  em: string;
  escopo: EscopoEvento;
  calendarios: CalendarioPublicado[];
  fuso?: string | null;
}): ResultadoClassificacao {
  return classificarPeriodo({
    em: params.em,
    escopo: params.escopo,
    calendarios: params.calendarios,
    fuso: params.fuso ?? null,
  });
}
