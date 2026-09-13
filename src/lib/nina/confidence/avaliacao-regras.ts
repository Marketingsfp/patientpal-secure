/**
 * FASE 2 — AVALIAÇÃO CONTEXTUAL DE CADA REGRA PUBLICADA.
 *
 * Consome o contrato da Fase 1 (regras com ID, condição compilada, momento,
 * componente) e o contexto canônico do turno, e devolve UM resultado por
 * regra, com aplicabilidade, estado, motivo, trecho, evidência e versão.
 *
 * Princípios inegociáveis desta camada:
 * - Condição comprovadamente falsa vira NOT_APPLICABLE. Condição ou obrigação
 *   indeterminada permanece UNKNOWN — nunca vira cumprimento nem falha.
 * - PENDING é coleta legítima ANTES da ação, nunca prova essencial ausente
 *   depois que a ação foi anunciada.
 * - Guarda posterior à classificação (CONF-02 e equivalentes) não entra na
 *   média do candidato: é conferida no fluxo de saída.
 * - Falha técnica de verificador não vira WARNING com nota 50: vira UNKNOWN
 *   com `falhaTecnica`, sem inventar aprovação nem falha factual.
 * - Uma regra indeterminada não apaga o resultado das outras: cada regra é
 *   preservada individualmente para a conta da Fase 3.
 * - Linguagem tem avaliação própria. Identidade e atendimento ao pedido NUNCA
 *   são movidos para "estilo".
 *
 * Módulo puro: sem banco, sem rede, sem modelo (o revisor semântico é
 * injetado por quem chama).
 */
import { avaliarAplicabilidade, type CategoriaContrato, type ContratoRegras, type MomentoAplicacao, type RegraContrato, type ResultadoCondicao } from "./contrato-regras";
import { categoriasVioladas } from "./obrigacoes";
import { normalizarTexto } from "./evidencia";
import {
  estadoAplicabilidadeDoContexto,
  type AfirmacaoCanonica,
  type ContextoCanonico,
} from "./contexto-canonico";

export type StatusRegra = "PASS" | "FAIL" | "UNKNOWN" | "NOT_APPLICABLE" | "PENDING";

export type ResultadoRegra = {
  identificador: string | null;
  titulo: string | null;
  categoria: CategoriaContrato;
  momento: MomentoAplicacao;
  componente: RegraContrato["componente"];
  aplicabilidade: ResultadoCondicao;
  /** Como a aplicabilidade foi decidida (condições e sinais lidos). */
  evidenciaCondicao: string;
  status: StatusRegra;
  /** 0..100 quando há conferência; `null` quando não há o que pontuar. */
  nota: number | null;
  motivo: string;
  trechoAvaliado: string | null;
  evidencia: string[];
  /** Exceção/timeout/retorno inválido do verificador (não é falha da resposta). */
  falhaTecnica: boolean;
  /** Entra na conta do candidato (guarda posterior fica de fora). */
  contaNoCandidato: boolean;
  versao: string | null;
  versaoId: string | null;
  hash: string | null;
  hashRegra: string;
};

export type AgregadoGrupo = {
  total: number;
  aplicaveis: number;
  pass: number;
  fail: number;
  unknown: number;
  naoAplicavel: number;
  pending: number;
  /** Aplicáveis com conferência concluída / aplicáveis. */
  cobertura: number;
  /** Média das notas conferidas (0..100) ou `null` quando não houve conferência. */
  nota: number | null;
};

export type AvaliacaoContrato = {
  resultados: ResultadoRegra[];
  /** Guardas posteriores à classificação, fora da média do candidato. */
  guardasPosteriores: ResultadoRegra[];
  porGrupo: Record<CategoriaContrato, AgregadoGrupo>;
  falhasTecnicas: number;
  /** Alguma exigência essencial aplicável foi comprovadamente descumprida. */
  essencialDescumprida: boolean;
  /** Alguma exigência essencial aplicável ficou sem conferência. */
  essencialIndeterminada: boolean;
  /** Só a avaliação de linguagem ficou em aberto; o resto está verificado. */
  apenasLinguagemIndeterminada: boolean;
  versao: string | null;
  versaoId: string | null;
  hash: string | null;
};

