/**
 * CONFORMIDADE COM AS INSTRUÇÕES PUBLICADAS x LIBERAÇÃO DA SAÍDA.
 *
 * Detectar a violação não bastava: a resposta continuava liberada porque a
 * NOTA agregada era média/alta ou porque a etapa de ativação "apenas observa".
 *
 * Aqui a conformidade é lida SEPARADAMENTE da nota:
 *
 *   - a nota (`score`/`level`) continua existindo e sendo registrada;
 *   - a conformidade é um estado próprio, com as regras violadas, a prioridade
 *     de cada uma e a origem publicada;
 *   - violação BLOQUEANTE impede a entrega do candidato em qualquer etapa e
 *     com qualquer nota. Nota alta nunca compensa descumprimento crítico;
 *   - exigência crítica que NÃO pôde ser verificada também bloqueia: ausência
 *     de verificação nunca é aprovação.
 *
 * Módulo puro: sem banco, sem rede, sem modelo.
 */
import type { VerificacaoExigencia } from "@/lib/nina/rastreio/auditoria-instrucoes";
import type { PrioridadeRegra } from "./regras-publicadas";
import type { ResultadoConfianca } from "./types";

export const VALIDADOR_INSTRUCOES = "InstructionComplianceValidator";

export type EstadoConformidade =
  /** Regra publicada aplicável conferida e cumprida. */
  | "cumprida"
  /** Regra publicada aplicável descumprida. */
  | "descumprida"
  /** Havia regra aplicável, mas não foi possível conferir. */
  | "nao_verificada"
  /** As regras publicadas não puderam ser interpretadas. */
  | "falha_na_interpretacao"
  /** Nenhuma regra publicada aplicável a este turno. */
  | "nao_aplicavel"
  /** O validador de instruções não rodou neste turno. */
  | "sem_verificacao";

export type RegraNaoConforme = {
  id: string;
  regraId: string | null;
  prioridade: PrioridadeRegra | null;
  status: string;
  motivo: string;
};

export type ConformidadeInstrucoes = {
  estado: EstadoConformidade;
  /** Código do validador (auditoria), quando houver. */
  codigo: string | null;
  /** Regras publicadas descumpridas neste turno. */
  violacoes: RegraNaoConforme[];
  /** Regras publicadas aplicáveis que não puderam ser conferidas. */
  naoVerificadas: RegraNaoConforme[];
  /** A não conformidade impede a entrega do candidato? */
  bloqueante: boolean;
  /** Por que bloqueia (ou `null` quando não bloqueia). */
  motivoBloqueio:
    | "REGRA_PUBLICADA_DESCUMPRIDA"
    | "REGRA_PUBLICADA_NAO_VERIFICADA"
    | "FALHA_NA_INTERPRETACAO_DAS_REGRAS"
    | null;
  /** Prioridades envolvidas no bloqueio. */
  prioridades: PrioridadeRegra[];
  explicacao: string;
};

const PRIORIDADES_BLOQUEANTES: PrioridadeRegra[] = ["critica", "alta"];

type ObrigacaoEvidencia = {
  id?: unknown;
  origem?: unknown;
  status?: unknown;
  motivo?: unknown;
  prioridade?: unknown;
  regraId?: unknown;
};

function lerObrigacoes(evidence: unknown): ObrigacaoEvidencia[] {
  const e = (evidence ?? {}) as Record<string, unknown>;
  const lista = e["obrigacoes"];
  return Array.isArray(lista) ? (lista as ObrigacaoEvidencia[]) : [];
}

function paraRegra(o: ObrigacaoEvidencia): RegraNaoConforme {
  const prioridade =
    o.prioridade === "critica" || o.prioridade === "alta" || o.prioridade === "normal"
      ? (o.prioridade as PrioridadeRegra)
      : null;
  return {
    id: String(o.id ?? "-"),
    regraId: typeof o.regraId === "string" ? o.regraId : null,
    prioridade,
    status: String(o.status ?? "indeterminada"),
    motivo: String(o.motivo ?? "-"),
  };
}

/**
 * Lê a conformidade do turno a partir da avaliação FINAL. Nunca deduz
 * cumprimento: sem validador, o estado é `sem_verificacao`.
 */
