/**
 * FASE 5 — Explicação da nota: mostrar a conta real de uma resposta.
 *
 * Camada pura (sem banco, sem rede, sem modelo). Recebe a pontuação da Fase 3,
 * a avaliação de regras da Fase 2, a saída final da Fase 4 e a identidade do
 * material usado; devolve uma estrutura pronta para o painel interno.
 *
 * REGRAS DURAS desta camada:
 *  - o índice é TÉCNICO (0–100), nunca probabilidade de acerto;
 *  - porcentagem só existe com denominador identificado;
 *  - nada aqui altera nota, nível ou decisão para caber na tela;
 *  - sem avaliação válida a tela diz "não avaliada" / "avaliação indisponível",
 *    nunca um número inventado;
 *  - avaliação do Sol (revisor externo) não é o índice do motor e viaja em
 *    campo separado.
 */
import type { PontuacaoContrato } from "./pontuacao-contrato";
import type { AvaliacaoContrato, ResultadoRegra, StatusRegra } from "./avaliacao-regras";
import type { SaidaFinal } from "./saida-final";

export const VERSAO_EXPLICACAO = "explicacao-5";

/** Rótulo padronizado do índice em toda a interface. */
export const ROTULO_INDICE = "Índice da resposta";

export const NOTA_INDICE_TECNICO =
  "Índice técnico de verificação (0–100). Mede quanto do que importava pôde ser " +
  "conferido e como esses pontos saíram. Não é probabilidade de acerto.";

/** "72/100" — sem teto visual: o número exibido é o número gravado. */
export function textoIndice(nota: number | null | undefined): string {
  return nota == null ? "—" : `${Math.round(nota)}/100`;
}

export function tituloIndice(nota: number | null | undefined): string {
  return `${ROTULO_INDICE}: ${textoIndice(nota)}`;
}

// ------------------------------------------------------------ porcentagem

export type Porcentagem = {
  /** Casos que satisfazem o critério. */
  numerador: number;
  /** Base de comparação. Sempre identificada. */
  denominador: number;
  denominadorRotulo: string;
  /** null quando não há base: a tela mostra "sem base", nunca 0%. */
  valor: number | null;
  texto: string;
};

export function porcentagem(
  numerador: number,
  denominador: number,
  denominadorRotulo: string,
): Porcentagem {
  if (!denominador || denominador <= 0) {
    return {
      numerador,
      denominador: 0,
      denominadorRotulo,
      valor: null,
      texto: `sem base (${denominadorRotulo}: 0)`,
    };
  }
  const valor = Math.round((numerador / denominador) * 1000) / 10;
  return {
    numerador,
    denominador,
    denominadorRotulo,
    valor,
    texto: `${valor}% (${numerador} de ${denominador} ${denominadorRotulo})`,
  };
}

// ------------------------------------------------------------------ regras

export type ExplicacaoEstado = {
  status: StatusRegra;
  rotulo: string;
  /** Explicação em palavras simples do que aquele estado significa. */
  significado: string;
  /** true só para descumprimento comprovado. */
  ehFalha: boolean;
};

const ESTADOS: Record<StatusRegra, Omit<ExplicacaoEstado, "status">> = {
  PASS: {
    rotulo: "Cumprida",
    significado: "A exigência foi conferida e a resposta atendeu.",
    ehFalha: false,
  },
  FAIL: {
    rotulo: "Descumprida",
    significado: "A exigência foi conferida e a resposta não atendeu.",
    ehFalha: true,
  },
  UNKNOWN: {
    rotulo: "Sem como conferir",
    significado:
      "Faltou evidência para dizer se foi atendida. Não é acerto nem erro: entra como parte não verificada.",
    ehFalha: false,
  },
  NOT_APPLICABLE: {
    rotulo: "Não se aplica",
    significado: "A exigência não vale para este atendimento, então fica fora da conta.",
    ehFalha: false,
  },
  PENDING: {
    rotulo: "Em conferência",
    significado: "A checagem ainda estava em andamento. É pendência, não erro.",
    ehFalha: false,
  },
};

export function explicarEstadoRegra(status: StatusRegra): ExplicacaoEstado {
  return { status, ...ESTADOS[status] };
}

export type LinhaRegraExplicada = {
  identificador: string;
  titulo: string;
  categoria: string;
  /** Condição que liga ou desliga a exigência neste turno. */
  condicao: string;
  aplicavel: boolean;
  estado: ExplicacaoEstado;
  evidencia: string[];
  trechoAvaliado: string | null;
  nota: number | null;
  /** Peso × nota efetivamente somados no índice (0 quando não soma). */
  contribuicao: number;
  peso: number;
  /** Entra na conta do candidato? (guarda posterior fica de fora). */
  contaNoCandidato: boolean;
  falhaTecnica: boolean;
  motivo: string;
};