export type RevisorSemanticoRegra = (e: {
  regra: RegraContrato;
  candidato: string;
  contexto: ContextoCanonico;
}) => {
  veredito: "cumprida" | "descumprida" | "indeterminada";
  /** Trecho do contexto/candidato que sustenta o veredito. Obrigatório. */
  referencia: string | null;
  motivo?: string;
};

export type VerificadorRegra = (e: {
  regra: RegraContrato;
  contexto: ContextoCanonico;
}) => Veredito;

export type OpcoesAvaliacao = {
  revisorSemantico?: RevisorSemanticoRegra | null;
  /** Verificadores injetados por identificador (testes e casos especiais). */
  verificadores?: Record<string, VerificadorRegra>;
};

type Veredito = {
  status: StatusRegra;
  motivo: string;
  nota?: number | null;
  trecho?: string | null;
  evidencia?: string[];
  falhaTecnica?: boolean;
};

// ------------------------------------------------------------------ apoio

function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function chave(t: string): string {
  return semAcento(t).toLowerCase().replace(/\s+/g, " ").trim();
}

function espacos(t: string): string {
  return t.replace(/\s+/g, " ").trim();
}

/** Comparação por palavra inteira: "Ana" não casa dentro de "Mariana". */
export function mencionaNome(texto: string, nome: string): boolean {
  const n = chave(nome);
  if (!n) return false;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "u");
  return re.test(chave(texto));
}

const AUTOAPRESENTACAO =
  /(?:sou a|sou o|meu nome e|aqui e a|aqui e o|falo com voce a|quem fala e a)\s+([\p{L}]+)/u;

/** Nome que o texto afirma ser o DA ASSISTENTE (não menção a terceiros). */
export function entidadeAfirmada(texto: string): string | null {
  const m = AUTOAPRESENTACAO.exec(chave(texto));
  return m ? m[1] : null;
}

const SINAIS_PROIBIDOS: Array<[string, RegExp]> = [
  ["dados_de_terceiros", /\bcpf\s*[:\s]?\d|prontuario d[eo] |paciente [a-z]+ (tem|esta|fez)\b/],
  ["vazamento_de_instrucoes", /\b(minhas instrucoes|system prompt|prompt do sistema|regra interna)\b/],
];

function violacoesObservaveis(texto: string): string[] {
  const n = chave(texto);
  return SINAIS_PROIBIDOS.filter(([, re]) => re.test(n)).map(([k]) => k);
}

// ------------------------------------------------------------- aspecto

type Aspecto =
  | "guarda_posterior"
  | "autorizacao"
  | "comprovacao"
  | "literal"
  | "proibicao"
  | "identidade"
  | "fatos"
  | "encaminhamento"
  | "atendimento"
  | "linguagem"
  | "observacional";

export function aspectoDaRegra(r: RegraContrato): Aspecto {
  if (r.posteriorAClassificacao || r.momento === "decisao_saida") return "guarda_posterior";
  if (r.momento === "autorizacao_acao") return "autorizacao";
  if (r.momento === "confirmacao_operacional") return "comprovacao";
  if (r.verificacao === "literal" && r.literal) return "literal";
  if (r.natureza === "proibicao" && r.proibicoes.length > 0) return "proibicao";

  const k = chave(`${r.conduta ?? ""} ${r.resultadoEsperado ?? ""}`);
  if (/\b(apresente-se|apresentacao|nome da atendente|identidade)\b/.test(k)) return "identidade";
  if (/\b(fonte|catalogo|agenda|lastro|confira|conferir|conferidas|valores|horarios)\b/.test(k)) {
    return "fatos";
  }
  if (/\b(transferencia|transferir|encaminh|atendente|fila)\b/.test(k)) return "encaminhamento";
  if (r.categoria === "LINGUAGEM") return "linguagem";
  if (r.categoria === "CONVERSACIONAL") return "atendimento";
  return "observacional";
}

// -------------------------------------------------------- verificadores

function afirmacoesDaRegra(r: RegraContrato, c: ContextoCanonico): AfirmacaoCanonica[] {
  const k = chave(`${r.conduta ?? ""} ${r.resultadoEsperado ?? ""}`);
  const preco = /\b(preco|valor|valores|catalogo)\b/.test(k);
  const horario = /\b(horario|horarios|agenda|disponibilidade|vaga)\b/.test(k);
  if (preco && !horario) return c.afirmacoes.filter((a) => a.tipo === "preco");
  if (horario && !preco) {
    return c.afirmacoes.filter((a) => a.tipo === "horario" || a.tipo === "disponibilidade");
  }
  return c.afirmacoes;
}

