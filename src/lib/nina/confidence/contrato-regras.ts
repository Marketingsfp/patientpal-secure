/**
 * FASE 1 — CONTRATO ESTRUTURADO DAS REGRAS PUBLICADAS.
 *
 * O novo texto da Arquitetura traz um bloco de identidade e regras escritas em
 * ficha (identificador, Tipo, Aplica-se, Conduta, Resultado esperado). Este
 * módulo TRADUZ esse conteúdo publicado em uma representação verificável, sem
 * acrescentar nada ao que está escrito.
 *
 * Princípios (iguais aos de `regras-publicadas.ts`, aqui ampliados):
 * - A publicação é a única fonte. Cada regra guarda o texto integral, o trecho
 *   de origem, a versão, o hash do texto publicado e o hash da PRÓPRIA regra.
 *   Mudou o texto da regra, muda o hash dela — mesmo mantendo o identificador.
 * - O identificador serve para RASTREAR, nunca para substituir o conteúdo. Não
 *   existe lista fixa de identificadores: qualquer `PREFIXO-NN` é aceito e
 *   regras novas entram sem alteração de código.
 * - Condição de aplicação é tri-estado: verdadeira, falsa comprovada ou
 *   indeterminada. Indeterminada nunca vira verdadeira nem "não se aplica".
 * - Texto normativo fora das fichas continua como ORIENTAÇÃO: não vira
 *   exigência universal de saída, e instrução sobre COMO pedir uma ferramenta
 *   não vira obrigação de pedi-la em toda mensagem.
 * - Nada aqui decide bloqueio. Este módulo só descreve o que foi publicado.
 *
 * Módulo puro: sem banco, sem rede, sem modelo.
 */
import { hashDoTexto } from "./hash";
import { extrairIdentidade, type IdentidadeAtendimento } from "../identidade-atendimento";
import {
  exigenciaLiteral,
  type AmbienteRegra,
  type CategoriaProibida,
  type OperadorLiteral,
  type VerificacaoRegra,
} from "./regras-publicadas";

/** Versão do compilador. Muda quando a forma de interpretar muda. */
export const VERSAO_COMPILACAO_CONTRATO = "contrato-1";

export type CategoriaContrato = "ESSENCIAL" | "CONVERSACIONAL" | "LINGUAGEM";

export type MomentoAplicacao =
  | "geracao_candidato"
  | "avaliacao_candidato"
  | "autorizacao_acao"
  | "decisao_saida"
  | "confirmacao_operacional"
  | "entrega";

export type ComponenteResponsavel =
  | "runtime_atendimento"
  | "motor_confianca"
  | "gate_acao"
  | "politica_saida"
  | "conformidade_entrega";

export type TipoCondicao =
  | "sempre"
  | "primeira_resposta"
  | "apresentacao_entregue"
  | "saudacao_simples"
  | "pedido_concreto"
  | "operacao_iminente"
  | "resultado_operacional"
  | "afirmacao_factual"
  | "ambiente"
  | "texto_exato"
  | "pos_classificacao"
  | "pedido_de_humano"
  | "avaliacao_do_candidato"
  | "nao_compilada";

export type CondicaoContrato = {
  tipo: TipoCondicao;
  /** Trecho de "Aplica-se" que originou esta condição. */
  texto: string;
  negada: boolean;
  /** Literal exigido na entrada, quando `tipo` for `texto_exato`. */
  valor?: string;
  ambiente?: AmbienteRegra;
};

export type ResultadoCondicao = "verdadeira" | "falsa" | "indeterminada";

