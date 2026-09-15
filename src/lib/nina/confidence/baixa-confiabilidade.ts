/**
 * REGRA OBRIGATÓRIA — BAIXA CONFIABILIDADE ENCAMINHA PARA HUMANO.
 *
 * Complementa (e prevalece sobre) as fases anteriores: quando a avaliação
 * FINAL da resposta resulta em nível LOW / Baixa, o conteúdo candidato NÃO vai
 * para o paciente em nenhuma representação (texto, áudio ou resumo falado).
 * O paciente recebe apenas um aviso controlado de encaminhamento.
 *
 * Pontos que esta camada garante:
 *
 *  - o nível vem da classificação vigente na configuração da clínica
 *    (`limites` da política efetiva). Nenhum número novo é criado aqui;
 *  - a regra vale inclusive na etapa de ativação A (que só observa) — ela é
 *    proteção obrigatória, e a precedência fica registrada;
 *  - EXCEÇÃO DE INCERTEZA (etapa A): quando o nível LOW nasce SOMENTE da
 *    cobertura insuficiente (o motor não conseguiu olhar o bastante) e nenhuma
 *    dimensão avaliada FALHOU, não há bloqueador absoluto, não há afirmação sem
 *    fonte, não há conformidade bloqueante e a pessoa não pediu humano, a etapa
 *    A faz o que promete: registra e não encaminha. A partir da etapa B a
 *    incerteza volta a encaminhar. Falha comprovada encaminha em qualquer etapa;
 *  - vale mesmo quando a decisão recomendada pelo motor for CLARIFY: para uma
 *    resposta LOW o destino definido pelo produto é atendimento humano;
 *  - produção encaminha de verdade; homologação apenas simula o desfecho, sem
 *    atribuição real, sem fila real e sem notificação real;
 *  - falha no encaminhamento nunca vira sucesso: o candidato continua
 *    bloqueado e o aviso descreve a situação real;
 *  - idempotência: reprocessar o mesmo turno não duplica aviso nem
 *    encaminhamento;
 *  - o aviso é mensagem controlada do sistema: ele é validado pelo próprio
 *    conteúdo e pelo estado do encaminhamento, nunca pela nota do conteúdo
 *    descartado (evita o ciclo de bloquear o próprio aviso).
 *
 * Camada pura: sem banco, sem rede, sem modelo.
 */
import type { NivelConfianca, DecisaoMotor } from "./types";
import type { EtapaAtivacao } from "./etapas";

/** Aviso enviado ao paciente quando o encaminhamento humano foi concluído. */
export const AVISO_ENCAMINHAMENTO_HUMANO =
  "Vou chamar uma pessoa da nossa equipe para continuar seu atendimento por aqui.";

/**
 * Aviso quando o encaminhamento NÃO pôde ser concluído. Descreve a situação
 * sem inventar transferência concluída e sem expor detalhe técnico.
 */
export const AVISO_ENCAMINHAMENTO_FALHOU =
  "Não consegui concluir seu atendimento por aqui agora. Já registrei sua mensagem para que uma pessoa da nossa equipe retome com você.";

/**
 * Aviso exibido na homologação. NÃO pode ser igual ao aviso de encaminhamento
 * concluído: em homologação nada é atribuído a ninguém, então anunciar
 * transferência realizada seria fabricar um desfecho que não aconteceu.
 */
export const AVISO_ENCAMINHAMENTO_SIMULADO =
  "Não vou seguir com esta resposta agora. Sua mensagem fica registrada para que uma pessoa da nossa equipe continue por aqui.";

export const MOTIVO_BLOQUEIO_BAIXA_CONFIANCA = "CONFIANCA_BAIXA_ENCAMINHA_HUMANO";

export type AmbienteSaida = "producao" | "homologacao";