/** Cada afirmação é conferida com o SEU recorte. Uma correta não cobre outra. */
function verificarFatos(r: RegraContrato, c: ContextoCanonico): Veredito {
  const alvo = afirmacoesDaRegra(r, c);
  if (alvo.length === 0) {
    return { status: "NOT_APPLICABLE", motivo: "SEM_AFIRMACAO_DESTE_TIPO", nota: null };
  }
  const semFonte = alvo.filter((a) => a.comFonte === false && (a.essencial ?? true));
  const indefinidas = alvo.filter((a) => a.comFonte === null);
  const rotulo = (a: AfirmacaoCanonica) =>
    `${a.id}: ${a.texto}${a.condicao ? ` [${a.condicao}]` : ""}`;

  if (semFonte.length > 0) {
    const nota = Math.round(((alvo.length - semFonte.length) / alvo.length) * 100);
    return {
      status: "FAIL",
      motivo: "AFIRMACAO_SEM_FONTE",
      nota,
      trecho: semFonte[0]!.texto,
      evidencia: semFonte.map(rotulo),
    };
  }
  if (indefinidas.length > 0) {
    return {
      status: "UNKNOWN",
      motivo: "AFIRMACAO_NAO_CONFERIDA",
      nota: null,
      trecho: indefinidas[0]!.texto,
      evidencia: indefinidas.map(rotulo),
    };
  }
  return {
    status: "PASS",
    motivo: "TODAS_AS_AFIRMACOES_COM_FONTE",
    nota: 100,
    evidencia: alvo.map((a) => `${rotulo(a)} -> ${a.fonte ?? "fonte oficial"}`),
  };
}

function verificarIdentidade(r: RegraContrato, c: ContextoCanonico): Veredito {
  const id = c.identidadePublicada;
  if (!id) return { status: "UNKNOWN", motivo: "IDENTIDADE_PUBLICADA_AUSENTE", nota: null };
  const afirmada = entidadeAfirmada(c.candidato);
  if (afirmada && !mencionaNome(id.assistente, afirmada) && !mencionaNome(afirmada, id.assistente)) {
    return {
      status: "FAIL",
      motivo: "IDENTIDADE_TROCADA",
      nota: 0,
      trecho: afirmada,
      evidencia: [`publicado: ${id.assistente}`, `afirmado: ${afirmada}`],
    };
  }
  const temNome = mencionaNome(c.candidato, id.assistente);
  const temLocal = mencionaNome(c.candidato, id.estabelecimento);
  if (temNome && temLocal) {
    return {
      status: "PASS",
      motivo: "APRESENTACAO_COM_IDENTIDADE_PUBLICADA",
      nota: 100,
      evidencia: [id.assistente, id.estabelecimento],
    };
  }
  const parcial = (temNome ? 50 : 0) + (temLocal ? 50 : 0);
  return {
    status: "FAIL",
    motivo: temNome || temLocal ? "APRESENTACAO_INCOMPLETA" : "APRESENTACAO_AUSENTE",
    nota: parcial,
    trecho: c.candidato.slice(0, 160),
    evidencia: [`nome: ${temNome}`, `estabelecimento: ${temLocal}`],
  };
}

function verificarLiteral(r: RegraContrato, c: ContextoCanonico): Veredito {
  const esperado = espacos(r.literal ?? "");
  const obtido = espacos(c.candidato);
  const ok = r.operador === "inclusao" ? obtido.includes(esperado) : obtido === esperado;
  return {
    status: ok ? "PASS" : "FAIL",
    motivo: ok ? "TEXTO_EXATO_CONFERIDO" : "TEXTO_EXATO_DIVERGENTE",
    nota: ok ? 100 : 0,
    trecho: obtido.slice(0, 160),
    evidencia: [`esperado: ${esperado}`],
  };
}