export type RegraContrato = {
  /** Identificador publicado (ID-01, CONV-03...). `null` = orientação geral. */
  identificador: string | null;
  /** Prefixo do identificador, quando houver. Só para agrupar. */
  prefixo: string | null;
  ordem: number;
  titulo: string | null;
  /** Texto integral da ficha, exatamente como publicado. */
  textoIntegral: string;
  linhaInicio: number;
  linhaFim: number;
  categoria: CategoriaContrato;
  /** Valor bruto do campo Tipo, preservado mesmo quando desconhecido. */
  tipoDeclarado: string | null;
  aplicaSe: string | null;
  condicoes: CondicaoContrato[];
  ambiente: AmbienteRegra;
  conduta: string | null;
  resultadoEsperado: string | null;
  natureza: "exigencia" | "proibicao";
  verificacao: VerificacaoRegra;
  literal: string | null;
  operador: OperadorLiteral | null;
  proibicoes: CategoriaProibida[];
  momento: MomentoAplicacao;
  componente: ComponenteResponsavel;
  /** Identificadores citados no texto da regra (precedência/dependência). */
  dependencias: string[];
  /** Menor valor = avaliada antes. Deriva da categoria e do momento. */
  precedencia: number;
  /** Guarda posterior à classificação (não entra na conta que produz LOW). */
  posteriorAClassificacao: boolean;
  /** Depende do resultado real de uma operação já executada. */
  dependeDeResultadoOperacional: boolean;
  interpretada: boolean;
  motivo: string | null;
  /** Hash do texto DESTA regra: muda com o texto, mesmo mantendo o ID. */
  hashRegra: string;
  /** Hash do texto publicado inteiro nesta execução. */
  hash: string | null;
  versao: string | null;
  versaoId: string | null;
  escopo: string;
};

export type OrientacaoContrato = {
  texto: string;
  linhaInicio: number;
  linhaFim: number;
  /** Orientação nunca é exigência de saída: fica registrada como referência. */
  categoria: "ORIENTACAO";
};

export type DiagnosticoContrato = {
  total: number;
  porCategoria: Record<CategoriaContrato, number>;
  /** Regras que não puderam ser interpretadas, com o trecho e o motivo. */
  naoInterpretadas: Array<{ identificador: string | null; trecho: string; motivo: string }>;
  /** Campos de ficha ausentes, por regra. */
  camposFaltando: Array<{ identificador: string | null; campos: string[] }>;
  /** Identificadores repetidos na mesma publicação. */
  duplicados: string[];
  /** Condições que o compilador não soube representar. */
  condicoesNaoCompiladas: Array<{ identificador: string | null; texto: string }>;
};

export type ContratoRegras = {
  escopo: string;
  versao: string | null;
  versaoId: string | null;
  hash: string | null;
  versaoCompilacao: string;
  /** Identidade lida do MESMO texto do turno. Nunca fixada em código. */
  identidade: IdentidadeAtendimento | null;
  identidadePendente: boolean;
  regras: RegraContrato[];
  orientacoes: OrientacaoContrato[];
  limitacoes: string[];
  diagnostico: DiagnosticoContrato;
};

// ------------------------------------------------------------------ apoio

function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function chave(t: string): string {
  return semAcento(t).toLowerCase().replace(/\s+/g, " ").trim();
}

const CABECALHO_REGRA = /^([A-Z]{2,8}-\d{1,3})\s*(?:[—–\-:]\s*(.*))?$/;
const CAMPO = /^(tipo|aplica-se|aplica se|conduta|resultado esperado)\s*:\s*(.*)$/i;

const CATEGORIAS_CONHECIDAS: CategoriaContrato[] = ["ESSENCIAL", "CONVERSACIONAL", "LINGUAGEM"];

function categoriaDoTipo(tipo: string | null): CategoriaContrato | null {
  if (!tipo) return null;
  const k = chave(tipo).toUpperCase();
  return CATEGORIAS_CONHECIDAS.find((c) => k.includes(c)) ?? null;
}

// -------------------------------------------------------------- condições

type Detector = {
  tipo: TipoCondicao;
  re: RegExp;
  ambiente?: AmbienteRegra;
};

/**
 * Detectores por FORMA, não por conteúdo de clínica. Cada um lê um estado do
 * atendimento que o runtime sabe informar.
 */
