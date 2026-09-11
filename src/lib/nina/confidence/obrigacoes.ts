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
import { classificarNatureza, oracoesDaResposta } from "./modalidade";
import {
  exigenciaLiteral,
  regraSeAplica,
  regrasValidasParaPublicacao,
  type CategoriaProibida,
  type OperadorLiteral,
  type RegraPublicada,
} from "./regras-publicadas";
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
  | "restricao_aberta"
  /** Proibição de conteúdo declarada nas instruções publicadas. */
  | "restricao_proibicao"
  /** Regra publicada que NÃO pôde ser interpretada com segurança. */
  | "restricao_nao_interpretada";

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
  /** Operador da exigência literal: igualdade integral ou presença do trecho. */
  operador?: OperadorLiteral | null;
  /** Categorias proibidas, quando a obrigação for proibição de conteúdo. */
  proibicoes?: CategoriaProibida[];
  /** Texto literal exigido no mesmo turno (para conferir "nada além disso"). */
  literalEsperado?: string | null;
  /** Regra publicada de origem: condição, ambiente, prioridade, versão, hash. */
  regra?: RegraPublicada;
  /** Como esta obrigação pode ser conferida. */
  verificacao: "deterministica" | "semantica";
};

/**
 * Estados distintos e auditáveis de UMA obrigação:
 * - `cumprida` / `descumprida`: conferência determinística concluída;
 * - `nao_aplicavel`: a condição publicada não foi acionada neste turno;
 * - `indeterminada`: não foi possível conferir (linguagem aberta sem revisão,
 *   regra não interpretada). NUNCA é lida como cumprimento.
 */
export type StatusObrigacao =
  | "cumprida"
  | "descumprida"
  | "nao_aplicavel"
  | "indeterminada";

/** Estado agregado das restrições publicadas neste turno. */
export type EstadoRestricoes =
  | "cumpridas"
  | "descumpridas"
  | "indeterminadas"
  | "nenhuma_regra_publicada"
  | "nenhuma_regra_aplicavel"
  | "falha_na_interpretacao";

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
  /**
   * `true` só quando existe restrição publicada CONFERIDA e cumprida.
   * `null` quando não há regra aplicável ou nada pôde ser conferido — ausência
   * de regra nunca é aprovação.
   */
  restricoesCumpridas: boolean | null;
  /** Estado agregado e auditável das restrições publicadas. */
  estadoRestricoes: EstadoRestricoes;
  /** Regras da publicação vigente cuja condição não foi acionada. */
  regrasNaoAplicaveis: number;
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

