/**
 * FASE 3 — MATEMÁTICA, CLASSIFICAÇÃO E CONFIGURAÇÃO COERENTES.
 *
 * Recebe a avaliação por regra da Fase 2 (sobre o contrato da Fase 1) e a
 * configuração EFETIVA da clínica, e produz, de forma auditável:
 *   1. índice da resposta (0–100, NÃO é probabilidade de acerto);
 *   2. cobertura das obrigações relevantes;
 *   3. avaliação de linguagem, separada;
 *   4. segurança da ação, separada;
 *   5. decisão final de saída.
 *
 * Fórmula (documentada e reproduzível):
 *   A = soma dos pesos das verificações CONCLUÍDAS (PASS/FAIL com nota)
 *   R = A + soma dos pesos das obrigações relevantes em UNKNOWN
 *   notaConhecida = A === 0 ? 0 (confiança insuficiente) : round(Σ(peso×nota)/A)
 *   cobertura     = R === 0 ? 0 : round(100 × A / R)
 *   notaFinal     = clamp(notaConhecida − descontos, tetos aplicáveis)
 *
 *   - UNKNOWN fica FORA do numerador e do denominador da nota conhecida e
 *     entra SOMENTE no denominador da cobertura (contar 0 duplicaria o efeito).
 *   - NOT_APPLICABLE e PENDING legítimo ficam fora das duas contas.
 *   - Falha técnica de verificador não é verificação concluída: conta como
 *     UNKNOWN relevante e fica registrada à parte.
 *   - Sem nenhuma evidência avaliável (A = 0) a nota é 0 com
 *     `confianca_insuficiente` — nunca 100.
 *
 * Orçamento de instruções: o peso configurado do cumprimento de instruções
 * (padrão 15) é distribuído entre as obrigações SUBSTANTIVAS aplicáveis
 * (ESSENCIAL e CONVERSACIONAL), em partes iguais, depois de agrupar regras
 * equivalentes. Duplicar ou renomear uma regra não aumenta peso nem dilui
 * falha essencial. Linguagem fica FORA desse orçamento e tem conta própria.
 *
 * Módulo puro e versionado. Nada aqui é ativado no atendimento: quem liga é o
 * seletor de implementação (atual / sombra / novo).
 */
import type { AvaliacaoContrato, ResultadoRegra, StatusRegra } from "./avaliacao-regras";
import type { ConfiguracaoEfetiva } from "./configuracao";
import { POLITICA_PADRAO, type PoliticaConfianca } from "./policy";
import { hashDoTexto } from "./hash";

/** Versão do contrato de pontuação. Sobe quando a interpretação muda. */
export const VERSAO_PONTUACAO_CONTRATO = "score-contrato-1";

/** Orçamento padrão de peso do cumprimento de instruções. */
export const ORCAMENTO_INSTRUCOES_PADRAO = 15;

export type NivelFinal = "HIGH" | "MEDIUM" | "LOW";

export type DecisaoFinal =
  | "ENTREGAR"
  | "BUSCAR_EVIDENCIA"
  | "ESCLARECER"
  | "BLOQUEAR_E_ENCAMINHAR";

export type CodigoBloqueio =
  | "AFIRMACAO_SEM_FONTE"
  | "IDENTIDADE_INCORRETA"
  | "OPERACAO_SEM_CONFIRMACAO"
  | "VIOLACAO_ESSENCIAL_APLICAVEL"
  | "PROVA_ESSENCIAL_INDETERMINADA"
  | "CONFIANCA_INSUFICIENTE";

export type ParcelaPeso = {
  /** Obrigação agrupada (regras equivalentes entram numa parcela só). */
  chave: string;
  identificadores: string[];
  categoria: "ESSENCIAL" | "CONVERSACIONAL" | "LINGUAGEM";
  peso: number;
  status: StatusRegra;
  nota: number | null;
  /** Entra na nota conhecida (A). */
  contaNaNota: boolean;
  /** Entra no denominador relevante da cobertura (R). */
  contaNaCobertura: boolean;
  motivo: string;
  falhaTecnica: boolean;
};

export type DescontoAplicado = { codigo: string; pontos: number };