const DETECTORES: Detector[] = [
  { tipo: "sempre", re: /\b(sempre|em todas as mensagens|em qualquer mensagem)\b/ },
  {
    tipo: "primeira_resposta",
    re: /\b(primeira (resposta|mensagem)|primeiro contato|inicio da conversa|nova sessao)\b/,
  },
  {
    tipo: "apresentacao_entregue",
    re: /\b(apresentacao ja (foi )?(entregue|feita)|ja se apresentou|mensagens seguintes|proximas mensagens)\b/,
  },
  { tipo: "saudacao_simples", re: /\b(apenas uma saudacao|saudacao simples|so (um )?cumprimento)\b/ },
  {
    tipo: "pedido_concreto",
    re: /\b(ja explicou|ja disse|ja informou|pedido concreto|pediu algo|demanda declarada)\b/,
  },
  {
    tipo: "operacao_iminente",
    re: /\b(antes de executar|prestes a executar|antes de (criar|agendar|cancelar|confirmar))\b/,
  },
  {
    tipo: "resultado_operacional",
    re: /\b(depois de executar|apos executar|apos a operacao|depois da operacao|resultado da operacao)\b/,
  },
  {
    tipo: "afirmacao_factual",
    re: /\b(afirmacao factual|afirmar|informar (um )?(preco|valor|horario)|houver (preco|valor|horario))\b/,
  },
  {
    tipo: "pos_classificacao",
    re: /\b(apos a classificacao|depois da classificacao|apos calcular a (nota|confianca))\b/,
  },
  {
    tipo: "pedido_de_humano",
    re: /\b(falar com (uma pessoa|um atendente|alguem|humano)|pedido de atendente|atendimento humano)\b/,
  },
  {
    tipo: "avaliacao_do_candidato",
    re: /\b(na avaliacao do candidato|na conferencia|ao avaliar a resposta|antes da entrega)\b/,
  },
  { tipo: "ambiente", re: /\bhomologacao\b/, ambiente: "homologacao" },
  { tipo: "ambiente", re: /\bproducao\b/, ambiente: "producao" },
];

const TEXTO_EXATO =
  /\b(?:for|seja|e)\s+exatamente\s*[:\-]?\s*["“']([^"”'\n]+)["”']|\bexatamente\s+["“']([^"”'\n]+)["”']/i;

const NEGACAO = /\b(nao|exceto|salvo|fora de)\b/;

/**
 * Traduz o campo "Aplica-se" em condições verificáveis. Quando nenhuma forma
 * conhecida aparece, devolve `nao_compilada` — que avalia como INDETERMINADA,
 * jamais como "não se aplica".
 */
export function compilarCondicoes(aplicaSe: string | null | undefined): CondicaoContrato[] {
  const bruto = (aplicaSe ?? "").trim();
  if (bruto === "") return [{ tipo: "nao_compilada", texto: "", negada: false }];

  const k = chave(bruto);
  const condicoes: CondicaoContrato[] = [];

  const exato = TEXTO_EXATO.exec(bruto);
  if (exato) {
    condicoes.push({
      tipo: "texto_exato",
      texto: exato[0],
      negada: false,
      valor: (exato[1] ?? exato[2] ?? "").trim(),
    });
  }

  for (const d of DETECTORES) {
    const m = d.re.exec(k);
    if (!m) continue;
    const antes = k.slice(Math.max(0, m.index - 24), m.index);
    condicoes.push({
      tipo: d.tipo,
      texto: m[0],
      negada: NEGACAO.test(antes),
      ...(d.ambiente ? { ambiente: d.ambiente } : {}),
    });
  }

  if (condicoes.length === 0) {
    return [{ tipo: "nao_compilada", texto: bruto, negada: false }];
  }
  // "sempre" junto de outra condição é redundante; a condição específica manda.
  const especificas = condicoes.filter((c) => c.tipo !== "sempre");
  return especificas.length > 0 ? especificas : condicoes;
}

export type EstadoAplicabilidade = {
  ambiente?: "producao" | "homologacao" | null;
  mensagemPaciente?: string | null;
  primeiraResposta?: boolean | null;
  apresentacaoEntregue?: boolean | null;
  saudacaoSimples?: boolean | null;
  pedidoConcreto?: boolean | null;
  operacaoIminente?: boolean | null;
  /** Já existe resultado de uma operação executada neste turno. */
  resultadoOperacional?: boolean | null;
  afirmacaoFactual?: boolean | null;
  /** A classificação de confiança já foi produzida (guardas posteriores). */
  posClassificacao?: boolean | null;
  /** A pessoa pediu explicitamente para falar com um atendente humano. */
  pedidoDeHumano?: boolean | null;
  /** Estamos na conferência do candidato (momento de avaliação). */
  avaliandoCandidato?: boolean | null;
};

