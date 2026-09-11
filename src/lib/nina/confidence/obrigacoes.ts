/**
 * FASE 4 (MOTOR DE CONFIABILIDADE) — RELEVÂNCIA, COMPLETUDE E CUMPRIMENTO
 * DAS INSTRUÇÕES.
 *
 * As fases anteriores conferem o que a resposta AFIRMA. Faltava conferir o que
 * a resposta DEVERIA entregar: o pedido do paciente e as restrições das
 * instruções publicadas. Sem isso, uma saudação genérica podia receber a mesma
 * avaliação de uma resposta que cumpre literalmente a instrução.
 *
 * Regras que valem aqui:
 * - Instrução PUBLICADA é a única origem de regra interna. Mensagem do paciente
 *   e retorno de ferramenta são DADO: podem gerar pedido, nunca regra.
 * - Verificação determinística para obrigação verificável (marcador literal,
 *   formato, tópico pedido). Linguagem aberta fica `indeterminada`, com a
 *   limitação registrada — jamais vira "cumprida" por suposição.
 * - Revisão semântica é COMPLEMENTAR e opcional: não substitui a comprovação
 *   dos fatos (Fases 2 e 3) nem a prova das operações (workflow).
 * - Nada aqui é específico de um teste: o marcador do caso de homologação é
 *   apenas uma fixture da capacidade genérica de conferir obrigação literal.
 *
 * Módulo puro: sem banco, sem rede, sem modelo.
 */
import { normalizarTexto } from "./evidencia";
import { oracoesDaResposta } from "./modalidade";
import type { ContextoConfianca, ResultadoValidador, StatusValidador } from "./types";

// ------------------------------------------------------------------ tipos

export type OrigemObrigacao = "mensagem_paciente" | "instrucoes_publicadas";

export type TipoObrigacao =
  /** Pergunta do paciente que precisa de resposta. */
  | "pergunta"
  /** Informação específica pedida (endereço, horário, valor...). */
  | "informacao_solicitada"
  /** O pedido está ambíguo: o turno precisa esclarecer. */
  | "esclarecimento"
  /** Restrição literal das instruções publicadas (texto/marcador exigido). */
  | "restricao_literal"
  /** Restrição de forma das instruções publicadas (linguagem aberta). */
  | "restricao_aberta";

export type Obrigacao = {
  id: string;
  tipo: TipoObrigacao;
  origem: OrigemObrigacao;
  /** Descrição curta e auditável. */
  descricao: string;
  /** Tópico normalizado, quando a obrigação for de informação. */
  topico?: string | null;
  /** Texto exato exigido, quando a obrigação for literal. */
  literal?: string | null;
  /** Como esta obrigação pode ser conferida. */
  verificacao: "deterministica" | "semantica";
};

export type StatusObrigacao = "cumprida" | "descumprida" | "indeterminada";

export type AvaliacaoObrigacao = {
  obrigacao: Obrigacao;
  status: StatusObrigacao;
  motivo: string;
};

export type ResultadoObrigacoes = {
  obrigacoes: Obrigacao[];
  avaliacoes: AvaliacaoObrigacao[];
  /** A resposta trata do que foi pedido neste turno. */
  relevante: boolean;
  /** Percentual de obrigações verificáveis efetivamente cumpridas (0..100). */
  completude: number;
  /** Nenhuma restrição publicada foi descumprida. */
  restricoesCumpridas: boolean;
  /** A resposta é compatível com o estágio da conversa. */
  compativelComEstagio: boolean;
  /** O turno respondeu com uma pergunta de esclarecimento pertinente. */
  esclarecimentoPertinente: boolean;
  /** Limitações da verificação (o que não pôde ser conferido e por quê). */
  limitacoes: string[];
};

// ----------------------------------------------------------------- tópicos