export type TetoAplicado = { codigo: string; valor: number };

export type PontuacaoContrato = {
  versaoPontuacao: string;
  versaoPolitica: string;
  versaoMotor: string;
  configId: string;
  /** Hash do texto publicado avaliado. */
  hashPrompt: string | null;

  /** Σ(peso × nota) das verificações concluídas. */
  numerador: number;
  /** A = Σ pesos concluídos. */
  denominadorAvaliado: number;
  /** R = A + Σ pesos de UNKNOWN relevante. */
  denominadorRelevante: number;
  parcelas: ParcelaPeso[];

  notaConhecida: number;
  cobertura: number;
  descontos: DescontoAplicado[];
  tetos: TetoAplicado[];
  notaFinal: number;

  /** Linguagem: conta própria, nunca derruba a nota substantiva. */
  linguagem: { avaliadas: number; unknown: number; nota: number | null };
  /** Segurança da ação: separada do índice do texto. */
  segurancaAcao: {
    estado: "sem_acao" | "liberada" | "em_coleta" | "bloqueada" | "indeterminada";
    motivo: string;
  };

  bloqueadores: CodigoBloqueio[];
  nivel: NivelFinal;
  decisao: DecisaoFinal;
  motivoDecisao: string;
  /** Degradação da configuração (cache vencido/fallback), quando houver. */
  degradacao: string | null;
  tentativa: number;
};

export type EntradaPontuacao = {
  avaliacao: AvaliacaoContrato;
  configuracao: ConfiguracaoEfetiva;
  ambiente?: "producao" | "homologacao" | null;
  /** Tentativa atual do ciclo MEDIUM (1 = primeira avaliação). */
  tentativa?: number;
  /** Máximo de tentativas de evidência/esclarecimento antes de desistir. */
  maxTentativas?: number;
  /** Descontos documentados (penalidades já apuradas por outra camada). */
  descontos?: DescontoAplicado[];
  /** Decisão de um decisor anterior. Registrada, nunca obedecida para LOW. */
  decisaoAnterior?: string | null;
};

// -------------------------------------------------------- política do turno

export type PoliticaInvalida = { ok: false; erros: string[] };
export type PoliticaValida = { ok: true; politica: PoliticaConfianca };

/** Valida o conjunto inteiro: proposta inválida não entra em vigor parcial. */
export function validarPoliticaCompleta(p: PoliticaConfianca): PoliticaInvalida | PoliticaValida {
  const erros: string[] = [];
  const { HIGH, MEDIUM } = p.limites;
  if (!(HIGH > MEDIUM)) erros.push("limite_high_menor_ou_igual_ao_medium");
  for (const [k, v] of Object.entries({ HIGH, MEDIUM })) {
    if (v < 0 || v > 100) erros.push(`limite_fora_da_faixa:${k}`);
  }
  const c = p.cobertura;
  if (c.minimaParaHigh < c.minimaParaAllow) erros.push("cobertura_minima_high_menor_que_allow");
  for (const [k, v] of Object.entries({
    minimaParaHigh: c.minimaParaHigh,
    minimaParaAllow: c.minimaParaAllow,
    teto: c.tetoScoreCoberturaBaixa,
  })) {
    if (v < 0 || v > 100) erros.push(`cobertura_fora_da_faixa:${k}`);
  }
  if (c.tetoScoreCoberturaBaixa >= HIGH) erros.push("teto_de_cobertura_nao_limita_high");
  const orcamento = p.pesos["InstructionComplianceValidator"];
  if (orcamento != null && orcamento < 0) erros.push("orcamento_de_instrucoes_negativo");
  for (const [k, v] of Object.entries(p.minimoPorRisco)) {
    if (v < 0 || v > 100) erros.push(`minimo_por_risco_fora_da_faixa:${k}`);
  }
  return erros.length > 0 ? { ok: false, erros } : { ok: true, politica: p };
}

function congelar<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    for (const v of Object.values(o as Record<string, unknown>)) congelar(v);
    Object.freeze(o);
  }
  return o;
}