function sinal(tipo: TipoCondicao, e: EstadoAplicabilidade): boolean | null {
  switch (tipo) {
    case "sempre":
      return true;
    case "primeira_resposta":
      return e.primeiraResposta ?? null;
    case "apresentacao_entregue":
      return e.apresentacaoEntregue ?? null;
    case "saudacao_simples":
      return e.saudacaoSimples ?? null;
    case "pedido_concreto":
      return e.pedidoConcreto ?? null;
    case "operacao_iminente":
      return e.operacaoIminente ?? null;
    case "resultado_operacional":
      return e.resultadoOperacional ?? null;
    case "afirmacao_factual":
      return e.afirmacaoFactual ?? null;
    case "pos_classificacao":
      return e.posClassificacao ?? null;
    case "pedido_de_humano":
      return e.pedidoDeHumano ?? null;
    case "avaliacao_do_candidato":
      return e.avaliandoCandidato ?? null;
    default:
      return null;
  }
}

export function avaliarCondicao(c: CondicaoContrato, e: EstadoAplicabilidade): ResultadoCondicao {
  if (c.tipo === "nao_compilada") return "indeterminada";

  if (c.tipo === "ambiente") {
    if (!e.ambiente) return "indeterminada";
    const bate = e.ambiente === c.ambiente;
    return (c.negada ? !bate : bate) ? "verdadeira" : "falsa";
  }

  if (c.tipo === "texto_exato") {
    const msg = e.mensagemPaciente;
    if (msg === undefined || msg === null) return "indeterminada";
    const bate = chave(msg) === chave(c.valor ?? "");
    return (c.negada ? !bate : bate) ? "verdadeira" : "falsa";
  }

  const s = sinal(c.tipo, e);
  if (s === null) return "indeterminada";
  return (c.negada ? !s : s) ? "verdadeira" : "falsa";
}

/**
 * Combinação de condições: todas precisam valer. Falsa comprovada vence
 * (a regra não se aplica); na dúvida o resultado é indeterminado.
 */
export function avaliarAplicabilidade(
  regra: RegraContrato,
  e: EstadoAplicabilidade,
): ResultadoCondicao {
  if (regra.ambiente !== "qualquer") {
    if (!e.ambiente) return "indeterminada";
    if (regra.ambiente !== e.ambiente) return "falsa";
  }
  let indeterminada = false;
  for (const c of regra.condicoes) {
    const r = avaliarCondicao(c, e);
    if (r === "falsa") return "falsa";
    if (r === "indeterminada") indeterminada = true;
  }
  return indeterminada ? "indeterminada" : "verdadeira";
}

// ------------------------------------------------------- momento/componente

const PROIBICAO = /\b(nao |nunca|jamais|evite|e proibido|e vedado|sem repetir)\b/;

function momentoDaRegra(r: {
  aplicaSe: string | null;
  conduta: string | null;
  condicoes: CondicaoContrato[];
}): MomentoAplicacao {
  const tipos = new Set(r.condicoes.map((c) => c.tipo));
  const k = chave(`${r.aplicaSe ?? ""} ${r.conduta ?? ""}`);
  if (tipos.has("pos_classificacao")) return "decisao_saida";
  if (tipos.has("resultado_operacional")) return "confirmacao_operacional";
  if (tipos.has("operacao_iminente")) return "autorizacao_acao";
  if (/\bna avaliacao|confira|conferir|verifique a fonte|contra a fonte\b/.test(k)) {
    return "avaliacao_candidato";
  }
  if (/\bnao entregue|nao envie|antes de enviar|na entrega\b/.test(k)) return "entrega";
  return "geracao_candidato";
}

const COMPONENTE: Record<MomentoAplicacao, ComponenteResponsavel> = {
  geracao_candidato: "runtime_atendimento",
  avaliacao_candidato: "motor_confianca",
  autorizacao_acao: "gate_acao",
  decisao_saida: "politica_saida",
  confirmacao_operacional: "gate_acao",
  entrega: "conformidade_entrega",
};

const PESO_CATEGORIA: Record<CategoriaContrato, number> = {
  ESSENCIAL: 0,
  CONVERSACIONAL: 10,
  LINGUAGEM: 20,
};