export type EntradaBloqueioBaixaConfianca = {
  /** Nível da avaliação FINAL, já classificado pela configuração da clínica. */
  nivel: NivelConfianca | null;
  score: number | null;
  /** Decisão recomendada pelo motor (CLARIFY não dispensa a regra). */
  decisaoMotor: DecisaoMotor | null;
  etapa: EtapaAtivacao | null;
  ambiente: AmbienteSaida;
  /** Identificação da configuração usada na classificação. */
  configId?: string | null;
  /** Já houve encaminhamento humano neste turno (idempotência). */
  jaEncaminhado?: boolean;
  /** O aviso controlado já foi aplicado a este turno (idempotência). */
  avisoJaAplicado?: boolean;
  /** Hash do conteúdo candidato avaliado (rastreabilidade, sem PII). */
  conteudoCandidatoHash?: string | null;
  /**
   * Exceção estruturada de saudação: uma abertura de conversa correta não é
   * encaminhada só porque a nota ficou baixa. Todas as condições precisam
   * valer ao mesmo tempo (ver `excecaoSaudacaoAplicavel`).
   */
  saudacao?: EntradaSaudacao;
  /**
   * @deprecated Use `saudacao`. Mantido para chamadas antigas: equivale a
   * declarar apenas que o turno é social, com as demais condições ausentes.
   */
  turnoSocialSemAcao?: boolean;
  /** Bloqueadores absolutos observados no turno. */
  bloqueadoresAbsolutos?: string[];
  /**
   * Medida de incerteza do turno, informada pelo runtime a partir do resultado
   * do motor. Campo ausente = não observado, e "não observado" nunca isenta.
   */
  incerteza?: EntradaIncerteza;
};

/**
 * De onde veio o LOW: de incerteza (cobertura insuficiente) ou de falha
 * comprovada (alguma dimensão avaliada reprovou). Só a incerteza pura, na
 * etapa A, deixa de encaminhar.
 */
export type EntradaIncerteza = {
  /** A cobertura de evidências ficou abaixo do mínimo da política. */
  coberturaInsuficiente: boolean;
  /** Alguma dimensão com peso na nota terminou em FAIL ou BLOCK. */
  falhaComprovada: boolean;
};

export const MOTIVO_ISENCAO_INCERTEZA_ETAPA_A = "INCERTEZA_SEM_FALHA_ETAPA_A_OBSERVA";

/**
 * A isenção de incerteza vale? Só na etapa A, só com LOW nascido da cobertura
 * e só quando NENHUM sinal de risco foi observado. Qualquer sinal devolve a
 * decisão à regra obrigatória.
 */
export function isencaoIncertezaAplicavel(e: {
  etapa: EtapaAtivacao | null | undefined;
  incerteza?: EntradaIncerteza;
  bloqueadoresAbsolutos?: string[];
  saudacao?: EntradaSaudacao;
}): { aplica: boolean; impedimento: string | null } {
  if (e.etapa !== "A") return { aplica: false, impedimento: "ETAPA_ALEM_DE_A" };
  if (!e.incerteza) return { aplica: false, impedimento: "INCERTEZA_NAO_OBSERVADA" };
  if (!e.incerteza.coberturaInsuficiente) {
    return { aplica: false, impedimento: "LOW_NAO_VEM_DA_COBERTURA" };
  }
  const impedimentos: Array<[boolean | undefined, string]> = [
    [e.incerteza.falhaComprovada, "FALHA_COMPROVADA"],
    [(e.bloqueadoresAbsolutos?.length ?? 0) > 0, "BLOQUEADOR_ABSOLUTO"],
    [e.saudacao?.afirmacaoSemFonte, "AFIRMACAO_SEM_FONTE"],
    [e.saudacao?.pedidoDeHumano, "PEDIDO_DE_ATENDIMENTO_HUMANO"],
    [e.saudacao?.conflitoDeIdentidade, "CONFLITO_DE_IDENTIDADE"],
    [e.saudacao?.conformidadeBloqueante, "CONFORMIDADE_BLOQUEANTE"],
  ];
  const achado = impedimentos.find(([v]) => v === true);
  return achado ? { aplica: false, impedimento: achado[1] } : { aplica: true, impedimento: null };
}

/**
 * Condições OBSERVADAS do turno de saudação. Nenhuma delas é suposta: o
 * runtime informa o que verificou. Campo ausente = não observado, e "não
 * observado" nunca vale como impedimento.
 */