/**
 * Política EFETIVA e IMUTÁVEL do turno. Se a configuração da clínica for
 * inválida como conjunto, caímos no padrão inteiro (nunca metade de cada) e a
 * degradação é declarada.
 */
export function politicaDoTurno(cfg: ConfiguracaoEfetiva): {
  politica: PoliticaConfianca;
  degradacao: string | null;
} {
  const v = validarPoliticaCompleta(cfg.parametros);
  if (!v.ok) {
    return {
      politica: congelar(structuredClone(POLITICA_PADRAO)),
      degradacao: `configuracao_invalida:${v.erros.join(",")}`,
    };
  }
  return {
    politica: congelar(structuredClone(cfg.parametros)),
    degradacao: cfg.degradada ? (cfg.motivoDegradacao ?? "configuracao_degradada") : null,
  };
}

// -------------------------------------------------------------- agrupamento

function chaveEquivalencia(r: ResultadoRegra): string {
  // Regras equivalentes (mesmo conteúdo conferido, ID renomeado) caem na mesma
  // parcela. Usa o que é verificado, não o identificador.
  return `${r.categoria}|${r.motivo === "CONDICAO_COMPROVADAMENTE_FALSA" ? "na" : r.hashRegra}`;
}

const PIOR: Record<StatusRegra, number> = {
  FAIL: 0,
  UNKNOWN: 1,
  PASS: 2,
  PENDING: 3,
  NOT_APPLICABLE: 4,
};

function agruparEquivalentes(rs: ResultadoRegra[]): Array<{ chave: string; itens: ResultadoRegra[] }> {
  const mapa = new Map<string, ResultadoRegra[]>();
  for (const r of rs) {
    const k = chaveEquivalencia(r);
    mapa.set(k, [...(mapa.get(k) ?? []), r]);
  }
  return [...mapa.entries()].map(([chave, itens]) => ({ chave, itens }));
}

function representante(itens: ResultadoRegra[]): ResultadoRegra {
  return [...itens].sort((a, b) => PIOR[a.status] - PIOR[b.status])[0]!;
}

// --------------------------------------------------------------- pontuação

function arredondar(n: number): number {
  return Math.round(n);
}