const PESO_MOMENTO: Record<MomentoAplicacao, number> = {
  autorizacao_acao: 0,
  confirmacao_operacional: 1,
  avaliacao_candidato: 2,
  decisao_saida: 3,
  entrega: 4,
  geracao_candidato: 5,
};

const CITA_IDENTIFICADOR = /\b[A-Z]{2,8}-\d{1,3}\b/g;

// --------------------------------------------------------------- compilação

type Bloco = {
  identificador: string;
  titulo: string | null;
  linhas: string[];
  inicio: number;
  fim: number;
};

export type MetaContrato = {
  escopo: string;
  versao?: string | null;
  versaoId?: string | null;
  hash?: string | null;
};

/**
 * Compila o texto publicado em contrato estruturado. Determinístico: nenhuma
 * regra é criada, removida ou ampliada pelo compilador.
 */
export function compilarContratoRegras(
  texto: string | null | undefined,
  meta: MetaContrato,
): ContratoRegras {
  const hash = meta.hash ?? hashDoTexto(texto ?? null);
  const base: ContratoRegras = {
    escopo: meta.escopo,
    versao: meta.versao ?? null,
    versaoId: meta.versaoId ?? null,
    hash,
    versaoCompilacao: VERSAO_COMPILACAO_CONTRATO,
    identidade: null,
    identidadePendente: true,
    regras: [],
    orientacoes: [],
    limitacoes: [],
    diagnostico: {
      total: 0,
      porCategoria: { ESSENCIAL: 0, CONVERSACIONAL: 0, LINGUAGEM: 0 },
      naoInterpretadas: [],
      camposFaltando: [],
      duplicados: [],
      condicoesNaoCompiladas: [],
    },
  };
  if (!texto || texto.trim() === "") {
    base.limitacoes.push("TEXTO_PUBLICADO_VAZIO");
    return base;
  }

  const leituraIdentidade = extrairIdentidade(texto);
  if (leituraIdentidade.ok) {
    base.identidade = leituraIdentidade.identidade;
    base.identidadePendente = false;
  } else {
    base.limitacoes.push(`IDENTIDADE_${leituraIdentidade.motivo}`);
  }

  const linhas = texto.replace(/\r\n/g, "\n").split("\n");
  const blocos: Bloco[] = [];
  const fora: Array<{ linha: string; n: number }> = [];
  let atual: Bloco | null = null;

  linhas.forEach((linha, i) => {
    const m = CABECALHO_REGRA.exec(linha.trim());
    if (m) {
      if (atual) blocos.push(atual);
      atual = {
        identificador: m[1]!,
        titulo: m[2]?.trim() || null,
        linhas: [linha],
        inicio: i + 1,
        fim: i + 1,
      };
      return;
    }
    if (atual) {
      // A ficha termina numa linha em branco seguida de conteúdo que não é campo.
      if (linha.trim() === "") {
        atual.linhas.push(linha);
        return;
      }
      if (CAMPO.test(linha.trim()) || /^\s/.test(linha) || atual.linhas.length > 0) {
        const ultimasVazias = atual.linhas.filter((l) => l.trim() === "").length;
        if (!CAMPO.test(linha.trim()) && ultimasVazias > 0) {
          blocos.push(atual);
          atual = null;
          fora.push({ linha, n: i + 1 });
          return;
        }
        atual.linhas.push(linha);
        atual.fim = i + 1;
        return;
      }
    }
    fora.push({ linha, n: i + 1 });
  });
  if (atual) blocos.push(atual);

  const vistos = new Set<string>();
  blocos.forEach((b, ordem) => {
    const regra = compilarBloco(b, ordem, meta, hash);
    if (vistos.has(regra.identificador!)) {
      base.diagnostico.duplicados.push(regra.identificador!);
      base.limitacoes.push("IDENTIFICADOR_DUPLICADO");
    }
    vistos.add(regra.identificador!);

    const faltando: string[] = [];
    if (!regra.tipoDeclarado) faltando.push("Tipo");
    if (!regra.aplicaSe) faltando.push("Aplica-se");
    if (!regra.conduta) faltando.push("Conduta");
    if (!regra.resultadoEsperado) faltando.push("Resultado esperado");
    if (faltando.length > 0) {
      base.diagnostico.camposFaltando.push({ identificador: regra.identificador, campos: faltando });
    }
    if (!regra.interpretada) {
      base.diagnostico.naoInterpretadas.push({
        identificador: regra.identificador,
        trecho: regra.textoIntegral,
        motivo: regra.motivo ?? "NAO_INTERPRETADA",
      });
    }
    for (const c of regra.condicoes) {
      if (c.tipo === "nao_compilada") {
        base.diagnostico.condicoesNaoCompiladas.push({
          identificador: regra.identificador,
          texto: c.texto,
        });
      }
    }
    base.diagnostico.porCategoria[regra.categoria] += 1;
    base.regras.push(regra);
  });

  // Texto fora das fichas: orientação, nunca exigência universal de saída.
  let buffer: { linhas: string[]; inicio: number } | null = null;
  const fecharOrientacao = () => {
    if (!buffer) return;
    const t = buffer.linhas.join("\n").trim();
    if (t !== "") {
      base.orientacoes.push({
        texto: t,
        linhaInicio: buffer.inicio,
        linhaFim: buffer.inicio + buffer.linhas.length - 1,
        categoria: "ORIENTACAO",
      });
    }
    buffer = null;
  };
  const dentroIdentidade = (n: number) =>
    leituraIdentidade.ok &&
    n >= texto.slice(0, leituraIdentidade.inicio).split("\n").length &&
    n <= texto.slice(0, leituraIdentidade.fim).split("\n").length;

  let anterior = -2;
  for (const f of fora) {
    if (f.linha.trim() === "" || dentroIdentidade(f.n)) {
      fecharOrientacao();
      anterior = f.n;
      continue;
    }
    if (!buffer || f.n !== anterior + 1) {
      fecharOrientacao();
      buffer = { linhas: [f.linha], inicio: f.n };
    } else {
      buffer.linhas.push(f.linha);
    }
    anterior = f.n;
  }
  fecharOrientacao();

  base.diagnostico.total = base.regras.length;
  if (base.diagnostico.naoInterpretadas.length > 0) base.limitacoes.push("REGRA_NAO_INTERPRETADA");
  if (base.diagnostico.condicoesNaoCompiladas.length > 0) {
    base.limitacoes.push("CONDICAO_NAO_COMPILADA");
  }
  if (base.regras.length === 0) base.limitacoes.push("NENHUMA_REGRA_IDENTIFICADA");
  base.limitacoes = [...new Set(base.limitacoes)];
  base.regras.sort((a, b) => a.precedencia - b.precedencia || a.ordem - b.ordem);
  return base;
}