export type EntradaSaudacao = {
  /** O turno é abertura/saudação (ou esclarecimento sem ação pedida). */
  turnoSocial: boolean;
  /** Houve ação operacional pedida ou executada neste turno. */
  acaoOperacional?: boolean;
  /** A resposta afirma preço, horário ou disponibilidade sem fonte. */
  afirmacaoSemFonte?: boolean;
  /** A pessoa pediu para falar com uma pessoa da equipe. */
  pedidoDeHumano?: boolean;
  /** A apresentação contradiz a identidade configurada da assistente. */
  conflitoDeIdentidade?: boolean;
  /** Há descumprimento bloqueante de regra publicada. */
  conformidadeBloqueante?: boolean;
  /**
   * Há regra publicada APLICÁVEL a este turno que não pôde ser conferida.
   * Não é descumprimento, mas também não é aval: a exceção social só vale
   * quando nada aplicável ficou sem verificação.
   */
  conformidadeNaoVerificada?: boolean;
};

/**
 * Critério ÚNICO de "afirmação sem lastro", usado pelo atendimento real e
 * pelos testes de encadeamento.
 *
 * Não basta olhar as afirmações já classificadas como sem evidência: uma
 * afirmação que o extrator NÃO reconheceu (validador UNKNOWN) também não tem
 * lastro conferido. Tratá-la como inofensiva deixava passar, dentro de uma
 * saudação, frases como "já confirmei seu agendamento".
 */
export function afirmacaoSemLastro(
  avaliacao:
    | {
        claims?: { semEvidencia: unknown[] } | null;
        validators?: Array<{ validator: string; status: string }> | null;
      }
    | null
    | undefined,
): boolean {
  if (!avaliacao) return false;
  if ((avaliacao.claims?.semEvidencia.length ?? 0) > 0) return true;
  const sensiveis = ["ClaimGroundingValidator", "ActionProofValidator"];
  return (avaliacao.validators ?? []).some(
    (v) => sensiveis.includes(v.validator) && (v.status === "FAIL" || v.status === "UNKNOWN"),
  );
}

/**
 * A exceção de saudação vale? Só quando o turno é social E nenhuma das
 * condições de risco foi observada. Qualquer uma delas devolve a decisão ao
 * critério normal de confiança.
 */
export function excecaoSaudacaoAplicavel(s: EntradaSaudacao | undefined): {
  aplica: boolean;
  impedimento: string | null;
} {
  if (!s || s.turnoSocial !== true) return { aplica: false, impedimento: "TURNO_NAO_SOCIAL" };
  const impedimentos: Array<[boolean | undefined, string]> = [
    [s.acaoOperacional, "ACAO_OPERACIONAL_NO_TURNO"],
    [s.afirmacaoSemFonte, "AFIRMACAO_SEM_FONTE"],
    [s.pedidoDeHumano, "PEDIDO_DE_ATENDIMENTO_HUMANO"],
    [s.conflitoDeIdentidade, "CONFLITO_DE_IDENTIDADE"],
    [s.conformidadeBloqueante, "CONFORMIDADE_BLOQUEANTE"],
    [s.conformidadeNaoVerificada, "CONFORMIDADE_NAO_VERIFICADA"],
  ];
  const achado = impedimentos.find(([v]) => v === true);
  return achado ? { aplica: false, impedimento: achado[1] } : { aplica: true, impedimento: null };
}

export type DecisaoBloqueioBaixaConfianca = {
  /** O conteúdo candidato deve ser descartado para envio? */
  bloquear: boolean;
  /** Precisa acionar o mecanismo de encaminhamento humano agora? */
  encaminhar: boolean;
  motivo: string | null;
  nivel: NivelConfianca | null;
  score: number | null;
  decisaoMotor: DecisaoMotor | null;
  etapa: EtapaAtivacao | null;
  ambiente: AmbienteSaida;
  configId: string | null;
  conteudoCandidatoHash: string | null;
  /** A regra prevalece sobre a etapa de ativação (inclusive A). */
  precedeEtapaAtivacao: boolean;
  /** A regra prevalece sobre a decisão recomendada pelo motor. */
  precedeDecisaoMotor: boolean;
  /** Já aplicado antes: nada é repetido. */
  jaAplicado: boolean;
  /** Por que a exceção de saudação não valeu (auditoria). */
  impedimentoSaudacao: string | null;
  /** Etapa A observou um LOW de incerteza pura e não encaminhou. */
  isencaoIncertezaEtapaA: boolean;
  /** Por que a isenção de incerteza não valeu (auditoria). */
  impedimentoIncerteza: string | null;
  explicacao: string;
};