export function pontuarContrato(e: EntradaPontuacao): PontuacaoContrato {
  const { avaliacao } = e;
  const { politica, degradacao } = politicaDoTurno(e.configuracao);
  const orcamento = politica.pesos["InstructionComplianceValidator"] ?? ORCAMENTO_INSTRUCOES_PADRAO;
  const tentativa = e.tentativa ?? 1;
  const maxTentativas = e.maxTentativas ?? 2;

  const substantivas = avaliacao.resultados.filter(
    (r) =>
      r.contaNoCandidato &&
      r.categoria !== "LINGUAGEM" &&
      r.status !== "NOT_APPLICABLE" &&
      r.status !== "PENDING",
  );
  const grupos = agruparEquivalentes(substantivas);
  const peso = grupos.length === 0 ? 0 : orcamento / grupos.length;

  const parcelas: ParcelaPeso[] = grupos.map(({ chave, itens }) => {
    const r = representante(itens);
    const concluida = r.status === "PASS" || r.status === "FAIL";
    return {
      chave,
      identificadores: itens.map((x) => x.identificador ?? "(sem id)"),
      categoria: r.categoria,
      peso,
      status: r.status,
      nota: concluida ? (r.nota ?? (r.status === "PASS" ? 100 : 0)) : null,
      contaNaNota: concluida,
      contaNaCobertura: true,
      motivo: r.motivo,
      falhaTecnica: itens.some((x) => x.falhaTecnica),
    };
  });

  const numerador = parcelas
    .filter((p) => p.contaNaNota)
    .reduce((s, p) => s + p.peso * (p.nota ?? 0), 0);
  const A = parcelas.filter((p) => p.contaNaNota).reduce((s, p) => s + p.peso, 0);
  const R = parcelas.reduce((s, p) => s + p.peso, 0);

  const notaConhecida = A === 0 ? 0 : arredondar(numerador / A);
  const cobertura = R === 0 ? 0 : arredondar((100 * A) / R);

  // --------------------------------------------------- linguagem (separada)
  const ling = avaliacao.resultados.filter((r) => r.categoria === "LINGUAGEM");
  const lingConcluidas = ling.filter((r) => r.status === "PASS" || r.status === "FAIL");
  const linguagem = {
    avaliadas: lingConcluidas.length,
    unknown: ling.filter((r) => r.status === "UNKNOWN").length,
    nota:
      lingConcluidas.length === 0
        ? null
        : arredondar(
            lingConcluidas.reduce((s, r) => s + (r.nota ?? (r.status === "PASS" ? 100 : 0)), 0) /
              lingConcluidas.length,
          ),
  };

  // ------------------------------------------------ segurança da ação
  const acao = avaliacao.resultados.filter(
    (r) => r.momento === "autorizacao_acao" || r.momento === "confirmacao_operacional",
  );
  const acaoAplicavel = acao.filter((r) => r.status !== "NOT_APPLICABLE");
  const segurancaAcao: PontuacaoContrato["segurancaAcao"] = (() => {
    if (acaoAplicavel.length === 0) return { estado: "sem_acao", motivo: "nenhuma_acao_no_turno" };
    if (acaoAplicavel.some((r) => r.status === "FAIL")) {
      return {
        estado: "bloqueada",
        motivo: acaoAplicavel.find((r) => r.status === "FAIL")!.motivo,
      };
    }
    if (acaoAplicavel.some((r) => r.status === "PENDING")) {
      return { estado: "em_coleta", motivo: "requisitos_em_coleta" };
    }
    if (acaoAplicavel.some((r) => r.status === "UNKNOWN")) {
      return { estado: "indeterminada", motivo: "verificacao_de_acao_nao_concluida" };
    }
    return { estado: "liberada", motivo: "requisitos_confirmados" };
  })();

  // ------------------------------------------------------- bloqueadores
  const bloqueadores: CodigoBloqueio[] = [];
  const essenciais = avaliacao.resultados.filter((r) => r.categoria === "ESSENCIAL");
  for (const r of essenciais) {
    if (r.status === "FAIL") {
      if (r.motivo === "AFIRMACAO_SEM_FONTE") bloqueadores.push("AFIRMACAO_SEM_FONTE");
      else if (r.motivo === "IDENTIDADE_TROCADA" || r.motivo.startsWith("APRESENTACAO_")) {
        bloqueadores.push("IDENTIDADE_INCORRETA");
      } else if (
        r.momento === "confirmacao_operacional" ||
        r.motivo === "OPERACAO_ANUNCIADA_COM_DADOS_PENDENTES"
      ) {
        bloqueadores.push("OPERACAO_SEM_CONFIRMACAO");
      } else bloqueadores.push("VIOLACAO_ESSENCIAL_APLICAVEL");
    }
    // Prova essencial ainda indeterminada de que a resposta DEPENDE.
    if (
      r.status === "UNKNOWN" &&
      (r.motivo === "AFIRMACAO_NAO_CONFERIDA" ||
        r.motivo === "RESULTADO_OPERACIONAL_DESCONHECIDO" ||
        r.motivo === "IDENTIDADE_PUBLICADA_AUSENTE")
    ) {
      bloqueadores.push("PROVA_ESSENCIAL_INDETERMINADA");
    }
  }
  if (A === 0) bloqueadores.push("CONFIANCA_INSUFICIENTE");

  // ------------------------------------------------------- tetos e descontos
  const descontos = e.descontos ?? [];
  const totalDesconto = descontos.reduce((s, d) => s + d.pontos, 0);
  const tetos: TetoAplicado[] = [];
  let nota = Math.max(0, notaConhecida - totalDesconto);

  if (cobertura < politica.cobertura.minimaParaHigh) {
    tetos.push({ codigo: "COBERTURA_BAIXA", valor: politica.cobertura.tetoScoreCoberturaBaixa });
    nota = Math.min(nota, politica.cobertura.tetoScoreCoberturaBaixa);
  }
  if (bloqueadores.length > 0) {
    tetos.push({ codigo: "BLOQUEADOR", valor: 0 });
    nota = 0;
  }
  const notaFinal = Math.max(0, Math.min(100, arredondar(nota)));

  // ------------------------------------------------------- nível e decisão
  let nivel: NivelFinal =
    notaFinal >= politica.limites.HIGH ? "HIGH" : notaFinal >= politica.limites.MEDIUM ? "MEDIUM" : "LOW";
  if (bloqueadores.length > 0) nivel = "LOW";

  let decisao: DecisaoFinal;
  let motivoDecisao: string;
  if (nivel === "LOW") {
    decisao = "BLOQUEAR_E_ENCAMINHAR";
    motivoDecisao =
      bloqueadores.length > 0
        ? `bloqueadores: ${bloqueadores.join(", ")}`
        : `nota ${notaFinal} abaixo de MEDIUM ${politica.limites.MEDIUM}`;
  } else if (nivel === "MEDIUM") {
    if (tentativa >= maxTentativas) {
      nivel = "LOW";
      decisao = "BLOQUEAR_E_ENCAMINHAR";
      motivoDecisao = `tentativas de evidência esgotadas (${tentativa}/${maxTentativas})`;
    } else {
      decisao = cobertura < 100 ? "BUSCAR_EVIDENCIA" : "ESCLARECER";
      motivoDecisao = `nota ${notaFinal} entre MEDIUM ${politica.limites.MEDIUM} e HIGH ${politica.limites.HIGH}`;
    }
  } else if (segurancaAcao.estado === "bloqueada" || segurancaAcao.estado === "indeterminada") {
    nivel = "LOW";
    decisao = "BLOQUEAR_E_ENCAMINHAR";
    motivoDecisao = `requisito de envio não satisfeito: ${segurancaAcao.motivo}`;
  } else {
    decisao = "ENTREGAR";
    motivoDecisao = `nota ${notaFinal} >= HIGH ${politica.limites.HIGH}, cobertura ${cobertura}%`;
  }

  return {
    versaoPontuacao: VERSAO_PONTUACAO_CONTRATO,
    versaoPolitica: e.configuracao.versaoPolitica,
    versaoMotor: e.configuracao.versaoMotor,
    configId: e.configuracao.configId,
    hashPrompt: avaliacao.hash ?? null,
    numerador: arredondar(numerador),
    denominadorAvaliado: Number(A.toFixed(4)),
    denominadorRelevante: Number(R.toFixed(4)),
    parcelas,
    notaConhecida,
    cobertura,
    descontos,
    tetos,
    notaFinal,
    linguagem,
    segurancaAcao,
    bloqueadores: [...new Set(bloqueadores)],
    nivel,
    decisao,
    motivoDecisao,
    degradacao,
    tentativa,
  };
}