function verificarProibicao(r: RegraContrato, c: ContextoCanonico): Veredito {
  const violadas = categoriasVioladas(c.candidato, r.proibicoes, r.literal, r.operador);
  if (violadas.length === 0) {
    return {
      status: "PASS",
      motivo: "NENHUMA_CATEGORIA_PROIBIDA_PRESENTE",
      nota: 100,
      evidencia: r.proibicoes.map((p) => `${p}: ausente`),
    };
  }
  const nota = Math.round(((r.proibicoes.length - violadas.length) / r.proibicoes.length) * 100);
  return {
    status: "FAIL",
    motivo: "CONTEUDO_PROIBIDO_PRESENTE",
    nota,
    trecho: c.candidato.slice(0, 160),
    evidencia: violadas,
  };
}

/** Autorização: coleta legítima é PENDING; executar sem requisito é FAIL. */
function verificarAutorizacao(r: RegraContrato, c: ContextoCanonico): Veredito {
  const op = c.operacao;
  if (!op) return { status: "NOT_APPLICABLE", motivo: "NENHUMA_OPERACAO_PROPOSTA", nota: null };
  if (op.executada && op.dadosPendentes.length > 0) {
    return {
      status: "FAIL",
      motivo: "OPERACAO_EXECUTADA_SEM_REQUISITOS",
      nota: 0,
      evidencia: op.dadosPendentes,
    };
  }
  if (op.dadosPendentes.length > 0) {
    if (op.anunciadaNaResposta) {
      return {
        status: "FAIL",
        motivo: "OPERACAO_ANUNCIADA_COM_DADOS_PENDENTES",
        nota: 0,
        trecho: c.candidato.slice(0, 160),
        evidencia: op.dadosPendentes,
      };
    }
    const pergunta = c.candidato.includes("?");
    return pergunta
      ? {
          status: "PENDING",
          motivo: "COLETA_LEGITIMA_ANTES_DA_ACAO",
          nota: null,
          trecho: c.candidato.slice(0, 160),
          evidencia: op.dadosPendentes,
        }
      : {
          status: "UNKNOWN",
          motivo: "SEM_COLETA_NEM_EXECUCAO",
          nota: null,
          evidencia: op.dadosPendentes,
        };
  }
  return { status: "PASS", motivo: "REQUISITOS_CONFIRMADOS", nota: 100, evidencia: [op.tipo] };
}

/** Comprovação: disponibilidade não é reserva; tentativa não é sucesso. */
function verificarComprovacao(r: RegraContrato, c: ContextoCanonico): Veredito {
  const op = c.operacao;
  if (!op || !op.executada) {
    return { status: "NOT_APPLICABLE", motivo: "NENHUMA_OPERACAO_EXECUTADA", nota: null };
  }
  const proibitiva = r.natureza === "proibicao" || /falh/.test(chave(r.conduta ?? ""));
  if (op.resultado === "falha") {
    const afirmaSucesso = op.anunciadaNaResposta;
    return afirmaSucesso
      ? {
          status: "FAIL",
          motivo: "SUCESSO_AFIRMADO_APOS_FALHA",
          nota: 0,
          trecho: c.candidato.slice(0, 160),
          evidencia: [`${op.tipo}: falha`],
        }
      : {
          status: "PASS",
          motivo: "FALHA_NAO_APRESENTADA_COMO_SUCESSO",
          nota: 100,
          evidencia: [`${op.tipo}: falha`],
        };
  }
  if (op.resultado === null) {
    return op.anunciadaNaResposta
      ? {
          status: "FAIL",
          motivo: "CONFIRMACAO_SEM_RESULTADO",
          nota: 0,
          trecho: c.candidato.slice(0, 160),
          evidencia: [`${op.tipo}: resultado desconhecido`],
        }
      : { status: "UNKNOWN", motivo: "RESULTADO_OPERACIONAL_DESCONHECIDO", nota: null };
  }
  if (op.apenasConsulta === true && op.anunciadaNaResposta && !proibitiva) {
    return {
      status: "FAIL",
      motivo: "CONSULTA_APRESENTADA_COMO_RESERVA",
      nota: 0,
      trecho: c.candidato.slice(0, 160),
      evidencia: [`${op.tipo}: consulta de disponibilidade`],
    };
  }
  if (op.anunciadaNaResposta && !op.comprovante) {
    return {
      status: "FAIL",
      motivo: "CONFIRMACAO_SEM_IDENTIFICADOR",
      nota: 0,
      trecho: c.candidato.slice(0, 160),
      evidencia: [op.tipo],
    };
  }
  return {
    status: "PASS",
    motivo: "OPERACAO_COMPROVADA",
    nota: 100,
    evidencia: [`${op.tipo}: ${op.comprovante ?? "sem confirmação na resposta"}`],
  };
}