/** Mesma lista, em qualquer posição — usada para conferir saudação PROIBIDA. */
const SAUDACAO_EM_QUALQUER_POSICAO =
  /(^|[\s.,;:!?"'()-])(oi|ola|bom dia|boa tarde|boa noite|tudo bem|como vai|seja bem[- ]vind[oa])\b/;

/**
 * Única normalização permitida na conferência literal: colapso de espaços em
 * branco e remoção de espaços nas pontas. Caixa, acentuação e pontuação são
 * preservadas — correspondência literal é literal.
 */
function espacos(t: string): string {
  return t.replace(/\s+/g, " ").trim();
}

const CONTEUDO_ALEM_DA_SAUDACAO =
  /\b(rua|avenida|numero|bairro|cep|r\$|valor|horario|vaga|jejum|convenio|estacionamento|dr|dra|agenda)\b/;

function pareceSaudacao(texto: string): boolean {
  const n = normalizarTexto(texto);
  if (n === "") return false;
  if (CONTEUDO_ALEM_DA_SAUDACAO.test(n)) return false;
  return SAUDACAO.test(n);
}

/** Sinais de que a resposta está buscando esclarecer, e não entregando fato. */
const PEDE_ESCLARECIMENTO =
  /\b(qual|quais|voce (?:quer|prefere|precisa)|me diga|me informe|poderia informar|depende|para qual|sobre qual)\b/;

/** A resposta contém uma pergunta dirigida ao paciente. */
export function contemPergunta(texto: string): boolean {
  return texto.includes("?");
}

/** A resposta busca esclarecer o pedido (pergunta ou pedido de detalhe). */
export function buscaEsclarecer(texto: string): boolean {
  return contemPergunta(texto) || PEDE_ESCLARECIMENTO.test(normalizarTexto(texto));
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
 * Leitura do literal exigido: agora mora na representação das regras
 * publicadas e é reexportada aqui por compatibilidade.
 */
export { literalExigido } from "./regras-publicadas";

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

  // Representação verificável da publicação, quando o turno a carrega.
  const regras = regrasValidasParaPublicacao(ctx.instrucoes?.regras, ctx.instrucoes?.hash).filter(
    (r) =>
      regraSeAplica(r, {
        mensagemPaciente: ctx.mensagemPaciente ?? null,
        ambiente: ctx.businessContext?.ambiente ?? null,
      }),
  );

  // Quando o turno traz a representação estruturada, é ela que vale — mesmo
  // vazia (regra fora da condição/ambiente, ou representação desatualizada).
  if (Array.isArray(ctx.instrucoes?.regras)) {
    const regraLiteralDoTurno = regras.find((r) => r.verificacao === "literal");
    const literalDoTurno = regraLiteralDoTurno?.literal ?? null;
    const operadorDoTurno = regraLiteralDoTurno?.operador ?? null;
    for (const r of regras) {
      const base = {
        id: `instrucao:${r.ordem}`,
        origem: "instrucoes_publicadas" as const,
        descricao: r.descricao,
        regra: r,
      };
      if (r.verificacao === "literal" && r.literal) {
        out.push({
          ...base,
          tipo: "restricao_literal",
          literal: r.literal,
          operador: r.operador ?? "igualdade",
          verificacao: "deterministica",
        });
      } else if (r.verificacao === "proibicao_de_conteudo") {
        out.push({
          ...base,
          tipo: "restricao_proibicao",
          proibicoes: r.proibicoes,
          literalEsperado: literalDoTurno,
          operador: operadorDoTurno,
          verificacao: "deterministica",
        });
      } else if (r.verificacao === "nao_interpretada") {
        out.push({ ...base, tipo: "restricao_nao_interpretada", verificacao: "semantica" });
      } else {
        out.push({ ...base, tipo: "restricao_aberta", verificacao: "semantica" });
      }
    }
    return out;
  }

  // Compatibilidade: turnos que só carregam obrigações em texto simples.
  const publicadas = ctx.instrucoes?.obrigacoes ?? [];
  publicadas.forEach((texto, i) => {
    const exigencia = exigenciaLiteral(texto);
    out.push(
      exigencia
        ? {
            id: `instrucao:${i}`,
            tipo: "restricao_literal",
            origem: "instrucoes_publicadas",
            descricao: texto,
            literal: exigencia.literal,
            operador: exigencia.operador,
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

/**
 * Revisão semântica COMPLEMENTAR para regra aberta. Recebe contexto suficiente
 * para avaliar a condição da regra (mensagem do paciente, ambiente e o trecho
 * publicado). Ausência de revisão NÃO aprova nada: fica `indeterminada`.
 */
export type RevisorSemantico = (entrada: {
  obrigacao: Obrigacao;
  resposta: string;
  mensagemPaciente?: string | null;
  ambiente?: string | null;
  trechoPublicado?: string | null;
}) => StatusObrigacao | null;

/**
 * Reconhecer que não tem a informação (e encaminhar) é conduta CORRETA da
 * Nina — nunca descumprimento. Quem decide o desfecho é o handoff.
 */
export function reconheceAusencia(texto: string): boolean {
  return oracoesDaResposta(texto).some((o) => {
    const n = classificarNatureza(o.texto);
    return n === "desconhecido_declarado" || n === "recusa_ou_limitacao" || n === "falha_declarada";
  });
}

const DESPEDIDA =
  /\b(ate logo|ate mais|ate breve|abraco|qualquer duvida|estamos a disposicao|fico a disposicao|tenha um[a]? (bom|boa))\b/;

/**
 * Conferência determinística das categorias proibidas pela publicação.
 * "explicação" e "qualquer outro texto" só são conferíveis quando a mesma
 * publicação exige um texto literal — aí a resposta tem de ser só ele.
 */
export function categoriasVioladas(
  resposta: string,
  proibicoes: readonly CategoriaProibida[],
  literalEsperado: string | null,
  operadorEsperado: OperadorLiteral | null = "igualdade",
): CategoriaProibida[] {
  const bruto = resposta.trim();
  const n = normalizarTexto(resposta);
  // "Não acrescente": qualquer conteúdo além do exigido é excesso.
  // - igualdade: a resposta inteira tem de ser o literal;
  // - inclusão: o que sobra depois de retirar o literal não pode ter conteúdo.
  const excedeLiteral =
    literalEsperado === null
      ? false
      : operadorEsperado === "inclusao"
        ? espacos(bruto).replace(espacos(literalEsperado), "").replace(/[\s.,;:!]/g, "") !== ""
        : espacos(bruto) !== espacos(literalEsperado);

  const violadas: CategoriaProibida[] = [];
  for (const c of proibicoes) {
    // Saudação PROIBIDA é conferida em qualquer posição: "X. Olá!" também viola.
    if (c === "saudacao" && SAUDACAO_EM_QUALQUER_POSICAO.test(n)) violadas.push(c);
    if (c === "emoji" && /\p{Extended_Pictographic}/u.test(bruto)) violadas.push(c);
    if (c === "pergunta" && bruto.includes("?")) violadas.push(c);
    if (c === "despedida" && DESPEDIDA.test(n)) violadas.push(c);
    if ((c === "explicacao" || c === "texto_adicional") && excedeLiteral) violadas.push(c);
  }
  return [...new Set(violadas)];
}

function avaliarUma(
  o: Obrigacao,
  resposta: string,
  revisor: RevisorSemantico | null,
  contexto?: { mensagemPaciente?: string | null; ambiente?: string | null },
): AvaliacaoObrigacao {
  const n = normalizarTexto(resposta);

  if (o.tipo === "restricao_literal" && o.literal) {
    const operador: OperadorLiteral = o.operador ?? "igualdade";
    if (operador === "inclusao") {
      const ok = espacos(resposta).includes(espacos(o.literal));
      return {
        obrigacao: o,
        status: ok ? "cumprida" : "descumprida",
        motivo: ok ? "TEXTO_LITERAL_PRESENTE" : "TEXTO_LITERAL_AUSENTE",
      };
    }
    // "Responda EXATAMENTE": igualdade do conteúdo integral, com caixa e
    // acentuação preservadas. Presença não basta.
    const ok = espacos(resposta) === espacos(o.literal);
    return {
      obrigacao: o,
      status: ok ? "cumprida" : "descumprida",
      motivo: ok ? "TEXTO_LITERAL_EXATO" : "TEXTO_LITERAL_DIVERGENTE",
    };
  }

  // Regra publicada não interpretada NUNCA vira cumprimento.
  if (o.tipo === "restricao_nao_interpretada") {
    return { obrigacao: o, status: "indeterminada", motivo: "REGRA_NAO_INTERPRETADA" };
  }

  if (o.tipo === "restricao_proibicao") {
    const violadas = categoriasVioladas(
      resposta,
      o.proibicoes ?? [],
      o.literalEsperado ?? null,
      o.operador ?? "igualdade",
    );
    if (violadas.length > 0) {
      return {
        obrigacao: o,
        status: "descumprida",
        motivo: `CONTEUDO_PROIBIDO_PRESENTE:${violadas.join(",")}`,
      };
    }
    const conferiveis = (o.proibicoes ?? []).filter(
      (c) => c !== "texto_adicional" && c !== "explicacao",
    );
    if (conferiveis.length === 0 && !o.literalEsperado) {
      return { obrigacao: o, status: "indeterminada", motivo: "PROIBICAO_NAO_VERIFICAVEL" };
    }
    return { obrigacao: o, status: "cumprida", motivo: "NENHUM_CONTEUDO_PROIBIDO" };
  }

  if (o.tipo === "informacao_solicitada" && o.topico) {
    const topico = TOPICOS.find((t) => t.id === o.topico);
    if (!topico) {
      return { obrigacao: o, status: "indeterminada", motivo: "TOPICO_DESCONHECIDO" };
    }
    if (topico.resposta.test(n)) {
      return { obrigacao: o, status: "cumprida", motivo: "TOPICO_ATENDIDO" };
    }
    if (reconheceAusencia(resposta)) {
      return { obrigacao: o, status: "cumprida", motivo: "AUSENCIA_RECONHECIDA" };
    }
    // Perguntar de volta sobre o mesmo tópico é conduta válida do turno.
    if (buscaEsclarecer(resposta) && topico.pedido.test(n)) {
      return { obrigacao: o, status: "cumprida", motivo: "ESCLARECIMENTO_PERTINENTE" };
    }
    return { obrigacao: o, status: "descumprida", motivo: "TOPICO_NAO_ATENDIDO" };
  }

  if (o.tipo === "pergunta") {
    if (resposta.trim() === "" || pareceSaudacao(resposta)) {
      return { obrigacao: o, status: "descumprida", motivo: "PERGUNTA_NAO_RESPONDIDA" };
    }
    if (reconheceAusencia(resposta)) {
      return { obrigacao: o, status: "cumprida", motivo: "AUSENCIA_RECONHECIDA" };
    }
    return contemPergunta(resposta)
      ? { obrigacao: o, status: "cumprida", motivo: "ESCLARECIMENTO_PERTINENTE" }
      : { obrigacao: o, status: "cumprida", motivo: "RESPOSTA_SUBSTANTIVA" };
  }

  if (o.tipo === "esclarecimento") {
    return buscaEsclarecer(resposta)
      ? { obrigacao: o, status: "cumprida", motivo: "ESCLARECIMENTO_PERTINENTE" }
      : { obrigacao: o, status: "descumprida", motivo: "SEM_ESCLARECIMENTO" };
  }

  // Linguagem aberta: só a revisão semântica complementar pode opinar, e ela
  // nunca substitui a comprovação de fatos ou operações. Sem revisão, o estado
  // é `indeterminada` — jamais aprovação presumida.
  const parecer = revisor
    ? revisor({
        obrigacao: o,
        resposta,
        mensagemPaciente: contexto?.mensagemPaciente ?? null,
        ambiente: contexto?.ambiente ?? null,
        trechoPublicado: o.regra?.trecho ?? null,
      })
    : null;
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
  const avaliacoes = obrigacoes.map((o) =>
    avaliarUma(o, resposta, revisor, {
      mensagemPaciente: ctx.mensagemPaciente ?? null,
      ambiente: ctx.businessContext?.ambiente ?? null,
    }),
  );

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

  // Regras da publicação vigente cuja condição NÃO foi acionada neste turno.
  const validas = regrasValidasParaPublicacao(ctx.instrucoes?.regras, ctx.instrucoes?.hash);
  const aplicaveis = validas.filter((r) =>
    regraSeAplica(r, {
      mensagemPaciente: ctx.mensagemPaciente ?? null,
      ambiente: ctx.businessContext?.ambiente ?? null,
    }),
  );
  const regrasNaoAplicaveis = validas.length - aplicaveis.length;
  const falhaDeInterpretacao =
    (ctx.instrucoes?.regras?.length ?? 0) > 0 && validas.length === 0
      ? true
      : restricoes.length > 0 && restricoes.every((a) => a.motivo === "REGRA_NAO_INTERPRETADA");

  // Ausência de regra NUNCA é aprovação: só `cumpridas` produz `true`.
  const estadoRestricoes: EstadoRestricoes = falhaDeInterpretacao
    ? "falha_na_interpretacao"
    : restricoes.some((a) => a.status === "descumprida")
      ? "descumpridas"
      : restricoes.some((a) => a.status === "cumprida")
        ? "cumpridas"
        : restricoes.length > 0
          ? "indeterminadas"
          : validas.length === 0
            ? "nenhuma_regra_publicada"
            : "nenhuma_regra_aplicavel";
  const restricoesCumpridas: boolean | null =
    estadoRestricoes === "cumpridas" ? true : estadoRestricoes === "descumpridas" ? false : null;

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
  if (avaliacoes.some((a) => a.motivo === "REGRA_NAO_INTERPRETADA")) {
    limitacoes.push("REGRA_PUBLICADA_NAO_INTERPRETADA");
  }
  const regrasDoTurno = ctx.instrucoes?.regras;
  if (
    regrasDoTurno &&
    regrasDoTurno.length > 0 &&
    regrasValidasParaPublicacao(regrasDoTurno, ctx.instrucoes?.hash).length === 0
  ) {
    limitacoes.push("REPRESENTACAO_DAS_REGRAS_DESATUALIZADA");
  }
  // Limitações declaradas pela própria publicação (o que ela não garante).
  for (const l of ctx.instrucoes?.limitacoes ?? []) if (!limitacoes.includes(l)) limitacoes.push(l);
  if (resposta.trim() === "") limitacoes.push("RESPOSTA_NAO_REGISTRADA");

  // Estágio: responder um pedido concreto apenas com saudação é incompatível.
  const compativelComEstagio = !(pareceSaudacao(resposta) && doPaciente.length > 0);

  return {
    obrigacoes,
    avaliacoes,
    relevante,
    completude,
    restricoesCumpridas,
    estadoRestricoes,
    regrasNaoAplicaveis,
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

  // Falha ao interpretar as regras publicadas não é cumprimento: fica UNKNOWN.
  if (r.estadoRestricoes === "falha_na_interpretacao") {
    return {
      validator: nome,
      status: "UNKNOWN",
      score: 0,
      reasonCode: "FALHA_NA_INTERPRETACAO_DAS_REGRAS",
      evidence: {
        estadoRestricoes: r.estadoRestricoes,
        regrasNaoAplicaveis: r.regrasNaoAplicaveis,
        limitacoes: r.limitacoes,
      },
      blocker: null,
    };
  }

  if (r.obrigacoes.length === 0) {
    return {
      validator: nome,
      status: "NOT_APPLICABLE",
      score: 100,
      reasonCode:
        r.estadoRestricoes === "nenhuma_regra_aplicavel"
          ? "NENHUMA_REGRA_APLICAVEL"
          : "SEM_OBRIGACAO_IDENTIFICADA",
      evidence: {
        estadoRestricoes: r.estadoRestricoes,
        regrasNaoAplicaveis: r.regrasNaoAplicaveis,
        limitacoes: r.limitacoes,
      },
      blocker: null,
    };
  }

  // Intenção ambígua NÃO é resposta inadequada: enquanto o pedido não estiver
  // claro, a obrigação vinda da mensagem fica PENDENTE e quem decide é a
  // dimensão de ambiguidade. Restrição publicada continua valendo sempre.
  const ambiguo = ctx.intentAmbiguo === true;
  const pendentes = ambiguo
    ? r.avaliacoes.filter(
        (a) => a.obrigacao.origem === "mensagem_paciente" && a.status === "descumprida",
      )
    : [];
  const consideradas = r.avaliacoes.filter((a) => !pendentes.includes(a));
  const descumpridas = consideradas.filter((a) => a.status === "descumprida");
  const verificaveis = consideradas.filter((a) => a.status !== "indeterminada");

  let status: StatusValidador;
  let reasonCode: string;
  if (verificaveis.length === 0 && pendentes.length > 0) {
    status = "PENDING";
    reasonCode = "AMBIGUIDADE_A_RESOLVER";
  } else if (verificaveis.length === 0) {
    status = "UNKNOWN";
    reasonCode = "OBRIGACOES_NAO_VERIFICAVEIS";
  } else if (descumpridas.length === 0 && r.estadoRestricoes === "indeterminadas") {
    // Existe regra publicada aplicável que não pôde ser conferida: não aprova.
    status = "UNKNOWN";
    reasonCode = "RESTRICAO_PUBLICADA_NAO_VERIFICADA";
  } else if (descumpridas.length === 0) {
    status = "PASS";
    reasonCode = r.esclarecimentoPertinente ? "ESCLARECIMENTO_PERTINENTE" : "OBRIGACOES_CUMPRIDAS";
  } else if (descumpridas.some((a) => a.obrigacao.origem === "instrucoes_publicadas")) {
    // Violação de regra publicada é sempre falha, mesmo com esclarecimento
    // pertinente ou fatos corretos no restante da resposta.
    status = "FAIL";
    reasonCode = "RESTRICAO_PUBLICADA_DESCUMPRIDA";
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
    score:
      status === "PASS" || status === "PENDING"
        ? 100
        : status === "UNKNOWN"
          ? 0
          : r.completude,
    reasonCode,
    evidence: {
      relevante: r.relevante,
      completude: r.completude,
      restricoesCumpridas: r.restricoesCumpridas,
      estadoRestricoes: r.estadoRestricoes,
      regrasNaoAplicaveis: r.regrasNaoAplicaveis,
      compativelComEstagio: r.compativelComEstagio,
      obrigacoes: r.avaliacoes.map((a) => ({
        id: a.obrigacao.id,
        tipo: a.obrigacao.tipo,
        origem: a.obrigacao.origem,
        status: a.status,
        motivo: a.motivo,
      })),
      limitacoes: r.limitacoes,
      pendentesPorAmbiguidade: pendentes.map((a) => a.obrigacao.id),
    },
    blocker: null,
  };
}