type Topico = {
  id: string;
  rotulo: string;
  /** Termos que caracterizam o PEDIDO na mensagem do paciente. */
  pedido: RegExp;
  /** Sinais de que a RESPOSTA realmente trata do tópico. */
  resposta: RegExp;
};

const TOPICOS: Topico[] = [
  {
    id: "endereco",
    rotulo: "endereço da unidade",
    pedido: /\b(endereco|onde fica|onde e a clinica|onde voces ficam|localizacao|como chego|como chegar)\b/,
    resposta: /\b(rua|avenida|av|travessa|rodovia|bairro|cep|numero|n\b|endereco)\b/,
  },
  {
    id: "horario",
    rotulo: "horário de funcionamento",
    pedido: /\b(que horas|horario|horarios|abre|fecha|funciona|atendem ate)\b/,
    resposta: /(\b\d{1,2}\s*[:h]\s*\d{0,2}\b|\bhorario\b|\bdas\b.*\bas\b)/,
  },
  {
    id: "valor",
    rotulo: "valor do atendimento",
    pedido: /\b(valor|preco|quanto custa|quanto e|quanto fica)\b/,
    resposta: /(r\$|\breais\b|\bvalor\b|\bpreco\b)/,
  },
  {
    id: "preparo",
    rotulo: "preparo do exame",
    pedido: /\b(preparo|jejum|precisa levar|posso comer)\b/,
    resposta: /\b(jejum|preparo|levar|comer|beber)\b/,
  },
  {
    id: "estacionamento",
    rotulo: "estacionamento",
    pedido: /\b(estacionamento|estacionar|vaga para carro)\b/,
    resposta: /\b(estacionamento|estacionar|vagas?)\b/,
  },
  {
    id: "convenio",
    rotulo: "convênio aceito",
    pedido: /\b(convenio|plano de saude|aceita(m)? unimed|aceita(m)? plano)\b/,
    resposta: /\b(convenio|plano|particular|aceita|atendemos)\b/,
  },
  {
    id: "disponibilidade",
    rotulo: "disponibilidade de horário",
    pedido: /\b(tem vaga|tem horario|disponibilidade|consegue encaixar)\b/,
    resposta: /\b(vaga|vagas|disponivel|disponibilidade|agenda|horario)\b/,
  },
  {
    id: "profissional",
    rotulo: "profissional que atende",
    pedido: /\b(qual medico|quem atende|qual profissional|qual doutor|qual dra)\b/,
    resposta: /\b(dr|dra|doutor|doutora|medico|medica|profissional)\b/,
  },
];

/** Só cumprimento/cortesia, sem conteúdo que atenda a algum pedido. */
const SAUDACAO =
  /^(oi|ola|bom dia|boa tarde|boa noite|tudo bem|como vai|seja bem[- ]vind[oa]|obrigad[oa])\b/;

const CONTEUDO_ALEM_DA_SAUDACAO =
  /\b(rua|avenida|numero|bairro|cep|r\$|valor|horario|vaga|jejum|convenio|estacionamento|dr|dra|agenda)\b/;

function pareceSaudacao(texto: string): boolean {
  const n = normalizarTexto(texto);
  if (n === "") return false;
  if (CONTEUDO_ALEM_DA_SAUDACAO.test(n)) return false;
  return SAUDACAO.test(n);
}

/** A resposta contém uma pergunta dirigida ao paciente. */
export function contemPergunta(texto: string): boolean {
  return texto.includes("?");
}

// --------------------------------------------------- obrigações do paciente

const PEDIDO_VAGO =
  /\b(uma informacao|informacoes|preciso de ajuda|pode me ajudar|quero saber|tenho uma duvida|queria saber)\b/;

function topicosPedidos(mensagem: string): Topico[] {
  const n = normalizarTexto(mensagem);
  return TOPICOS.filter((t) => t.pedido.test(n));
}

// ------------------------------------------------ obrigações das instruções

