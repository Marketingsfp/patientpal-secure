/**
 * Classificador central de período de atendimento (Fase 3).
 *
 * Responde uma única pergunta: o evento aconteceu DENTRO ou FORA do horário
 * oficial publicado — ou não há evidência suficiente para dizer.
 *
 * Princípios:
 *  - Cálculo 100% determinístico. Nunca usar IA para comparar datas/horas.
 *  - O timestamp original não é alterado: ele é apenas lido no fuso da operação.
 *  - Exceção por data tem prioridade sobre a programação semanal.
 *  - Limites: abertura incluída, fechamento excluído  →  [inicio, fim)
 *  - Intervalo entre duas faixas do mesmo dia = FORA.
 *  - Falta de informação NUNCA vira "fora do horário".
 *
 * Esta função só classifica períodos. Ela não desliga a Nina, não muda
 * responsável, não dispara handoff, não resolve conversas e não altera o
 * timeout de 30 minutos. "Fora do horário" também não afirma que não havia
 * atendente online — presença real continua vindo do mecanismo de
 * disponibilidade da equipe.
 */

import { minutos, normalizarHora, type DiaHorario, type Faixa } from "./horario-funcionamento";

export const FUSO_PADRAO = "America/Sao_Paulo";

export type ClassificacaoPeriodo = "DENTRO_DO_HORARIO" | "FORA_DO_HORARIO" | "NAO_CLASSIFICAVEL";

export type MotivoNaoClassificavel =
  | "sem_calendario_publicado"
  | "sem_versao_para_a_data"
  | "dia_nao_configurado"
  | "timestamp_ausente_ou_invalido"
  | "escopo_nao_identificavel"
  | "conflito_de_configuracao";

export type MotivoClassificacao =
  | MotivoNaoClassificavel
  | "excecao_fechado"
  | "excecao_especial_dentro"
  | "excecao_especial_fora"
  | "dia_fechado"
  | "dentro_da_faixa"
  | "fora_das_faixas";

export type ResultadoClassificacao = {
  classificacao: ClassificacaoPeriodo;
  motivo: MotivoClassificacao;
  /** Texto curto em português para exibir na tela ou em auditoria. */
  explicacao: string;
  versao_id: string | null;
  versao: number | null;
  fuso: string;
  /** Data e hora locais efetivamente usadas na comparação (AAAA-MM-DD / HH:MM). */
  data_local: string | null;
  hora_local: string | null;
};

export type ExcecaoHorario = {
  data: string; // AAAA-MM-DD
  tipo: "fechado" | "especial";
  hora_inicio?: string | null;
  hora_fim?: string | null;
};

/** Calendário publicado, já resolvido para o escopo do evento. */
export type CalendarioPublicado = {
  versao_id: string;
  versao: number;
  status: "publicado" | "substituido";
  publicado_em: string | null;
  vigencia_inicio: string; // AAAA-MM-DD
  vigencia_fim?: string | null;
  fuso?: string | null;
  clinica_id: string;
  /** null = calendário geral, explicitamente aplicável a toda a operação. */
  unidade_id?: string | null;
  dias: DiaHorario[];
  excecoes: ExcecaoHorario[];
};

export type EscopoEvento = {
  clinica_id: string | null | undefined;
  /** Unidade real do evento. undefined/null = unidade histórica desconhecida. */
  unidade_id?: string | null;
};

const EXPLICACOES: Record<MotivoClassificacao, string> = {
  sem_calendario_publicado: "Nenhum horário oficial publicado para esta operação.",
  sem_versao_para_a_data: "Não há versão do horário oficial válida para a data do evento.",
  dia_nao_configurado: "O dia da semana do evento não foi configurado nessa versão do horário.",
  timestamp_ausente_ou_invalido: "A data e hora do evento estão ausentes ou inválidas.",
  escopo_nao_identificavel: "Não foi possível identificar com segurança a clínica/unidade do evento.",
  conflito_de_configuracao: "Há mais de um horário oficial aplicável a esta data — conflito não resolvido.",
  excecao_fechado: "Data cadastrada como fechada (exceção).",
  excecao_especial_dentro: "Dentro do horário especial cadastrado para essa data.",
  excecao_especial_fora: "Fora do horário especial cadastrado para essa data.",
  dia_fechado: "A clínica declarou esse dia da semana como fechado.",
  dentro_da_faixa: "Dentro de uma faixa de funcionamento cadastrada.",
  fora_das_faixas: "Fora das faixas de funcionamento cadastradas para esse dia.",
};