function compilarBloco(
  b: Bloco,
  ordem: number,
  meta: MetaContrato,
  hash: string | null,
): RegraContrato {
  const textoIntegral = b.linhas.join("\n").replace(/\s+$/, "");
  const campos = new Map<string, string>();
  let campoAtual: string | null = null;
  for (const linha of b.linhas.slice(1)) {
    const m = CAMPO.exec(linha.trim());
    if (m) {
      campoAtual = chave(m[1]!).replace(/\s/g, "-");
      campos.set(campoAtual, (m[2] ?? "").trim());
      continue;
    }
    if (campoAtual && linha.trim() !== "") {
      campos.set(campoAtual, `${campos.get(campoAtual) ?? ""} ${linha.trim()}`.trim());
    }
  }

  const tipoDeclarado = campos.get("tipo") || null;
  const aplicaSe = campos.get("aplica-se") || campos.get("aplica-se") || null;
  const conduta = campos.get("conduta") || null;
  const resultadoEsperado = campos.get("resultado-esperado") || null;

  const categoria = categoriaDoTipo(tipoDeclarado);
  const condicoes = compilarCondicoes(aplicaSe);
  const ambienteCond = condicoes.find((c) => c.tipo === "ambiente" && !c.negada);
  const ambiente: AmbienteRegra = ambienteCond?.ambiente ?? "qualquer";

  const exigencia = conduta ? exigenciaLiteral(conduta) : null;
  const natureza: "exigencia" | "proibicao" =
    conduta && PROIBICAO.test(chave(conduta)) && !exigencia ? "proibicao" : "exigencia";

  const proibicoes: CategoriaProibida[] = [];
  if (natureza === "proibicao" && conduta) {
    const k = chave(conduta);
    if (/\bapresentacao\b/.test(k)) proibicoes.push("apresentacao");
    if (/\b(saudacao|cumprimento)\b/.test(k)) proibicoes.push("saudacao");
    if (/\bemojis?\b/.test(k)) proibicoes.push("emoji");
    if (/\bperguntas?\b/.test(k)) proibicoes.push("pergunta");
    if (/\bdespedidas?\b/.test(k)) proibicoes.push("despedida");
  }

  let verificacao: VerificacaoRegra = "semantica";
  let motivo: string | null = null;
  let interpretada = true;
  if (!conduta) {
    verificacao = "nao_interpretada";
    interpretada = false;
    motivo = "CONDUTA_NAO_DECLARADA";
  } else if (exigencia) {
    verificacao = "literal";
  } else if (proibicoes.length > 0) {
    verificacao = "proibicao_de_conteudo";
  }
  if (interpretada && !categoria) {
    interpretada = false;
    motivo = tipoDeclarado ? "TIPO_DESCONHECIDO" : "TIPO_NAO_DECLARADO";
    verificacao = "nao_interpretada";
  }

  const momento = momentoDaRegra({ aplicaSe, conduta, condicoes });
  const categoriaFinal: CategoriaContrato = categoria ?? "ESSENCIAL";
  const dependencias = [
    ...new Set(
      (textoIntegral.match(CITA_IDENTIFICADOR) ?? []).filter((x) => x !== b.identificador),
    ),
  ];

  return {
    identificador: b.identificador,
    prefixo: b.identificador.split("-")[0] ?? null,
    ordem,
    titulo: b.titulo,
    textoIntegral,
    linhaInicio: b.inicio,
    linhaFim: b.fim,
    categoria: categoriaFinal,
    tipoDeclarado,
    aplicaSe,
    condicoes,
    ambiente,
    conduta,
    resultadoEsperado,
    natureza,
    verificacao,
    literal: exigencia?.literal ?? null,
    operador: exigencia?.operador ?? null,
    proibicoes,
    momento,
    componente: COMPONENTE[momento],
    dependencias,
    precedencia: PESO_CATEGORIA[categoriaFinal] + PESO_MOMENTO[momento],
    posteriorAClassificacao: momento === "decisao_saida",
    dependeDeResultadoOperacional: condicoes.some((c) => c.tipo === "resultado_operacional"),
    interpretada,
    motivo,
    hashRegra: hashDoTexto(textoIntegral) ?? "",
    hash,
    versao: meta.versao ?? null,
    versaoId: meta.versaoId ?? null,
    escopo: meta.escopo,
  };
}