/** A regra observa apenas o nível vigente: LOW / Baixa. */
export function nivelExigeEncaminhamento(nivel: NivelConfianca | null | undefined): boolean {
  return nivel === "LOW";
}

export function decidirBloqueioBaixaConfianca(
  e: EntradaBloqueioBaixaConfianca,
): DecisaoBloqueioBaixaConfianca {
  // Saudação correta nunca encaminha por nota baixa: não há ação operacional
  // em risco, nem afirmação sem fonte, nem bloqueador absoluto.
  const saudacao: EntradaSaudacao | undefined =
    e.saudacao ?? (e.turnoSocialSemAcao === true ? { turnoSocial: true } : undefined);
  const excecao = excecaoSaudacaoAplicavel(saudacao);
  const isencaoSocial = excecao.aplica && (e.bloqueadoresAbsolutos?.length ?? 0) === 0;
  // Pedido explícito de pessoa é motivo PRÓPRIO de encaminhamento: não depende
  // da nota. Antes ele só bloqueava de carona, quando a nota caía para Baixa —
  // o que deixava o pedido sem destino assim que a nota melhorava.
  const pedidoDeHumano = saudacao?.pedidoDeHumano === true;
  // Incerteza pura na etapa A: o motor registra o LOW, mas a etapa que "só
  // observa" não tira a resposta do paciente. Pedido de humano e falha
  // comprovada continuam encaminhando.
  const incerteza = isencaoIncertezaAplicavel({
    etapa: e.etapa,
    ...(e.incerteza ? { incerteza: e.incerteza } : {}),
    ...(e.bloqueadoresAbsolutos ? { bloqueadoresAbsolutos: e.bloqueadoresAbsolutos } : {}),
    ...(saudacao ? { saudacao } : {}),
  });
  const isencaoIncerteza =
    !pedidoDeHumano && nivelExigeEncaminhamento(e.nivel) && incerteza.aplica;
  const aplicavel =
    pedidoDeHumano ||
    (nivelExigeEncaminhamento(e.nivel) && !isencaoSocial && !isencaoIncerteza);
  const jaAplicado = e.avisoJaAplicado === true;
  const base = {
    nivel: e.nivel ?? null,
    score: e.score ?? null,
    decisaoMotor: e.decisaoMotor ?? null,
    etapa: e.etapa ?? null,
    ambiente: e.ambiente,
    configId: e.configId ?? null,
    conteudoCandidatoHash: e.conteudoCandidatoHash ?? null,
    jaAplicado,
    impedimentoSaudacao: excecao.impedimento,
    isencaoIncertezaEtapaA: isencaoIncerteza,
    impedimentoIncerteza: incerteza.impedimento,
  };
  if (!aplicavel) {
    return {
      ...base,
      bloquear: false,
      encaminhar: false,
      motivo: isencaoIncerteza ? MOTIVO_ISENCAO_INCERTEZA_ETAPA_A : null,
      precedeEtapaAtivacao: false,
      precedeDecisaoMotor: false,
      explicacao: isencaoSocial
        ? "saudação sem ação operacional, sem afirmação sem fonte e sem pedido de humano: não encaminha"
        : isencaoIncerteza
          ? `nivel=LOW por cobertura insuficiente, sem falha comprovada: etapa A registra e não encaminha (score=${e.score ?? "?"})`
          : `nivel=${e.nivel ?? "indisponivel"}: regra de baixa confiabilidade não se aplica`,
    };
  }
  const porPedido = pedidoDeHumano && !nivelExigeEncaminhamento(e.nivel);
  return {
    ...base,
    bloquear: true,
    // Idempotência: aviso já aplicado ou encaminhamento já feito não repete.
    encaminhar: !jaAplicado && e.jaEncaminhado !== true,
    motivo: porPedido ? "PEDIDO_DE_ATENDIMENTO_HUMANO" : MOTIVO_BLOQUEIO_BAIXA_CONFIANCA,
    precedeEtapaAtivacao: true,
    precedeDecisaoMotor: e.decisaoMotor !== null && e.decisaoMotor !== "HANDOFF",
    explicacao: jaAplicado
      ? `${porPedido ? "pedido de pessoa" : "nivel=LOW"}: bloqueio já aplicado neste turno (sem repetição)`
      : porPedido
        ? `pedido explícito de atendimento humano: destino obrigatório = atendimento humano (etapa=${e.etapa ?? "?"})`
        : `nivel=LOW: conteúdo candidato descartado; destino obrigatório = atendimento humano (etapa=${e.etapa ?? "?"}, decisão do motor=${e.decisaoMotor ?? "?"})`,
  };
}

