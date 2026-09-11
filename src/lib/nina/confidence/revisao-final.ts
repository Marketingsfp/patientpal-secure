/**
 * FASE 5 — REVISÃO FINAL E LIBERAÇÃO DA SAÍDA.
 *
 * Camada pura (sem banco, sem rede, sem modelo). Existe porque duas coisas
 * estavam erradas:
 *
 *   1. a nota da mensagem final (`answer_confidence`) era só observação: o
 *      resultado não obrigava nenhuma correção;
 *   2. nem toda resposta passava pelo MESMO ponto final de avaliação
 *      (template, fallback, encerramento, transferência, limite de rodadas).
 *
 * Aqui a revisão é única para todas as origens e separa, sem ambiguidade:
 *
 *   AVALIAÇÃO           — o que o motor mediu sobre o texto final.
 *   DECISÃO RECOMENDADA — o que deveria ser feito por causa dessa medição.
 *   DECISÃO APLICADA    — o que a etapa de ativação da clínica deixou fazer.
 *   RESULTADO COMPROVADO— o que realmente aconteceu (confirmado por fora).
 *
 * Duas regras inegociáveis:
 *
 *   - falha técnica do avaliador NUNCA vira aprovação;
 *   - a revisão é textual: ela nunca reexecuta operação com efeito externo
 *     (gravar agendamento, transferir, enviar) para "tentar de novo".
 */
import {
  conformidadeDasInstrucoes,
  type ConformidadeInstrucoes,
} from "./conformidade-entrega";
import { etapaAtinge, type EtapaAtivacao } from "./etapas";
import type { ResultadoConfianca } from "./types";

// ------------------------------------------------------------------ origens

/** Toda origem possível do texto que chega ao paciente. */
export type OrigemSaida =
  | "modelo"
  | "modelo_transformado"
  | "template"
  | "gate"
  | "fallback"
  | "encerramento"
  | "transferencia"
  | "limite_rodadas"
  | "codigo"
  | "cache"
  | "desconhecida";

/** Origens que passam pela revisão final. `nenhuma` não existe aqui: sem texto, sem saída. */
export const ORIGENS_REVISADAS: OrigemSaida[] = [
  "modelo",
  "modelo_transformado",
  "template",
  "gate",
  "fallback",
  "encerramento",
  "transferencia",
  "limite_rodadas",
  "codigo",
  "cache",
  "desconhecida",
];

/**
 * Traduz o que o rastreio do turno gravou (mais os sinais do desfecho) para a
 * origem canônica da revisão. Sinais específicos têm precedência porque
 * descrevem melhor o caminho percorrido.
 */
export function origemDaSaida(
  origemRegistrada: string | null | undefined,
  sinais?: {
    handoff?: boolean;
    limiteRodadas?: boolean;
    encerramento?: boolean;
    template?: boolean;
  },
): OrigemSaida {
  if (sinais?.limiteRodadas) return "limite_rodadas";
  if (sinais?.handoff) return "transferencia";
  if (sinais?.encerramento) return "encerramento";
  if (sinais?.template) return "template";
  const v = String(origemRegistrada ?? "").trim();
  if ((ORIGENS_REVISADAS as string[]).includes(v)) return v as OrigemSaida;
  if (v === "fallback_erro") return "fallback";
  return "desconhecida";
}

/** Existe texto para revisar? Turno sem resposta não gera revisão. */
export function exigeRevisao(texto: string | null | undefined): boolean {
  return String(texto ?? "").trim() !== "";
}

// ------------------------------------------------------------------ motivos

export type MotivoRevisao =
  | "SEM_PROBLEMA"
  | "FALTA_DADO_PACIENTE"
  | "FALTA_EVIDENCIA_RECUPERAVEL"
  | "CONTRADICAO_COM_FONTE"
  | "OBRIGACAO_DESCUMPRIDA"
  | "REGRA_PUBLICADA_VIOLADA"
  | "REGRA_PUBLICADA_NAO_VERIFICADA"
  | "OPERACAO_SEM_COMPROVACAO"
  | "IMPASSE"
  | "AVALIADOR_INDISPONIVEL";