// ------------------------------------------------------------- integridade

/**
 * O contrato pertence à MESMA publicação do texto avaliado? Alterar o texto
 * muda o hash e invalida a compilação anterior por inteiro.
 */
export function contratoValidoParaPublicacao(
  contrato: ContratoRegras | null | undefined,
  hash: string | null | undefined,
): boolean {
  if (!contrato) return false;
  if (contrato.versaoCompilacao !== VERSAO_COMPILACAO_CONTRATO) return false;
  return (contrato.hash ?? null) === (hash ?? null);
}

export type DiferencaContrato = {
  incluidas: string[];
  removidas: string[];
  /** Mesmo identificador, texto diferente: representação nova é obrigatória. */
  alteradas: string[];
  inalteradas: string[];
};

/** Compara duas compilações pelo identificador e pelo hash de cada regra. */
export function compararContratos(
  anterior: ContratoRegras | null | undefined,
  atual: ContratoRegras,
): DiferencaContrato {
  const de = new Map((anterior?.regras ?? []).map((r) => [r.identificador ?? r.hashRegra, r]));
  const para = new Map(atual.regras.map((r) => [r.identificador ?? r.hashRegra, r]));
  const d: DiferencaContrato = { incluidas: [], removidas: [], alteradas: [], inalteradas: [] };
  for (const [id, r] of para) {
    const antes = de.get(id);
    if (!antes) d.incluidas.push(id);
    else if (antes.hashRegra !== r.hashRegra) d.alteradas.push(id);
    else d.inalteradas.push(id);
  }
  for (const id of de.keys()) if (!para.has(id)) d.removidas.push(id);
  return d;
}