function pesoDaRegra(p: PontuacaoContrato | null, identificador: string): number {
  if (!p) return 0;
  for (const parcela of p.parcelas) {
    if (parcela.identificadores.includes(identificador)) {
      return parcela.peso / Math.max(1, parcela.identificadores.length);
    }
  }
  return 0;
}

function explicarRegra(r: ResultadoRegra, p: PontuacaoContrato | null): LinhaRegraExplicada {
  const identificador = r.identificador ?? r.hashRegra;
  const peso = pesoDaRegra(p, identificador);
  const aplicavel = r.aplicabilidade === "APLICAVEL";
  const soma = aplicavel && r.contaNoCandidato && r.nota != null && !r.falhaTecnica;
  return {
    identificador,
    titulo: r.titulo ?? identificador,
    categoria: String(r.categoria),
    condicao: r.evidenciaCondicao || "sem condição registrada",
    aplicavel,
    estado: explicarEstadoRegra(r.status),
    evidencia: r.evidencia ?? [],
    trechoAvaliado: r.trechoAvaliado ?? null,
    nota: r.nota,
    contribuicao: soma ? Math.round(peso * (r.nota ?? 0) * 10) / 10 : 0,
    peso,
    contaNoCandidato: r.contaNoCandidato,
    falhaTecnica: r.falhaTecnica,
    motivo: r.motivo,
  };
}

// -------------------------------------------------------------- identidade

export type IdentidadeMaterial = {
  /** Versão/identificador do texto de instruções usado. */
  promptId: string | null;
  promptHash: string | null;
  identidadeId: string | null;
  versaoPolitica: string | null;
  configId: string | null;
  /** Hash do texto que a avaliação leu. */
  hashAvaliado: string | null;
  /** Hash do texto final entregue/avaliado ao fim. */
  hashTextoFinal: string | null;
};

export type CorrespondenciaTexto = {
  confere: boolean;
  explicacao: string;
};

export function conferirCorrespondencia(i: IdentidadeMaterial): CorrespondenciaTexto {
  if (!i.hashAvaliado || !i.hashTextoFinal) {
    return {
      confere: false,
      explicacao: "Não dá para afirmar que a nota se refere ao texto enviado: falta o registro do texto.",
    };
  }
  if (i.hashAvaliado !== i.hashTextoFinal) {
    return {
      confere: false,
      explicacao: "O texto mudou depois da avaliação. A nota abaixo não se refere ao texto final.",
    };
  }
  return { confere: true, explicacao: "A nota se refere exatamente ao texto enviado." };
}

// ------------------------------------------------------------------ blocos

export type BlocoOperacao = {
  /** Entrou na fila humana? Estado gravado, não texto de mensagem. */
  entrouNaFila: boolean | null;
  comprovanteFila: string | null;
  atendenteAtribuido: string | null;
  aviso: "pendente" | "enviado" | "falhou" | "nao_aplicavel";
  etapa: string | null;
  erro: string | null;
  simulado: boolean;
};

export type ExplicacaoResposta = {
  versao: string;
  /** "avaliada" | "nao_avaliada" | "avaliacao_indisponivel" */
  estado: "avaliada" | "nao_avaliada" | "avaliacao_indisponivel";
  rotuloEstado: string;
  indice: {
    rotulo: string;
    texto: string;
    nota: number | null;
    nivel: PontuacaoContrato["nivel"] | null;
    observacao: string;
  };
  cobertura: Porcentagem;
  linguagem: { nota: number | null; avaliadas: number; semConferencia: number; observacao: string };
  segurancaAcao: { estado: string; motivo: string; observacao: string };
  decisaoFinal: {
    doMotor: string | null;
    desfecho: string | null;
    /** Decisões intermediárias registradas, identificadas como tais. */
    intermediarias: string[];
    divergente: boolean;
    efeitoConfirmado: string;
  };
  operacao: BlocoOperacao;
  conta: {
    bruto: number | null;
    descontos: PontuacaoContrato["descontos"];
    tetos: PontuacaoContrato["tetos"];
    final: number | null;
    explicacao: string;
  };
  regras: LinhaRegraExplicada[];
  identidade: IdentidadeMaterial & { correspondencia: CorrespondenciaTexto };
  /** Avaliação do revisor Sol, quando existir. NUNCA é o índice do motor. */
  avaliacaoSol: { existe: boolean; veredito: string | null; observacao: string };
  bloqueadores: string[];
};

export type EntradaExplicacao = {
  pontuacao: PontuacaoContrato | null;
  avaliacao?: AvaliacaoContrato | null;
  saida?: SaidaFinal | null;
  identidade?: Partial<IdentidadeMaterial>;
  /** Motivo técnico quando a avaliação falhou (diferente de "não avaliada"). */
  falhaDeAvaliacao?: string | null;
  avaliacaoSol?: { veredito: string } | null;
};

const OBS_SEM_NOTA =
  "Esta resposta não tem índice registrado. Nada é estimado aqui: sem avaliação, não há nota.";