export type AcaoRevisao =
  | "LIBERAR"
  | "ESCLARECER"
  | "NOVA_CONSULTA"
  | "CORRIGIR_E_REAVALIAR"
  | "IMPEDIR_AFIRMACAO_SUCESSO"
  | "DESFECHO_EXPLICITO";

/** Quanto custa errar esta saída. Comanda o comportamento degradado. */
export type RiscoSaida = "informativo" | "operacional" | "critico";

export const ACAO_POR_MOTIVO: Record<MotivoRevisao, AcaoRevisao> = {
  SEM_PROBLEMA: "LIBERAR",
  FALTA_DADO_PACIENTE: "ESCLARECER",
  FALTA_EVIDENCIA_RECUPERAVEL: "NOVA_CONSULTA",
  CONTRADICAO_COM_FONTE: "CORRIGIR_E_REAVALIAR",
  OBRIGACAO_DESCUMPRIDA: "CORRIGIR_E_REAVALIAR",
  // Violação de regra publicada: pede correção do TEXTO e reavaliação; se o
  // limite de tentativas acabar, vira impasse com desfecho explícito.
  REGRA_PUBLICADA_VIOLADA: "CORRIGIR_E_REAVALIAR",
  // Exigência crítica que não pôde ser conferida nunca é aprovação.
  REGRA_PUBLICADA_NAO_VERIFICADA: "DESFECHO_EXPLICITO",
  OPERACAO_SEM_COMPROVACAO: "IMPEDIR_AFIRMACAO_SUCESSO",
  IMPASSE: "DESFECHO_EXPLICITO",
  AVALIADOR_INDISPONIVEL: "DESFECHO_EXPLICITO",
};

/**
 * Proteções que valem SEMPRE, inclusive na etapa A (só observação). Não são
 * "endurecimento do motor": são regras que já existiam no atendimento e que
 * nenhuma etapa de ativação pode desligar.
 */
export const PROTECOES_OBRIGATORIAS: MotivoRevisao[] = [
  "OPERACAO_SEM_COMPROVACAO",
  "CONTRADICAO_COM_FONTE",
  "REGRA_PUBLICADA_VIOLADA",
  "REGRA_PUBLICADA_NAO_VERIFICADA",
];

const CODIGOS_CONTRADICAO = [
  "CONTRADICAO",
  "CONTRADITO",
  "CONFLITO",
  "DIVERGENTE",
  "FONTE_NAO_VIGENTE",
];
const CODIGOS_SEM_COMPROVACAO = [
  "SEM_PROVA",
  "SEM_COMPROVACAO",
  "NAO_COMPROVAD",
  "PROMESSA",
  "SUCESSO_NAO_CONFIRMADO",
  "ACAO_NAO_EXECUTADA",
  "CONFIRMACAO_DE_AGENDAMENTO",
];
const CODIGOS_FONTE_AUSENTE = [
  "MISSING_REQUIRED_OFFICIAL_SOURCE",
  "SEM_FONTE",
  "SEM_CONSULTA",
  "FERRAMENTA_FALHOU",
  "RETORNO_VAZIO",
  "SEM_EVIDENCIA",
  "STALE_OFFICIAL_SOURCE",
];
const CODIGOS_DADO_PACIENTE = [
  "MISSING_PATIENT_CONTEXT",
  "DADO_DO_PACIENTE",
  "CAMPO_OBRIGATORIO",
  "AMBIGU",
  "ESCLARECIMENTO",
];

function contem(lista: string[], alvos: string[]): boolean {
  return lista.some((c) => alvos.some((a) => c.toUpperCase().includes(a)));
}

/** Códigos que pesaram contra a saída (falhas e bloqueios), sem PII. */
export function codigosNegativos(r: ResultadoConfianca): string[] {
  const dos = (r.validators ?? [])
    .filter((v) => v.status === "FAIL" || v.status === "BLOCK" || v.status === "WARNING")
    .map((v) => `${v.validator}:${v.reasonCode}`);
  return [...(r.hardBlockers ?? []), ...dos];
}