function resultado(
  classificacao: ClassificacaoPeriodo,
  motivo: MotivoClassificacao,
  extra: Partial<ResultadoClassificacao> = {},
): ResultadoClassificacao {
  return {
    classificacao,
    motivo,
    explicacao: EXPLICACOES[motivo],
    versao_id: null,
    versao: null,
    fuso: FUSO_PADRAO,
    data_local: null,
    hora_local: null,
    ...extra,
  };
}

/** Lê um instante no fuso da operação sem alterar o valor armazenado. */
export function instanteLocal(
  em: string | Date | null | undefined,
  fuso: string = FUSO_PADRAO,
): { data: string; hora: string; dow: number } | null {
  if (em === null || em === undefined || em === "") return null;
  const d = em instanceof Date ? em : new Date(em);
  if (Number.isNaN(d.getTime())) return null;

  let partes: Intl.DateTimeFormatPart[];
  try {
    partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: fuso,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    }).formatToParts(d);
  } catch {
    return null; // fuso inválido
  }

  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const hora24 = get("hour") === "24" ? "00" : get("hour");
  const data = `${get("year")}-${get("month")}-${get("day")}`;
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dowMap[get("weekday")] ?? new Date(`${data}T00:00:00Z`).getUTCDay();
  return { data, hora: `${hora24}:${get("minute")}`, dow };
}

/** Abertura incluída, fechamento excluído. */
export function dentroDaFaixa(hora: string, faixa: Faixa): boolean {
  const ini = normalizarHora(faixa.hora_inicio);
  const fim = normalizarHora(faixa.hora_fim);
  if (!ini || !fim) return false;
  const m = minutos(hora);
  return m >= minutos(ini) && m < minutos(fim);
}

/**
 * Escolhe, entre as versões publicadas, a que valia na data do evento para o
 * escopo do evento. Nunca usa a unidade selecionada na tela como substituta da
 * unidade histórica: quando a unidade do evento é desconhecida, apenas um
 * calendário geral (unidade_id nulo) pode ser aplicado.
 */
export function calendarioAplicavel(
  calendarios: CalendarioPublicado[],
  escopo: EscopoEvento,
  dataLocal: string,
): { calendario: CalendarioPublicado | null; conflito: boolean } {
  if (!escopo?.clinica_id) return { calendario: null, conflito: false };

  const candidatos = (calendarios ?? [])
    .filter((c) => c.clinica_id === escopo.clinica_id)
    .filter((c) => c.status !== undefined && !!c.publicado_em)
    .filter((c) => c.vigencia_inicio <= dataLocal && (!c.vigencia_fim || c.vigencia_fim >= dataLocal))
    .filter((c) => {
      const geral = c.unidade_id === null || c.unidade_id === undefined;
      if (geral) return true; // geral só vale por estar explicitamente definido como geral
      return !!escopo.unidade_id && c.unidade_id === escopo.unidade_id;
    });

  if (candidatos.length === 0) return { calendario: null, conflito: false };

  // Calendário da própria unidade tem precedência sobre o geral (definição explícita).
  const daUnidade = candidatos.filter((c) => c.unidade_id && c.unidade_id === escopo.unidade_id);
  const efetivos = daUnidade.length > 0 ? daUnidade : candidatos;

  // Dentro do mesmo escopo, a versão publicada prevalece sobre versões já substituídas
  // (a substituída permanece apenas como registro histórico do período anterior).
  const publicadosVigentes = efetivos.filter((c) => c.status === "publicado");
  if (publicadosVigentes.length > 1) return { calendario: null, conflito: true };
  if (publicadosVigentes.length === 1) return { calendario: publicadosVigentes[0] ?? null, conflito: false };

  if (efetivos.length > 1) {
    // Somente versões substituídas: usa a mais recente aplicável àquela data.
    const ordenados = [...efetivos].sort((a, b) => (b.versao ?? 0) - (a.versao ?? 0));
    if ((ordenados[0]?.versao ?? 0) === (ordenados[1]?.versao ?? 0)) return { calendario: null, conflito: true };
    return { calendario: ordenados[0] ?? null, conflito: false };
  }
  return { calendario: efetivos[0] ?? null, conflito: false };
}