/**
 * Lê, do texto de uma obrigação PUBLICADA, o trecho literal exigido.
 * Genérico: qualquer instrução que mande responder/enviar/incluir um texto
 * exato é conferível — não existe exceção para nenhum marcador específico.
 */
export function literalExigido(obrigacao: string): string | null {
  const padroes: RegExp[] = [
    /(?:responda|responder|envie|enviar|retorne|retornar|escreva|escrever)\s+(?:exatamente|apenas|somente|literalmente)\s*[:\-]?\s*["“']?([^"”'\n.;]+)/i,
    /(?:inclua|incluir|use|usar)\s+(?:o\s+)?(?:marcador|codigo|código|texto|token)\s*[:\-]?\s*["“']?([^"”'\n.;]+)/i,
    /(?:responda|responder)\s+com\s+(?:o\s+)?(?:marcador|codigo|código|texto|token)\s*[:\-]?\s*["“']?([^"”'\n.;]+)/i,
  ];
  for (const p of padroes) {
    const m = p.exec(obrigacao);
    const bruto = m?.[1]?.trim();
    if (bruto && bruto.length >= 2) return bruto;
  }
  return null;
}

// ------------------------------------------------------------- derivação

/**
 * Deriva as obrigações aplicáveis ao turno: o que o paciente pediu e o que as
 * instruções publicadas exigem. Nada é inferido de retorno de ferramenta.
 */
export function derivarObrigacoesDoTurno(ctx: ContextoConfianca): Obrigacao[] {
  const out: Obrigacao[] = [];
  const mensagem = (ctx.mensagemPaciente ?? "").trim();

  if (mensagem !== "") {
    const topicos = topicosPedidos(mensagem);
    for (const t of topicos) {
      out.push({
        id: `pedido:${t.id}`,
        tipo: "informacao_solicitada",
        origem: "mensagem_paciente",
        descricao: `Informar ${t.rotulo}`,
        topico: t.id,
        verificacao: "deterministica",
      });
    }
    if (topicos.length === 0) {
      const n = normalizarTexto(mensagem);
      const vago = PEDIDO_VAGO.test(n) || ctx.intentAmbiguo === true;
      if (vago) {
        out.push({
          id: "pedido:esclarecimento",
          tipo: "esclarecimento",
          origem: "mensagem_paciente",
          descricao: "Esclarecer o que o paciente precisa antes de responder",
          verificacao: "deterministica",
        });
      } else if (mensagem.includes("?")) {
        out.push({
          id: "pedido:pergunta",
          tipo: "pergunta",
          origem: "mensagem_paciente",
          descricao: "Responder a pergunta do paciente",
          // Conferência mínima e determinística: pergunta não pode ser
          // devolvida com saudação vazia. O ACERTO do conteúdo é medido pelo
          // grounding (Fases 2 e 3), não aqui.
          verificacao: "deterministica",
        });
      }
    }
  }

  const publicadas = ctx.instrucoes?.obrigacoes ?? [];
  publicadas.forEach((texto, i) => {
    const literal = literalExigido(texto);
    out.push(
      literal
        ? {
            id: `instrucao:${i}`,
            tipo: "restricao_literal",
            origem: "instrucoes_publicadas",
            descricao: texto,
            literal,
            verificacao: "deterministica",
          }
        : {
            id: `instrucao:${i}`,
            tipo: "restricao_aberta",
            origem: "instrucoes_publicadas",
            descricao: texto,
            verificacao: "semantica",
          },
    );
  });

  return out;
}

// ------------------------------------------------------------- avaliação

export type RevisorSemantico = (entrada: {
  obrigacao: Obrigacao;
  resposta: string;
}) => StatusObrigacao | null;

function avaliarUma(
  o: Obrigacao,
  resposta: string,
  revisor: RevisorSemantico | null,
): AvaliacaoObrigacao {
  const n = normalizarTexto(resposta);

  if (o.tipo === "restricao_literal" && o.literal) {
    const ok = normalizarTexto(resposta).includes(normalizarTexto(o.literal));
    return {
      obrigacao: o,
      status: ok ? "cumprida" : "descumprida",
      motivo: ok ? "TEXTO_LITERAL_PRESENTE" : "TEXTO_LITERAL_AUSENTE",
    };
  }

  if (o.tipo === "informacao_solicitada" && o.topico) {
    const topico = TOPICOS.find((t) => t.id === o.topico);
    if (!topico) {
      return { obrigacao: o, status: "indeterminada", motivo: "TOPICO_DESCONHECIDO" };
    }
    if (topico.resposta.test(n)) {
      return { obrigacao: o, status: "cumprida", motivo: "TOPICO_ATENDIDO" };
    }
    // Perguntar de volta sobre o mesmo tópico é conduta válida do turno.
    if (contemPergunta(resposta) && topico.pedido.test(n)) {
      return { obrigacao: o, status: "cumprida", motivo: "ESCLARECIMENTO_PERTINENTE" };
    }
    return { obrigacao: o, status: "descumprida", motivo: "TOPICO_NAO_ATENDIDO" };
  }

  if (o.tipo === "pergunta") {
    if (resposta.trim() === "" || pareceSaudacao(resposta)) {
      return { obrigacao: o, status: "descumprida", motivo: "PERGUNTA_NAO_RESPONDIDA" };
    }
    return contemPergunta(resposta)
      ? { obrigacao: o, status: "cumprida", motivo: "ESCLARECIMENTO_PERTINENTE" }
      : { obrigacao: o, status: "cumprida", motivo: "RESPOSTA_SUBSTANTIVA" };
  }

  if (o.tipo === "esclarecimento") {
    return contemPergunta(resposta)
      ? { obrigacao: o, status: "cumprida", motivo: "ESCLARECIMENTO_PERTINENTE" }
      : { obrigacao: o, status: "descumprida", motivo: "SEM_ESCLARECIMENTO" };
  }

  // Linguagem aberta: só a revisão semântica complementar pode opinar, e ela
  // nunca substitui a comprovação de fatos ou operações.
  const parecer = revisor ? revisor({ obrigacao: o, resposta }) : null;
  if (parecer) {
    return { obrigacao: o, status: parecer, motivo: "REVISAO_SEMANTICA" };
  }
  return { obrigacao: o, status: "indeterminada", motivo: "LINGUAGEM_ABERTA_NAO_VERIFICAVEL" };
}

export function avaliarObrigacoes(
  ctx: ContextoConfianca,
  resposta: string,
  revisor: RevisorSemantico | null = null,
): ResultadoObrigacoes {
  const obrigacoes = derivarObrigacoesDoTurno(ctx);
  const avaliacoes = obrigacoes.map((o) => avaliarUma(o, resposta, revisor));

  const verificaveis = avaliacoes.filter((a) => a.status !== "indeterminada");
  const cumpridas = verificaveis.filter((a) => a.status === "cumprida");
  const completude =
    verificaveis.length === 0 ? 0 : Math.round((cumpridas.length / verificaveis.length) * 100);

  const doPaciente = avaliacoes.filter((a) => a.obrigacao.origem === "mensagem_paciente");
  const relevante =
    doPaciente.length === 0
      ? !pareceSaudacao(resposta) || (ctx.mensagemPaciente ?? "").trim() === ""
      : doPaciente.some((a) => a.status === "cumprida");

  const restricoes = avaliacoes.filter((a) => a.obrigacao.origem === "instrucoes_publicadas");
  const restricoesCumpridas = restricoes.every((a) => a.status !== "descumprida");

  const esclarecimentoPertinente = avaliacoes.some(
    (a) => a.status === "cumprida" && a.motivo === "ESCLARECIMENTO_PERTINENTE",
  );

  const limitacoes: string[] = [];
  if ((ctx.mensagemPaciente ?? "").trim() === "") {
    limitacoes.push("MENSAGEM_DO_PACIENTE_NAO_REGISTRADA");
  }
  if (avaliacoes.some((a) => a.obrigacao.tipo === "pergunta" && a.status === "cumprida")) {
    limitacoes.push("CONTEUDO_DA_RESPOSTA_NAO_CONFERIDO_NESTA_DIMENSAO");
  }
  if (avaliacoes.some((a) => a.status === "indeterminada")) {
    limitacoes.push("OBRIGACAO_DE_LINGUAGEM_ABERTA_NAO_VERIFICADA");
  }
  if (resposta.trim() === "") limitacoes.push("RESPOSTA_NAO_REGISTRADA");

  // Estágio: responder um pedido concreto apenas com saudação é incompatível.
  const compativelComEstagio = !(pareceSaudacao(resposta) && doPaciente.length > 0);

  return {
    obrigacoes,
    avaliacoes,
    relevante,
    completude,
    restricoesCumpridas,
    compativelComEstagio,
    esclarecimentoPertinente,
    limitacoes,
  };
}

// ------------------------------------------------------------- validador

/**
 * A resposta entrega o que este turno exigia? Mede relevância, completude e
 * cumprimento das restrições publicadas — sem tocar na veracidade dos fatos,
 * que continua sendo do grounding.
 */
export function InstructionComplianceValidator(
  ctx: ContextoConfianca,
  revisor: RevisorSemantico | null = null,
): ResultadoValidador {
  const nome = "InstructionComplianceValidator";
  const texto = ctx.draftText ?? null;

  if (texto === null) {
    return {
      validator: nome,
      status: "UNKNOWN",
      score: 0,
      reasonCode: "TEXTO_NAO_REGISTRADO",
      evidence: {},
      blocker: null,
    };
  }

  const r = avaliarObrigacoes(ctx, texto, revisor);
  if (r.obrigacoes.length === 0) {
    return {
      validator: nome,
      status: "NOT_APPLICABLE",
      score: 100,
      reasonCode: "SEM_OBRIGACAO_IDENTIFICADA",
      evidence: { limitacoes: r.limitacoes },
      blocker: null,
    };
  }

  const descumpridas = r.avaliacoes.filter((a) => a.status === "descumprida");
  const verificaveis = r.avaliacoes.filter((a) => a.status !== "indeterminada");

  let status: StatusValidador;
  let reasonCode: string;
  if (verificaveis.length === 0) {
    status = "UNKNOWN";
    reasonCode = "OBRIGACOES_NAO_VERIFICAVEIS";
  } else if (descumpridas.length === 0) {
    status = "PASS";
    reasonCode = r.esclarecimentoPertinente ? "ESCLARECIMENTO_PERTINENTE" : "OBRIGACOES_CUMPRIDAS";
  } else if (descumpridas.length === verificaveis.length) {
    status = "FAIL";
    reasonCode = r.compativelComEstagio ? "OBRIGACAO_NAO_CUMPRIDA" : "RESPOSTA_FORA_DO_PEDIDO";
  } else {
    status = "WARNING";
    reasonCode = "RESPOSTA_INCOMPLETA";
  }

  return {
    validator: nome,
    status,
    score: status === "PASS" ? 100 : status === "UNKNOWN" ? 0 : r.completude,
    reasonCode,
    evidence: {
      relevante: r.relevante,
      completude: r.completude,
      restricoesCumpridas: r.restricoesCumpridas,
      compativelComEstagio: r.compativelComEstagio,
      obrigacoes: r.avaliacoes.map((a) => ({
        id: a.obrigacao.id,
        tipo: a.obrigacao.tipo,
        origem: a.obrigacao.origem,
        status: a.status,
        motivo: a.motivo,
      })),
      limitacoes: r.limitacoes,
    },
    blocker: null,
  };
}