/** Classifica o PORQUÊ da revisão a partir da avaliação do texto final. */
export function motivoDaRevisao(
  r: ResultadoConfianca | null,
  extra?: { operacaoAfirmada?: boolean; operacaoComprovada?: boolean },
): MotivoRevisao {
  if (extra?.operacaoAfirmada === true && extra?.operacaoComprovada !== true) {
    return "OPERACAO_SEM_COMPROVACAO";
  }
  if (!r) return "AVALIADOR_INDISPONIVEL";
  const codigos = codigosNegativos(r);
  if (contem(codigos, CODIGOS_SEM_COMPROVACAO)) return "OPERACAO_SEM_COMPROVACAO";
  if (contem(codigos, CODIGOS_CONTRADICAO)) return "CONTRADICAO_COM_FONTE";
  // Conformidade com as instruções PUBLICADAS é lida à parte da nota: uma
  // violação bloqueante vale mesmo com score alto e decisão ALLOW.
  const conf = conformidadeDasInstrucoes(r);
  if (conf.bloqueante) {
    return conf.motivoBloqueio === "REGRA_PUBLICADA_DESCUMPRIDA"
      ? "REGRA_PUBLICADA_VIOLADA"
      : "REGRA_PUBLICADA_NAO_VERIFICADA";
  }
  if (
    (r.validators ?? []).some(
      (v) => v.validator === "InstructionComplianceValidator" && v.status === "FAIL",
    )
  ) {
    return "OBRIGACAO_DESCUMPRIDA";
  }
  if (contem(codigos, CODIGOS_DADO_PACIENTE)) return "FALTA_DADO_PACIENTE";
  if (contem(codigos, CODIGOS_FONTE_AUSENTE)) return "FALTA_EVIDENCIA_RECUPERAVEL";
  if (r.decision === "ALLOW") return "SEM_PROBLEMA";
  return "IMPASSE";
}

// ---------------------------------------------------- limite de tentativas

export type PoliticaRevisao = {
  /** Correções/reavaliações do MESMO turno antes de declarar impasse. */
  maxTentativasCorrecao: number;
};

export const POLITICA_REVISAO_PADRAO: PoliticaRevisao = { maxTentativasCorrecao: 2 };

/** Ações que consomem uma tentativa de correção (mexem no texto ou consultam de novo). */
const ACOES_COM_TENTATIVA: AcaoRevisao[] = [
  "CORRIGIR_E_REAVALIAR",
  "NOVA_CONSULTA",
  "ESCLARECER",
];

/**
 * Capacidades que a revisão pode repetir: SOMENTE leitura. Gravar agendamento,
 * transferir ou enviar mensagem jamais é repetido por causa de uma revisão de
 * texto — repetir isso criaria efeito externo duplicado.
 */
const CAPACIDADES_SO_LEITURA = new Set([
  "searchKnowledgeBase",
  "listCatalog",
  "checkAvailability",
  "findPatient",
  "getAppointment",
  "listAppointments",
]);

export function podeReexecutarNaRevisao(capacidade: string | null | undefined): boolean {
  return CAPACIDADES_SO_LEITURA.has(String(capacidade ?? ""));
}

// ------------------------------------------------------------------ revisão

export type EntradaRevisaoFinal = {
  origem: OrigemSaida;
  textoFinal: string;
  /** Avaliação da MENSAGEM FINAL. `null` = o avaliador não produziu resultado. */
  avaliacao: ResultadoConfianca | null;
  /** Erro técnico do avaliador, quando houve. */
  falhaAvaliador?: string | null;
  etapa: EtapaAtivacao;
  risco?: RiscoSaida;
  /** Correções já tentadas neste turno. */
  tentativa?: number;
  /** O texto afirma que uma operação foi concluída? */
  operacaoAfirmada?: boolean;
  /** Existe prova da operação (id gravado, confirmação do serviço)? */
  operacaoComprovada?: boolean;
  politica?: PoliticaRevisao;
};