function verificarEncaminhamento(r: RegraContrato, c: ContextoCanonico): Veredito {
  const op = c.operacao;
  if (r.natureza === "proibicao") {
    const efeitoReal =
      op != null && op.executada && op.simulada !== true && /transfer|fila|atendente/.test(chave(op.tipo));
    return efeitoReal
      ? {
          status: "FAIL",
          motivo: "EFEITO_REAL_NO_AMBIENTE_PROIBIDO",
          nota: 0,
          evidencia: [op!.tipo],
        }
      : {
          status: "PASS",
          motivo: "NENHUM_EFEITO_REAL_OBSERVADO",
          nota: 100,
          evidencia: op ? [`${op.tipo}: ${op.simulada ? "simulada" : "não executada"}`] : [],
        };
  }
  const reconhece = /\b(encaminh|atendente|equipe|uma pessoa|colega)\b/.test(chave(c.candidato));
  return reconhece
    ? { status: "PASS", motivo: "PEDIDO_RECONHECIDO", nota: 100, trecho: c.candidato.slice(0, 160) }
    : {
        status: "FAIL",
        motivo: "PEDIDO_DE_PESSOA_NAO_RECONHECIDO",
        nota: 0,
        trecho: c.candidato.slice(0, 160),
      };
}

function verificarAtendimento(r: RegraContrato, c: ContextoCanonico): Veredito | null {
  const k = chave(`${r.conduta ?? ""} ${r.resultadoEsperado ?? ""}`);
  const n = chave(c.candidato);
  const exigencias: Array<[string, boolean]> = [];
  if (/\bpergunte\b/.test(k)) exigencias.push(["pergunta", c.candidato.includes("?")]);
  if (/\bsaudacao\b/.test(k)) {
    exigencias.push([
      "saudacao",
      /\b(oi|ola|bom dia|boa tarde|boa noite)\b/.test(n),
    ]);
  }
  if (exigencias.length === 0) return null;
  const faltando = exigencias.filter(([, ok]) => !ok).map(([nome]) => nome);
  const nota = Math.round(((exigencias.length - faltando.length) / exigencias.length) * 100);
  return faltando.length === 0
    ? {
        status: "PASS",
        motivo: "CONDUTA_CONVERSACIONAL_CUMPRIDA",
        nota: 100,
        evidencia: exigencias.map(([nome]) => nome),
      }
    : {
        status: "FAIL",
        motivo: "CONDUTA_CONVERSACIONAL_NAO_CUMPRIDA",
        nota,
        trecho: c.candidato.slice(0, 160),
        evidencia: faltando,
      };
}

function verificarObservacional(_r: RegraContrato, c: ContextoCanonico): Veredito {
  const v = violacoesObservaveis(c.candidato);
  return v.length === 0
    ? { status: "PASS", motivo: "NENHUMA_VIOLACAO_OBSERVADA", nota: 100 }
    : {
        status: "FAIL",
        motivo: "VIOLACAO_OBSERVADA",
        nota: 0,
        trecho: c.candidato.slice(0, 160),
        evidencia: v,
      };
}

/**
 * Revisor semântico: só entra onde acrescenta informação (significado aberto).
 * Precisa devolver referência do contexto e NUNCA pode declarar consulta ou
 * operação concluída sem prova do sistema.
 */