/**
 * Função central. Recebe o instante do evento, o escopo e os calendários
 * publicados; devolve a classificação, a versão usada e o motivo.
 */
export function classificarPeriodo(params: {
  em: string | Date | null | undefined;
  escopo: EscopoEvento;
  calendarios: CalendarioPublicado[];
  fuso?: string | null;
}): ResultadoClassificacao {
  const fuso = params.fuso || FUSO_PADRAO;

  if (!params.escopo?.clinica_id) {
    return resultado("NAO_CLASSIFICAVEL", "escopo_nao_identificavel", { fuso });
  }

  const local = instanteLocal(params.em, fuso);
  if (!local) return resultado("NAO_CLASSIFICAVEL", "timestamp_ausente_ou_invalido", { fuso });

  const base = { fuso, data_local: local.data, hora_local: local.hora };

  const publicados = (params.calendarios ?? []).filter((c) => !!c?.publicado_em);
  if (publicados.length === 0) {
    return resultado("NAO_CLASSIFICAVEL", "sem_calendario_publicado", base);
  }

  const { calendario, conflito } = calendarioAplicavel(publicados, params.escopo, local.data);
  if (conflito) return resultado("NAO_CLASSIFICAVEL", "conflito_de_configuracao", base);
  if (!calendario) return resultado("NAO_CLASSIFICAVEL", "sem_versao_para_a_data", base);

  const comVersao = { ...base, fuso: calendario.fuso || fuso, versao_id: calendario.versao_id, versao: calendario.versao };

  // 1) Exceções por data prevalecem sobre a programação semanal.
  const excecoes = (calendario.excecoes ?? []).filter((e) => e.data === local.data);
  if (excecoes.some((e) => e.tipo === "fechado")) {
    return resultado("FORA_DO_HORARIO", "excecao_fechado", comVersao);
  }
  const especiais = excecoes.filter((e) => e.tipo === "especial" && e.hora_inicio && e.hora_fim);
  if (especiais.length > 0) {
    const dentro = especiais.some((e) =>
      dentroDaFaixa(local.hora, { hora_inicio: e.hora_inicio as string, hora_fim: e.hora_fim as string }),
    );
    return dentro
      ? resultado("DENTRO_DO_HORARIO", "excecao_especial_dentro", comVersao)
      : resultado("FORA_DO_HORARIO", "excecao_especial_fora", comVersao);
  }

  // 2) Programação semanal.
  const dia = (calendario.dias ?? []).find((d) => d.dia_semana === local.dow);
  if (!dia) return resultado("NAO_CLASSIFICAVEL", "dia_nao_configurado", comVersao);
  if (dia.fechado) return resultado("FORA_DO_HORARIO", "dia_fechado", comVersao);
  if (!dia.faixas || dia.faixas.length === 0) {
    return resultado("NAO_CLASSIFICAVEL", "dia_nao_configurado", comVersao);
  }

  const dentro = dia.faixas.some((f) => dentroDaFaixa(local.hora, f));
  return dentro
    ? resultado("DENTRO_DO_HORARIO", "dentro_da_faixa", comVersao)
    : resultado("FORA_DO_HORARIO", "fora_das_faixas", comVersao);
}

/** Rótulo curto para telas e relatórios. */
export function rotuloClassificacao(c: ClassificacaoPeriodo): string {
  if (c === "DENTRO_DO_HORARIO") return "Dentro do horário";
  if (c === "FORA_DO_HORARIO") return "Fora do horário";
  return "Não classificável";
}