export type RevisaoFinal = {
  origem: OrigemSaida;
  revisada: boolean;
  // 1) AVALIAÇÃO
  avaliacao: {
    score: number | null;
    nivel: string | null;
    decisao: string | null;
    textoHash: string | null;
  } | null;
  avaliadorFalhou: boolean;
  erroAvaliador: string | null;
  // 2) DECISÃO RECOMENDADA
  motivo: MotivoRevisao;
  acaoRecomendada: AcaoRevisao;
  // 3) DECISÃO APLICADA
  etapa: EtapaAtivacao;
  acaoAplicada: AcaoRevisao;
  aplicada: boolean;
  apenasObservou: boolean;
  protecaoObrigatoria: boolean;
  motivoNaoAplicacao: string | null;
  // 4) LIMITES E DEGRADAÇÃO
  tentativa: number;
  limiteTentativas: number;
  podeTentarCorrecao: boolean;
  /** A revisão é textual: efeito externo nunca é repetido por causa dela. */
  efeitosExternosPermitidos: false;
  degradado:
    | "nenhum"
    | "liberacao_registrada_sem_aprovacao"
    | "desfecho_por_falha_do_avaliador";
  aprovada: boolean;
  explicacao: string;
};

/** Etapa mínima para que cada ação chegue ao paciente. */
function etapaMinima(a: AcaoRevisao): EtapaAtivacao {
  if (a === "ESCLARECER") return "C";
  if (a === "DESFECHO_EXPLICITO" || a === "CORRIGIR_E_REAVALIAR" || a === "NOVA_CONSULTA") {
    return "B";
  }
  return "A";
}

export function revisarSaida(e: EntradaRevisaoFinal): RevisaoFinal {
  const politica = e.politica ?? POLITICA_REVISAO_PADRAO;
  const tentativa = e.tentativa ?? 0;
  const risco = e.risco ?? "informativo";
  const avaliadorFalhou = e.avaliacao === null;

  let motivo = motivoDaRevisao(e.avaliacao, {
    ...(e.operacaoAfirmada !== undefined ? { operacaoAfirmada: e.operacaoAfirmada } : {}),
    ...(e.operacaoComprovada !== undefined ? { operacaoComprovada: e.operacaoComprovada } : {}),
  });

  let degradado: RevisaoFinal["degradado"] = "nenhum";
  let acaoRecomendada: AcaoRevisao;

  if (avaliadorFalhou && motivo !== "OPERACAO_SEM_COMPROVACAO") {
    // Falha técnica NUNCA é aprovação. Em risco baixo a saída segue, mas fica
    // registrada como liberação degradada — não como texto aprovado.
    motivo = "AVALIADOR_INDISPONIVEL";
    if (risco === "informativo") {
      acaoRecomendada = "LIBERAR";
      degradado = "liberacao_registrada_sem_aprovacao";
    } else {
      acaoRecomendada = "DESFECHO_EXPLICITO";
      degradado = "desfecho_por_falha_do_avaliador";
    }
  } else {
    acaoRecomendada = ACAO_POR_MOTIVO[motivo];
  }

  // Limite de tentativas: sem loop de correção. Estourou, vira impasse com
  // desfecho explícito conforme a política operacional.
  const consomeTentativa = ACOES_COM_TENTATIVA.includes(acaoRecomendada);
  const podeTentarCorrecao = consomeTentativa && tentativa < politica.maxTentativasCorrecao;
  if (consomeTentativa && !podeTentarCorrecao) {
    motivo = "IMPASSE";
    acaoRecomendada = "DESFECHO_EXPLICITO";
  }

  // Etapa de ativação: A só observa. As proteções obrigatórias têm precedência
  // e são identificadas como tais — é isso que elimina a contradição entre
  // "apenas observa" e intervenção realmente feita.
  const protecaoObrigatoria =
    PROTECOES_OBRIGATORIAS.includes(motivo) ||
    degradado === "desfecho_por_falha_do_avaliador";
  const etapaPermite = etapaAtinge(e.etapa, etapaMinima(acaoRecomendada));
  const aplicar =
    acaoRecomendada === "LIBERAR" || protecaoObrigatoria || etapaPermite;
  const acaoAplicada: AcaoRevisao = aplicar ? acaoRecomendada : "LIBERAR";
  const aplicada = aplicar && acaoRecomendada !== "LIBERAR";
  const motivoNaoAplicacao = aplicar
    ? null
    : `etapa_${e.etapa}_apenas_observa (a ação ${acaoRecomendada} exige etapa ${etapaMinima(acaoRecomendada)})`;

  const aprovada =
    !avaliadorFalhou && motivo === "SEM_PROBLEMA" && acaoRecomendada === "LIBERAR";

  return {
    origem: e.origem,
    revisada: exigeRevisao(e.textoFinal),
    avaliacao: e.avaliacao
      ? {
          score: e.avaliacao.score ?? null,
          nivel: e.avaliacao.level ?? null,
          decisao: e.avaliacao.decision ?? null,
          textoHash: e.avaliacao.textoAvaliadoHash ?? null,
        }
      : null,
    avaliadorFalhou,
    erroAvaliador: e.falhaAvaliador ?? null,
    motivo,
    acaoRecomendada,
    etapa: e.etapa,
    acaoAplicada,
    aplicada,
    apenasObservou: !aplicada,
    protecaoObrigatoria,
    motivoNaoAplicacao,
    tentativa,
    limiteTentativas: politica.maxTentativasCorrecao,
    podeTentarCorrecao,
    efeitosExternosPermitidos: false,
    degradado,
    aprovada,
    explicacao: explicar(motivo, acaoRecomendada, acaoAplicada, aplicada, protecaoObrigatoria),
  };
}