/** Linha técnica auditável (numeradores, denominadores, tetos, decisão). */
export function explicarPontuacao(p: PontuacaoContrato): string {
  return [
    `indice=${p.notaFinal}/100 (nao e probabilidade)`,
    `notaConhecida=${p.notaConhecida} numerador=${p.numerador} A=${p.denominadorAvaliado} R=${p.denominadorRelevante}`,
    `cobertura=${p.cobertura}%`,
    `linguagem=${p.linguagem.nota ?? "indeterminada"} (unknown=${p.linguagem.unknown})`,
    `acao=${p.segurancaAcao.estado}`,
    `descontos=${p.descontos.map((d) => `${d.codigo}:${d.pontos}`).join("|") || "-"}`,
    `tetos=${p.tetos.map((t) => `${t.codigo}:${t.valor}`).join("|") || "-"}`,
    `bloqueadores=${p.bloqueadores.join("|") || "-"}`,
    `nivel=${p.nivel} decisao=${p.decisao} (${p.motivoDecisao})`,
    `versoes=${p.versaoPontuacao}/${p.versaoPolitica}/${p.versaoMotor} cfg=${p.configId} prompt=${p.hashPrompt ?? "-"}`,
  ].join(" | ");
}

/** Identidade estável desta interpretação de score (para snapshots). */
export function assinaturaDaPontuacao(p: PontuacaoContrato): string {
  return `score:${VERSAO_PONTUACAO_CONTRATO}:${hashDoTexto(explicarPontuacao(p)) ?? "0"}`;
}