export function conformidadeDasInstrucoes(
  avaliacao: ResultadoConfianca | null | undefined,
): ConformidadeInstrucoes {
  const validador = (avaliacao?.validators ?? []).find(
    (v) => v.validator === VALIDADOR_INSTRUCOES,
  );
  if (!validador) {
    return {
      estado: "sem_verificacao",
      codigo: null,
      violacoes: [],
      naoVerificadas: [],
      bloqueante: false,
      motivoBloqueio: null,
      prioridades: [],
      explicacao: "instruções publicadas não foram verificadas neste turno",
    };
  }

  const publicadas = lerObrigacoes(validador.evidence).filter(
    (o) => o.origem === "instrucoes_publicadas",
  );
  const violacoes = publicadas.filter((o) => o.status === "descumprida").map(paraRegra);
  const naoVerificadas = publicadas
    .filter((o) => o.status === "indeterminada")
    .map(paraRegra);

  const evidence = (validador.evidence ?? {}) as Record<string, unknown>;
  const estadoRestricoes = String(evidence["estadoRestricoes"] ?? "");

  let estado: EstadoConformidade;
  if (validador.reasonCode === "FALHA_NA_INTERPRETACAO_DAS_REGRAS") {
    estado = "falha_na_interpretacao";
  } else if (violacoes.length > 0 || estadoRestricoes === "descumpridas") {
    estado = "descumprida";
  } else if (estadoRestricoes === "cumpridas") {
    estado = "cumprida";
  } else if (naoVerificadas.length > 0 || estadoRestricoes === "indeterminadas") {
    estado = "nao_verificada";
  } else if (
    estadoRestricoes === "nenhuma_regra_aplicavel" ||
    estadoRestricoes === "nenhuma_regra_publicada"
  ) {
    estado = "nao_aplicavel";
  } else {
    estado = "sem_verificacao";
  }

  const criticasVioladas = violacoes.filter(
    (v) => v.prioridade === null || PRIORIDADES_BLOQUEANTES.includes(v.prioridade),
  );
  const criticasNaoVerificadas = naoVerificadas.filter(
    (v) => v.prioridade !== null && PRIORIDADES_BLOQUEANTES.includes(v.prioridade),
  );

  let bloqueante = false;
  let motivoBloqueio: ConformidadeInstrucoes["motivoBloqueio"] = null;
  let prioridades: PrioridadeRegra[] = [];

  if (estado === "descumprida") {
    bloqueante = criticasVioladas.length > 0 || violacoes.length === 0;
    motivoBloqueio = bloqueante ? "REGRA_PUBLICADA_DESCUMPRIDA" : null;
    prioridades = criticasVioladas
      .map((v) => v.prioridade)
      .filter((p): p is PrioridadeRegra => p !== null);
  } else if (estado === "nao_verificada" && criticasNaoVerificadas.length > 0) {
    bloqueante = true;
    motivoBloqueio = "REGRA_PUBLICADA_NAO_VERIFICADA";
    prioridades = criticasNaoVerificadas
      .map((v) => v.prioridade)
      .filter((p): p is PrioridadeRegra => p !== null);
  } else if (estado === "falha_na_interpretacao") {
    bloqueante = true;
    motivoBloqueio = "FALHA_NA_INTERPRETACAO_DAS_REGRAS";
  }

  return {
    estado,
    codigo: validador.reasonCode ?? null,
    violacoes,
    naoVerificadas,
    bloqueante,
    motivoBloqueio,
    prioridades,
    explicacao: bloqueante
      ? `conformidade=${estado}; bloqueio=${motivoBloqueio}; a nota agregada não libera esta saída`
      : `conformidade=${estado}; sem bloqueio por instruções publicadas`,
  };
}

/**
 * AUDITORIA — resultado da verificação de CADA exigência publicada deste
 * turno, cumpridas inclusive. Sem validador não existe lista: ausência de
 * verificação nunca vira "cumpridas".
 */