// ------------------------------------------------- resultado do encaminhamento

export type ResultadoEncaminhamento =
  | { tipo: "real"; confirmado: boolean; comprovacao?: string | null; erro?: string | null }
  | { tipo: "simulado" }
  | { tipo: "nao_executado"; erro?: string | null };

export type SaidaControlada = {
  /** Texto que efetivamente vai ao paciente / à conversa de teste. */
  aviso: string;
  /** Origem declarada da mensagem: sempre mensagem controlada do sistema. */
  origem: "mensagem_controlada_sistema";
  /** O conteúdo candidato foi descartado? */
  candidatoDescartado: true;
  encaminhamento: "real_confirmado" | "real_falhou" | "simulado" | "nao_executado";
  /** Só é `true` com encaminhamento real confirmado. */
  encaminhamentoConfirmado: boolean;
  /** A conversa fica sinalizada para intervenção humana? */
  exigeIntervencao: boolean;
  registro: string;
  erro: string | null;
  /**
   * O aviso é avaliado pelo seu próprio conteúdo e pelo estado do
   * encaminhamento — nunca pela nota do conteúdo descartado.
   */
  herdaNotaDoCandidato: false;
};

/** Monta a saída controlada a partir do resultado real/simulado. */
export function saidaControladaBaixaConfianca(
  resultado: ResultadoEncaminhamento,
): SaidaControlada {
  if (resultado.tipo === "simulado") {
    return {
      aviso: AVISO_ENCAMINHAMENTO_SIMULADO,
      origem: "mensagem_controlada_sistema",
      candidatoDescartado: true,
      encaminhamento: "simulado",
      encaminhamentoConfirmado: false,
      exigeIntervencao: false,
      registro: "Encaminhamento humano simulado por baixa confiabilidade",
      erro: null,
      herdaNotaDoCandidato: false,
    };
  }
  if (resultado.tipo === "real" && resultado.confirmado === true) {
    return {
      aviso: AVISO_ENCAMINHAMENTO_HUMANO,
      origem: "mensagem_controlada_sistema",
      candidatoDescartado: true,
      encaminhamento: "real_confirmado",
      encaminhamentoConfirmado: true,
      exigeIntervencao: false,
      registro: "Encaminhamento humano realizado por baixa confiabilidade",
      erro: null,
      herdaNotaDoCandidato: false,
    };
  }
  const erro =
    (resultado.tipo === "real" ? resultado.erro : resultado.erro) ?? "encaminhamento_nao_confirmado";
  return {
    aviso: AVISO_ENCAMINHAMENTO_FALHOU,
    origem: "mensagem_controlada_sistema",
    candidatoDescartado: true,
    encaminhamento: resultado.tipo === "real" ? "real_falhou" : "nao_executado",
    encaminhamentoConfirmado: false,
    exigeIntervencao: true,
    registro: "Encaminhamento humano por baixa confiabilidade NÃO confirmado",
    erro,
    herdaNotaDoCandidato: false,
  };
}

/** O texto já é um aviso controlado desta regra? (idempotência textual) */
export function ehAvisoControlado(texto: string | null | undefined): boolean {
  const t = String(texto ?? "").trim();
  if (!t) return false;
  return (
    t === AVISO_ENCAMINHAMENTO_HUMANO ||
    t === AVISO_ENCAMINHAMENTO_FALHOU ||
    t === AVISO_ENCAMINHAMENTO_SIMULADO ||
    t.includes(AVISO_ENCAMINHAMENTO_HUMANO) ||
    t.includes(AVISO_ENCAMINHAMENTO_FALHOU) ||
    t.includes(AVISO_ENCAMINHAMENTO_SIMULADO)
  );
}