export function explicarResposta(e: EntradaExplicacao): ExplicacaoResposta {
  const p = e.pontuacao;
  const s = e.saida ?? null;
  const estado: ExplicacaoResposta["estado"] = e.falhaDeAvaliacao
    ? "avaliacao_indisponivel"
    : p
      ? "avaliada"
      : "nao_avaliada";

  const identidade: IdentidadeMaterial = {
    promptId: e.identidade?.promptId ?? null,
    promptHash: e.identidade?.promptHash ?? p?.hashPrompt ?? null,
    identidadeId: e.identidade?.identidadeId ?? null,
    versaoPolitica: e.identidade?.versaoPolitica ?? p?.versaoPolitica ?? null,
    configId: e.identidade?.configId ?? p?.configId ?? null,
    hashAvaliado: e.identidade?.hashAvaliado ?? null,
    hashTextoFinal: e.identidade?.hashTextoFinal ?? null,
  };

  const regrasBrutas = [...(e.avaliacao?.resultados ?? []), ...(e.avaliacao?.guardasPosteriores ?? [])];
  const regras = regrasBrutas.map((r) => explicarRegra(r, p));

  const enc = s?.encaminhamento ?? null;
  const operacao: BlocoOperacao = {
    entrouNaFila: enc ? enc.etapa === "fila_confirmada" || enc.etapa === "atribuido" : null,
    comprovanteFila: enc?.comprovanteFila ?? null,
    atendenteAtribuido: enc?.atendenteId ?? null,
    aviso: enc ? enc.aviso : "nao_aplicavel",
    etapa: enc?.etapa ?? null,
    erro: enc?.erro ?? null,
    simulado: Boolean(enc?.simulado),
  };

  const efeitoConfirmado = !s
    ? "sem registro de saída"
    : s.desfecho === "ENTREGUE"
      ? "resposta entregue ao paciente"
      : operacao.entrouNaFila
        ? "encaminhado para a fila humana (confirmado)"
        : operacao.simulado
          ? "simulação: nenhum efeito real"
          : "encaminhamento sem confirmação da fila";

  return {
    versao: VERSAO_EXPLICACAO,
    estado,
    rotuloEstado:
      estado === "avaliada"
        ? "Resposta avaliada"
        : estado === "nao_avaliada"
          ? "Resposta não avaliada"
          : "Avaliação indisponível",
    indice: {
      rotulo: ROTULO_INDICE,
      texto: textoIndice(p ? p.notaFinal : null),
      nota: p ? p.notaFinal : null,
      nivel: p ? p.nivel : null,
      observacao: p ? NOTA_INDICE_TECNICO : e.falhaDeAvaliacao ? `Avaliação indisponível: ${e.falhaDeAvaliacao}` : OBS_SEM_NOTA,
    },
    cobertura: porcentagem(
      p ? Math.round(p.denominadorAvaliado * 10) / 10 : 0,
      p ? Math.round(p.denominadorRelevante * 10) / 10 : 0,
      "pontos de exigência relevantes",
    ),
    linguagem: {
      nota: p?.linguagem.nota ?? null,
      avaliadas: p?.linguagem.avaliadas ?? 0,
      semConferencia: p?.linguagem.unknown ?? 0,
      observacao: "Qualidade de linguagem tem conta própria e não substitui o índice da resposta.",
    },
    segurancaAcao: {
      estado: p?.segurancaAcao.estado ?? "indeterminada",
      motivo: p?.segurancaAcao.motivo ?? "sem avaliação de ação registrada",
      observacao: "Segurança da ação é avaliação separada: não é a nota do texto.",
    },
    decisaoFinal: {
      doMotor: p?.decisao ?? null,
      desfecho: s?.desfecho ?? null,
      intermediarias: s?.recomendacoesIntermediarias ?? [],
      divergente: Boolean(s?.divergenciaComRecomendacao),
      efeitoConfirmado,
    },
    conta: {
      bruto: p ? p.notaConhecida : null,
      descontos: p?.descontos ?? [],
      tetos: p?.tetos ?? [],
      final: p ? p.notaFinal : null,
      explicacao: p
        ? `Bruto ${p.notaConhecida} → descontos ${p.descontos.reduce((t, d) => t + d.pontos, 0)} → ` +
          `${p.tetos.length ? `teto ${Math.min(...p.tetos.map((t) => t.valor))} → ` : ""}final ${p.notaFinal}`
        : "sem conta registrada",
    },
    regras,
    identidade: { ...identidade, correspondencia: conferirCorrespondencia(identidade) },
    avaliacaoSol: {
      existe: Boolean(e.avaliacaoSol),
      veredito: e.avaliacaoSol?.veredito ?? null,
      observacao:
        "Parecer do revisor Sol é opinião de revisão, registrada em separado. Não altera o índice do motor.",
    },
    bloqueadores: p?.bloqueadores ?? [],
  };
}