function verificarSemantica(
  r: RegraContrato,
  c: ContextoCanonico,
  revisor: RevisorSemanticoRegra | null | undefined,
): Veredito {
  if (!revisor) {
    return { status: "UNKNOWN", motivo: "VERIFICACAO_SEMANTICA_INDISPONIVEL", nota: null };
  }
  const saida = revisor({ regra: r, candidato: c.candidato, contexto: c });
  if (!saida || typeof saida.veredito !== "string") {
    return {
      status: "UNKNOWN",
      motivo: "REVISOR_RETORNO_INVALIDO",
      nota: null,
      falhaTecnica: true,
    };
  }
  if (saida.veredito === "cumprida" && !saida.referencia) {
    return { status: "UNKNOWN", motivo: "REVISOR_SEM_REFERENCIA", nota: null };
  }
  if (
    saida.veredito === "cumprida" &&
    (r.momento === "confirmacao_operacional" || r.momento === "autorizacao_acao")
  ) {
    return { status: "UNKNOWN", motivo: "REVISOR_SEM_PROVA_DO_SISTEMA", nota: null };
  }
  if (saida.veredito === "indeterminada") {
    return { status: "UNKNOWN", motivo: saida.motivo ?? "REVISOR_INDETERMINADO", nota: null };
  }
  const ok = saida.veredito === "cumprida";
  return {
    status: ok ? "PASS" : "FAIL",
    motivo: saida.motivo ?? (ok ? "REVISOR_CUMPRIDA" : "REVISOR_DESCUMPRIDA"),
    nota: ok ? 100 : 0,
    trecho: saida.referencia,
    evidencia: saida.referencia ? [saida.referencia] : [],
  };
}

// ------------------------------------------------------------- avaliação

function descreverCondicao(r: RegraContrato, resultado: ResultadoCondicao, c: ContextoCanonico): string {
  const partes = r.condicoes.map((x) => `${x.negada ? "não " : ""}${x.tipo}`);
  const sinais = [
    `ambiente=${c.ambiente ?? "desconhecido"}`,
    `saudacaoSimples=${c.pedido.saudacaoSimples ?? "desconhecido"}`,
    `pedidoConcreto=${c.pedido.concreto ?? "desconhecido"}`,
    `apresentacaoEntregue=${c.estadoSessao.apresentacaoEntregue ?? "desconhecido"}`,
    `operacao=${c.operacao ? `${c.operacao.tipo}/${c.operacao.executada ? "executada" : "proposta"}` : "nenhuma"}`,
  ];
  return `${resultado} [${partes.join(" & ") || "sempre"}] {${sinais.join(", ")}}`;
}

export function avaliarRegra(
  r: RegraContrato,
  c: ContextoCanonico,
  opcoes: OpcoesAvaliacao = {},
): ResultadoRegra {
  const estado = estadoAplicabilidadeDoContexto(c);
  const aplicabilidade = avaliarAplicabilidade(r, estado);
  const base = {
    identificador: r.identificador,
    titulo: r.titulo,
    categoria: r.categoria,
    momento: r.momento,
    componente: r.componente,
    aplicabilidade,
    evidenciaCondicao: descreverCondicao(r, aplicabilidade, c),
    versao: r.versao,
    versaoId: r.versaoId,
    hash: r.hash,
    hashRegra: r.hashRegra,
  };
  const aspecto = aspectoDaRegra(r);
  const guarda = aspecto === "guarda_posterior";

  const monta = (v: Veredito): ResultadoRegra => ({
    ...base,
    status: v.status,
    nota: v.nota ?? null,
    motivo: v.motivo,
    trechoAvaliado: v.trecho ?? null,
    evidencia: v.evidencia ?? [],
    falhaTecnica: v.falhaTecnica === true,
    contaNoCandidato: !guarda,
  });

  if (aplicabilidade === "falsa") {
    return monta({ status: "NOT_APPLICABLE", motivo: "CONDICAO_COMPROVADAMENTE_FALSA", nota: null });
  }
  if (guarda) {
    return monta({
      status: "PENDING",
      motivo: "GUARDA_POSTERIOR_A_CLASSIFICACAO",
      nota: null,
      evidencia: ["conferida no fluxo de saída"],
    });
  }
  if (aplicabilidade === "indeterminada") {
    return monta({ status: "UNKNOWN", motivo: "CONDICAO_INDETERMINADA", nota: null });
  }
  if (!r.interpretada) {
    return monta({
      status: "UNKNOWN",
      motivo: r.motivo ?? "REGRA_NAO_INTERPRETADA",
      nota: null,
    });
  }

  try {
    const injetado = r.identificador ? opcoes.verificadores?.[r.identificador] : undefined;
    if (injetado) return monta(injetado({ regra: r, contexto: c }));

    switch (aspecto) {
      case "literal":
        return monta(verificarLiteral(r, c));
      case "proibicao":
        return monta(verificarProibicao(r, c));
      case "identidade":
        return monta(verificarIdentidade(r, c));
      case "fatos":
        return monta(verificarFatos(r, c));
      case "autorizacao":
        return monta(verificarAutorizacao(r, c));
      case "comprovacao":
        return monta(verificarComprovacao(r, c));
      case "encaminhamento":
        return monta(verificarEncaminhamento(r, c));
      case "atendimento": {
        const v = verificarAtendimento(r, c);
        return monta(v ?? verificarSemantica(r, c, opcoes.revisorSemantico));
      }
      case "linguagem":
        return monta(verificarSemantica(r, c, opcoes.revisorSemantico));
      default:
        return monta(verificarObservacional(r, c));
    }
  } catch (e) {
    return monta({
      status: "UNKNOWN",
      motivo: `FALHA_TECNICA_DO_VERIFICADOR: ${e instanceof Error ? e.message : String(e)}`,
      nota: null,
      falhaTecnica: true,
    });
  }
}