function explicar(
  motivo: MotivoRevisao,
  recomendada: AcaoRevisao,
  aplicada: AcaoRevisao,
  houveAplicacao: boolean,
  obrigatoria: boolean,
): string {
  const base = `motivo=${motivo}; recomendado=${recomendada}; aplicado=${aplicada}`;
  if (!houveAplicacao && recomendada !== "LIBERAR") return `${base}; apenas observado`;
  if (obrigatoria) return `${base}; proteção obrigatória (independe da etapa)`;
  return base;
}

// --------------------------------------------- resultado efetivo comprovado

export type ResultadoComprovado = {
  acaoAplicada: AcaoRevisao;
  /** A ação chegou a ser executada pelo pipeline? */
  executada: boolean;
  /** Prova externa (id do handoff, id da mensagem, id do agendamento). */
  comprovacao: string | null;
  /** Só é `true` com prova. Decisão não é prova. */
  comprovado: boolean;
  observacao: string;
};

/**
 * Fecha o ciclo: o que a revisão MANDOU fazer aconteceu mesmo? Sem prova
 * externa, o resultado fica declarado como não comprovado — nunca como feito.
 */
export function confirmarResultadoRevisao(
  revisao: RevisaoFinal,
  prova: { executada: boolean; comprovacao?: string | null },
): ResultadoComprovado {
  const comprovacao = prova.comprovacao ?? null;
  const comprovado = prova.executada === true && comprovacao !== null;
  return {
    acaoAplicada: revisao.acaoAplicada,
    executada: prova.executada === true,
    comprovacao,
    comprovado,
    observacao: comprovado
      ? "resultado comprovado por evidência externa"
      : prova.executada
        ? "execução relatada sem evidência externa: não comprovado"
        : "ação não executada",
  };
}

// ------------------------------------------------- ação crítica (item 8)

export type RevisaoAcaoCritica = {
  liberada: boolean;
  motivo: string;
  protecaoObrigatoria: boolean;
};

/**
 * Verificação ANTES de executar uma ação crítica. Preserva as proteções que já
 * existem: bloqueador do motor impede a execução em qualquer etapa; sem
 * avaliação, ação crítica não é liberada.
 */
export function revisarAcaoCritica(e: {
  avaliacaoAcao: ResultadoConfianca | null;
  etapa: EtapaAtivacao;
  requisitosSatisfeitos?: boolean;
}): RevisaoAcaoCritica {
  if (!e.avaliacaoAcao) {
    return {
      liberada: false,
      motivo: "SEM_AVALIACAO_DA_ACAO",
      protecaoObrigatoria: true,
    };
  }
  if ((e.avaliacaoAcao.hardBlockers ?? []).length > 0) {
    return { liberada: false, motivo: "BLOQUEADOR_ABSOLUTO", protecaoObrigatoria: true };
  }
  if (e.requisitosSatisfeitos === false) {
    return { liberada: false, motivo: "REQUISITO_OPERACIONAL_AUSENTE", protecaoObrigatoria: true };
  }
  if (e.avaliacaoAcao.decision === "BLOCK_ACTION") {
    return { liberada: false, motivo: "MOTOR_BLOQUEOU_A_ACAO", protecaoObrigatoria: true };
  }
  return { liberada: true, motivo: "ACAO_LIBERADA", protecaoObrigatoria: false };
}