export function verificacoesDasInstrucoes(avaliacao: ResultadoConfianca | null | undefined): {
  verificacoes: VerificacaoExigencia[];
  falhaDeInterpretacao: boolean;
} {
  const validador = (avaliacao?.validators ?? []).find(
    (v) => v.validator === VALIDADOR_INSTRUCOES,
  );
  if (!validador) return { verificacoes: [], falhaDeInterpretacao: false };
  const verificacoes = lerObrigacoes(validador.evidence)
    .filter((o) => o.origem === "instrucoes_publicadas")
    .map((o) => {
      const status = String(o.status ?? "indeterminada");
      const estado: VerificacaoExigencia["estado"] =
        status === "cumprida" || status === "descumprida" || status === "nao_aplicavel"
          ? status
          : "indeterminada";
      return {
        regraId: typeof o.regraId === "string" ? o.regraId : null,
        descricao: String((o as { descricao?: unknown }).descricao ?? o.id ?? "-"),
        estado,
        motivo: o.motivo === undefined || o.motivo === null ? null : String(o.motivo),
      };
    });
  return {
    verificacoes,
    falhaDeInterpretacao: validador.reasonCode === "FALHA_NA_INTERPRETACAO_DAS_REGRAS",
  };
}

// ------------------------------------------------- decisão sobre a entrega

export type DecisaoConformidadeEntrega = {
  /** O candidato pode ser entregue ao paciente? */
  entregar: boolean;
  /** Pedir correção ao modelo e reavaliar? */
  corrigir: boolean;
  /** Encaminhar para atendimento humano (real na produção, simulado na homologação)? */
  desfechoHumano: boolean;
  tentativa: number;
  limiteTentativas: number;
  motivo: string | null;
  conformidade: ConformidadeInstrucoes;
  /** A revisão de texto NUNCA repete efeito externo. */
  efeitosExternosPermitidos: false;
  explicacao: string;
};

/**
 * Liga o resultado da verificação ao controle de envio, respeitando o limite
 * configurado de tentativas de correção. Correção é textual: nenhuma operação
 * com efeito externo (agendar, cancelar, transferir, enviar) é repetida.
 */
export function decidirEntregaPorConformidade(e: {
  conformidade: ConformidadeInstrucoes;
  /** Correções já tentadas neste turno. */
  tentativa: number;
  limiteTentativas: number;
  /** O pipeline consegue pedir uma nova versão do texto neste turno? */
  correcaoDisponivel?: boolean;
}): DecisaoConformidadeEntrega {
  const base = {
    tentativa: e.tentativa,
    limiteTentativas: e.limiteTentativas,
    conformidade: e.conformidade,
    efeitosExternosPermitidos: false as const,
  };
  if (!e.conformidade.bloqueante) {
    return {
      ...base,
      entregar: true,
      corrigir: false,
      desfechoHumano: false,
      motivo: null,
      explicacao: e.conformidade.explicacao,
    };
  }
  const podeCorrigir = e.correcaoDisponivel !== false && e.tentativa < e.limiteTentativas;
  return {
    ...base,
    entregar: false,
    corrigir: podeCorrigir,
    desfechoHumano: !podeCorrigir,
    motivo: e.conformidade.motivoBloqueio,
    explicacao: podeCorrigir
      ? `${e.conformidade.motivoBloqueio}: candidato bloqueado; correção ${e.tentativa + 1}/${e.limiteTentativas}`
      : `${e.conformidade.motivoBloqueio}: candidato bloqueado e limite de correções esgotado; desfecho de atendimento humano`,
  };
}

/**
 * Instrução de correção enviada ao modelo. Ela NÃO contém a resposta pronta:
 * descreve a exigência publicada descumprida para que o próprio modelo
 * produza a nova versão — substituir o texto por código seria fabricar a
 * aderência.
 */
export function instrucaoDeCorrecaoPorRegras(c: ConformidadeInstrucoes): string {
  const itens = [...c.violacoes, ...c.naoVerificadas]
    .map((v, i) => `${i + 1}. ${v.motivo} (regra ${v.regraId ?? v.id})`)
    .join("\n");
  return [
    "CORREÇÃO OBRIGATÓRIA: sua resposta anterior não cumpriu as instruções publicadas desta clínica.",
    itens ? `Pontos a corrigir:\n${itens}` : "Cumpra integralmente as instruções publicadas do turno.",
    "Reescreva APENAS o texto da resposta, cumprindo literalmente o que a instrução publicada exige.",
    "NÃO chame nenhuma ferramenta e NÃO repita nenhuma operação (agendar, cancelar, transferir ou enviar).",
  ].join("\n");
}