function agregar(rs: ResultadoRegra[]): AgregadoGrupo {
  const pass = rs.filter((r) => r.status === "PASS");
  const fail = rs.filter((r) => r.status === "FAIL");
  const unknown = rs.filter((r) => r.status === "UNKNOWN").length;
  const naoAplicavel = rs.filter((r) => r.status === "NOT_APPLICABLE").length;
  const pending = rs.filter((r) => r.status === "PENDING").length;
  const aplicaveis = rs.length - naoAplicavel;
  const conferidas = [...pass, ...fail];
  const notas = conferidas.map((r) => r.nota).filter((n): n is number => n != null);
  return {
    total: rs.length,
    aplicaveis,
    pass: pass.length,
    fail: fail.length,
    unknown,
    naoAplicavel,
    pending,
    cobertura: aplicaveis === 0 ? 1 : conferidas.length / aplicaveis,
    nota: notas.length === 0 ? null : Math.round(notas.reduce((a, b) => a + b, 0) / notas.length),
  };
}

/**
 * Avalia TODAS as regras do contrato sobre o contexto do turno, preservando o
 * resultado individual de cada uma.
 */
export function avaliarContrato(
  contrato: ContratoRegras,
  contexto: ContextoCanonico,
  opcoes: OpcoesAvaliacao = {},
): AvaliacaoContrato {
  const todos = [...contrato.regras]
    .sort((a, b) => a.precedencia - b.precedencia || a.ordem - b.ordem)
    .map((r) => avaliarRegra(r, contexto, opcoes));

  const resultados = todos.filter((r) => r.contaNoCandidato);
  const guardasPosteriores = todos.filter((r) => !r.contaNoCandidato);

  const porGrupo = {
    ESSENCIAL: agregar(resultados.filter((r) => r.categoria === "ESSENCIAL")),
    CONVERSACIONAL: agregar(resultados.filter((r) => r.categoria === "CONVERSACIONAL")),
    LINGUAGEM: agregar(resultados.filter((r) => r.categoria === "LINGUAGEM")),
  } satisfies Record<CategoriaContrato, AgregadoGrupo>;

  const essencialDescumprida = porGrupo.ESSENCIAL.fail > 0;
  const essencialIndeterminada = porGrupo.ESSENCIAL.unknown > 0;
  const substantivoOk =
    !essencialDescumprida &&
    !essencialIndeterminada &&
    porGrupo.CONVERSACIONAL.fail === 0 &&
    porGrupo.CONVERSACIONAL.unknown === 0;

  return {
    resultados,
    guardasPosteriores,
    porGrupo,
    falhasTecnicas: todos.filter((r) => r.falhaTecnica).length,
    essencialDescumprida,
    essencialIndeterminada,
    apenasLinguagemIndeterminada: substantivoOk && porGrupo.LINGUAGEM.unknown > 0,
    versao: contrato.versao,
    versaoId: contrato.versaoId,
    hash: contrato.hash,
  };
}

/** Utilitário de auditoria: uma linha por regra (ID, condição, estado, evidência). */
export function linhasDeAuditoria(a: AvaliacaoContrato): string[] {
  return [...a.resultados, ...a.guardasPosteriores].map(
    (r) =>
      `${r.identificador ?? "(sem id)"} | ${r.aplicabilidade} | ${r.status} | ${r.motivo} | ${r.evidencia.join("; ")}`,
  );
}

export { normalizarTexto };
