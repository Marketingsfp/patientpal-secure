/**
 * REPRESENTAÇÃO VERIFICÁVEL DAS INSTRUÇÕES PUBLICADAS (aba Arquitetura).
 *
 * O problema corrigido aqui: a leitura anterior procurava apenas palavras como
 * "deve", "nunca" e "sempre", linha a linha, com limite de quantidade e corte
 * de tamanho. Regras escritas em blocos ("Somente quando … / responda
 * EXATAMENTE: / … / Não acrescente …") simplesmente DESAPARECIAM — e a
 * ausência de extração era lida adiante como cumprimento.
 *
 * Regras desta camada:
 * - A publicação é a ÚNICA fonte. Cada regra carrega versão, id da versão,
 *   hash do texto e o trecho publicado que a originou. Mudou o texto, muda o
 *   hash e a representação anterior deixa de valer.
 * - Nada é acrescentado ao que está escrito: a extração é determinística
 *   (sem IA, sem inferência de condição que o texto não declara).
 * - Regra que não pode ser interpretada com segurança fica registrada como
 *   "não interpretada / não verificada". Nunca vira cumprimento.
 * - Sem limite de quantidade e sem truncar texto: regra não some em silêncio.
 * - Nada é específico de um marcador de teste. Condição, exigência e proibição
 *   são lidas por forma, não por conteúdo.
 *
 * Módulo puro: sem banco, sem rede, sem modelo.
 */

export type AmbienteRegra = "producao" | "homologacao" | "qualquer";

export type CondicaoRegra =
  | { tipo: "sempre" }
  | { tipo: "mensagem_exata"; valor: string }
  | { tipo: "mensagem_contem"; valor: string };

export type VerificacaoRegra =
  | "literal"
  | "proibicao_de_conteudo"
  | "semantica"
  | "nao_interpretada";

export type CategoriaProibida =
  | "saudacao"
  | "emoji"
  | "pergunta"
  | "despedida"
  | "explicacao"
  | "texto_adicional";

export type PrioridadeRegra = "critica" | "alta" | "normal";

/**
 * Operador exigido pela regra literal:
 * - `igualdade`: "responda EXATAMENTE" — a resposta INTEIRA tem de ser o texto;
 * - `inclusao`: "inclua o marcador" — o trecho precisa estar presente.
 *
 * A distinção é obrigatória: conferir "responda exatamente" com presença
 * (`includes`) aprova resposta com saudação, emoji e texto extra.
 */
export type OperadorLiteral = "igualdade" | "inclusao";

export type RegraPublicada = {
  /** Estável dentro de uma publicação: hash do texto + ordem. */
  id: string;
  ordem: number;
  /** Quando a regra se aplica. `sempre` = sem condição declarada no texto. */
  condicao: CondicaoRegra;
  /** Ambiente declarado no texto (seção/trecho). `qualquer` = não restringe. */
  ambiente: AmbienteRegra;
  escopo: string;
  natureza: "exigencia" | "proibicao";
  prioridade: PrioridadeRegra;
  verificacao: VerificacaoRegra;
  /** Texto exatamente exigido, quando a regra for literal. */
  literal: string | null;
  /** Categorias de conteúdo proibidas, quando a regra for proibição. */
  proibicoes: CategoriaProibida[];
  /** Descrição curta e auditável (texto publicado, sem marcador de lista). */
  descricao: string;
  /** Trecho publicado de origem, preservado como foi digitado. */
  trecho: string;
  linhaInicio: number;
  linhaFim: number;
  versao: string | null;
  versaoId: string | null;
  /** Hash do texto publicado desta execução. Vincula regra e publicação. */
  hash: string | null;
  interpretada: boolean;
  /** Por que não foi possível interpretar (quando `interpretada` for false). */
  motivo: string | null;
};

export type ExtracaoRegras = {
  regras: RegraPublicada[];
  /** O que não pôde ser conferido, para mostrar na publicação. */
  limitacoes: string[];
};

export type MetaPublicacao = {
  escopo: string;
  versao?: string | null;
  versaoId?: string | null;
  hash?: string | null;
};

// ------------------------------------------------------------------ apoio

function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function chave(t: string): string {
  return semAcento(t).toLowerCase().replace(/\s+/g, " ").trim();
}

const MARCADOR_LISTA = /^[\s]*(?:[-*•—]|\d+[.)])\s+/;

type Unidade = {
  /** Texto normalizado em uma linha (para leitura por expressão regular). */
  plano: string;
  /** Trecho exatamente como publicado. */
  trecho: string;
  inicio: number;
  fim: number;
};

/**
 * Divide o texto em unidades de leitura preservando instruções distribuídas em
 * várias linhas: um parágrafo continua sendo UMA unidade; item de lista é uma
 * unidade por item.
 */
export function unidadesDoTexto(texto: string): Unidade[] {
  const linhas = texto.replace(/\r\n/g, "\n").split("\n");
  const unidades: Unidade[] = [];
  let buffer: { linhas: string[]; inicio: number } | null = null;

  const fechar = () => {
    if (!buffer) return;
    const trecho = buffer.linhas.join("\n");
    if (trecho.trim() !== "") {
      unidades.push({
        plano: trecho.replace(/\s*\n\s*/g, " ").trim(),
        trecho,
        inicio: buffer.inicio + 1,
        fim: buffer.inicio + buffer.linhas.length,
      });
    }
    buffer = null;
  };

  linhas.forEach((linha, i) => {
    if (linha.trim() === "") {
      fechar();
      return;
    }
    if (MARCADOR_LISTA.test(linha)) {
      fechar();
      const limpa = linha.replace(MARCADOR_LISTA, "");
      unidades.push({ plano: limpa.trim(), trecho: linha, inicio: i + 1, fim: i + 1 });
      return;
    }
    if (!buffer) buffer = { linhas: [linha], inicio: i };
    else buffer.linhas.push(linha);
  });
  fechar();
  return unidades;
}

function ehTitulo(u: Unidade): boolean {
  if (u.inicio !== u.fim) return false;
  const letras = u.plano.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letras.length < 4) return false;
  const maiusculas = letras.replace(/[^A-ZÀ-Þ]/g, "").length;
  return maiusculas / letras.length >= 0.8 && !/[.!?]$/.test(u.plano.trim());
}

function ambienteDoTexto(plano: string): AmbienteRegra | null {
  const k = chave(plano);
  if (/\bhomologac/.test(k)) return "homologacao";
  if (/\bproducao\b/.test(k)) return "producao";
  return null;
}

// ------------------------------------------------------------- detectores

const NORMATIVO =
  /\b(nunca|jamais|sempre|obrigat|proibid|responda|responder|envie|enviar|escreva|escrever|retorne|use|utilize|inclua|acrescente|deve|dever[áa]|precisa|[ée] vedado|n[ãa]o pode|n[ãa]o deve)\b/i;

const PROIBICAO =
  /\b(n[ãa]o acrescente|n[ãa]o inclua|n[ãa]o use|n[ãa]o utilize|n[ãa]o envie|n[ãa]o responda|n[ãa]o mencione|n[ãa]o pode|n[ãa]o deve|nunca|jamais|[ée] proibido|[ée] vedado)\b/i;

const CONDICAO_ABERTA =
  /^(somente\s+|apenas\s+|s[óo]\s+)?(quando|se|caso|sempre que)\b[\s\S]*:\s*$/i;

const CONDICAO_INLINE =
  /^(?:somente\s+|apenas\s+|s[óo]\s+)?(?:quando|se|caso|sempre que)\s+(.+?)\s*,\s*(responda|envie|escreva|retorne|use|inclua|n[ãa]o\s+\w+)/i;

const EXIGENCIA_LITERAL_ABERTA =
  /\b(responda|responder|envie|enviar|escreva|escrever|retorne|retornar)\s+(exatamente|apenas|somente|literalmente|com)?\s*:\s*$/i;

/**
 * Lê, de uma instrução PUBLICADA em linha única, o trecho literal exigido.
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

const CATEGORIAS: Array<[CategoriaProibida, RegExp]> = [
  ["saudacao", /\b(saudacao|cumprimento|apresentacao)\b/],
  ["emoji", /\bemojis?\b/],
  ["pergunta", /\bperguntas?\b/],
  ["despedida", /\bdespedidas?\b/],
  ["explicacao", /\b(explicacao|explicacoes|justificativa|comentario)\b/],
  ["texto_adicional", /\b(qualquer outro texto|texto adicional|nada alem|mais nada|outro conteudo)\b/],
];

function categoriasProibidas(plano: string): CategoriaProibida[] {
  const k = chave(plano);
  return CATEGORIAS.filter(([, re]) => re.test(k)).map(([c]) => c);
}

function prioridadeDe(plano: string, verificacao: VerificacaoRegra): PrioridadeRegra {
  if (/\b(EXATAMENTE|NUNCA|JAMAIS|OBRIGAT[ÓO]RIO|PROIBIDO)\b/.test(plano)) return "critica";
  if (verificacao === "literal" || verificacao === "proibicao_de_conteudo") return "alta";
  return "normal";
}

// -------------------------------------------------------------- extração

/**
 * Traduz o texto publicado em regras verificáveis, preservando condição de
 * aplicação, ambiente, exigência/proibição, prioridade, tipo de verificação e
 * a origem (versão, hash e trecho).
 */
export function extrairRegrasPublicadas(
  texto: string | null | undefined,
  meta: MetaPublicacao,
): ExtracaoRegras {
  if (!texto || texto.trim() === "") return { regras: [], limitacoes: [] };

  const unidades = unidadesDoTexto(texto);
  const regras: RegraPublicada[] = [];
  const limitacoes: string[] = [];

  let ambienteSecao: AmbienteRegra = "qualquer";
  let secao = 0;
  let condicao: CondicaoRegra = { tipo: "sempre" };
  const secaoDaRegra: number[] = [];

  const registrar = (
    u: Unidade,
    dados: Omit<
      RegraPublicada,
      "id" | "ordem" | "trecho" | "linhaInicio" | "linhaFim" | "versao" | "versaoId" | "hash" | "escopo"
    >,
    trechoExtra?: Unidade,
  ) => {
    const ordem = regras.length;
    const trecho = trechoExtra ? `${u.trecho}\n${trechoExtra.trecho}` : u.trecho;
    regras.push({
      id: `${meta.hash ?? "sem-hash"}:${ordem}`,
      ordem,
      escopo: meta.escopo,
      trecho,
      linhaInicio: u.inicio,
      linhaFim: trechoExtra ? trechoExtra.fim : u.fim,
      versao: meta.versao ?? null,
      versaoId: meta.versaoId ?? null,
      hash: meta.hash ?? null,
      ...dados,
    });
    secaoDaRegra.push(secao);
  };

  for (let i = 0; i < unidades.length; i++) {
    const u = unidades[i]!;

    if (ehTitulo(u)) {
      secao += 1;
      ambienteSecao = ambienteDoTexto(u.plano) ?? "qualquer";
      condicao = { tipo: "sempre" };
      continue;
    }

    // Condição declarada em bloco: o valor vem na unidade seguinte.
    if (CONDICAO_ABERTA.test(u.plano) && !EXIGENCIA_LITERAL_ABERTA.test(u.plano)) {
      const alvo = unidades[i + 1];
      if (alvo) {
        const exata = /\bexatamente\b/i.test(u.plano);
        condicao = exata
          ? { tipo: "mensagem_exata", valor: alvo.plano }
          : { tipo: "mensagem_contem", valor: alvo.plano };
        i += 1;
        continue;
      }
      limitacoes.push("CONDICAO_SEM_VALOR_DECLARADO");
      continue;
    }

    // Exigência literal em bloco: o texto exigido vem na unidade seguinte.
    if (EXIGENCIA_LITERAL_ABERTA.test(u.plano)) {
      const alvo = unidades[i + 1];
      if (alvo) {
        registrar(
          u,
          {
            condicao,
            ambiente: ambienteSecao,
            natureza: "exigencia",
            prioridade: prioridadeDe(u.plano, "literal"),
            verificacao: "literal",
            literal: alvo.plano,
            proibicoes: [],
            descricao: `${u.plano} ${alvo.plano}`.trim(),
            interpretada: true,
            motivo: null,
          },
          alvo,
        );
        i += 1;
        continue;
      }
      registrar(u, {
        condicao,
        ambiente: ambienteSecao,
        natureza: "exigencia",
        prioridade: "alta",
        verificacao: "nao_interpretada",
        literal: null,
        proibicoes: [],
        descricao: u.plano,
        interpretada: false,
        motivo: "TEXTO_EXIGIDO_NAO_DECLARADO",
      });
      continue;
    }

    if (!NORMATIVO.test(u.plano)) {
      // Não é regra. Ainda assim pode declarar o ambiente da seção
      // (ex.: "Esta regra vale exclusivamente para homologação").
      const amb = /\bregra\b/i.test(u.plano) ? ambienteDoTexto(u.plano) : null;
      if (amb) {
        ambienteSecao = amb;
        for (let r = 0; r < regras.length; r++) {
          if (secaoDaRegra[r] === secao && regras[r]!.ambiente === "qualquer") {
            regras[r]!.ambiente = amb;
          }
        }
      }
      continue;
    }

    // Condição escrita na mesma frase da regra.
    let condicaoLocal = condicao;
    const inline = CONDICAO_INLINE.exec(u.plano);
    if (inline?.[1]) {
      const bruto = inline[1].trim();
      condicaoLocal = /\bexatamente\b/i.test(bruto)
        ? { tipo: "mensagem_exata", valor: bruto.replace(/.*\bexatamente\b\s*:?\s*/i, "").trim() }
        : { tipo: "mensagem_contem", valor: bruto };
    }

    const literal = literalExigido(u.plano);
    if (literal) {
      registrar(u, {
        condicao: condicaoLocal,
        ambiente: ambienteSecao,
        natureza: "exigencia",
        prioridade: prioridadeDe(u.plano, "literal"),
        verificacao: "literal",
        literal,
        proibicoes: [],
        descricao: u.plano,
        interpretada: true,
        motivo: null,
      });
      continue;
    }

    if (PROIBICAO.test(u.plano)) {
      const proibicoes = categoriasProibidas(u.plano);
      const verificacao: VerificacaoRegra =
        proibicoes.length > 0 ? "proibicao_de_conteudo" : "semantica";
      registrar(u, {
        condicao: condicaoLocal,
        ambiente: ambienteSecao,
        natureza: "proibicao",
        prioridade: prioridadeDe(u.plano, verificacao),
        verificacao,
        literal: null,
        proibicoes,
        descricao: u.plano,
        interpretada: true,
        motivo: null,
      });
      continue;
    }

    registrar(u, {
      condicao: condicaoLocal,
      ambiente: ambienteSecao,
      natureza: "exigencia",
      prioridade: prioridadeDe(u.plano, "semantica"),
      verificacao: "semantica",
      literal: null,
      proibicoes: [],
      descricao: u.plano,
      interpretada: true,
      motivo: null,
    });
  }

  if (regras.some((r) => !r.interpretada)) limitacoes.push("REGRA_PUBLICADA_NAO_INTERPRETADA");
  if (regras.some((r) => r.verificacao === "semantica")) {
    limitacoes.push("REGRA_DE_LINGUAGEM_ABERTA_NAO_VERIFICADA_AUTOMATICAMENTE");
  }
  return { regras, limitacoes: [...new Set(limitacoes)] };
}

// ---------------------------------------------------------- aplicabilidade

export type EntradaAplicabilidade = {
  mensagemPaciente?: string | null;
  ambiente?: "producao" | "homologacao" | null;
};

/** A regra vale para ESTE turno? Ambiente e condição declarada no texto. */
export function regraSeAplica(regra: RegraPublicada, e: EntradaAplicabilidade): boolean {
  if (regra.ambiente !== "qualquer" && e.ambiente && regra.ambiente !== e.ambiente) return false;
  const msg = (e.mensagemPaciente ?? "").trim();
  if (regra.condicao.tipo === "sempre") return true;
  if (msg === "") return false;
  const alvo = chave(regra.condicao.valor);
  const atual = chave(msg);
  return regra.condicao.tipo === "mensagem_exata" ? atual === alvo : atual.includes(alvo);
}

/**
 * A representação pertence à MESMA publicação do texto? Uma alteração no texto
 * muda o hash e invalida a representação anterior.
 */
export function regrasValidasParaPublicacao(
  regras: readonly RegraPublicada[] | undefined,
  hash: string | null | undefined,
): RegraPublicada[] {
  if (!regras || regras.length === 0) return [];
  return regras.filter((r) => (r.hash ?? null) === (hash ?? null));
}

/**
 * Conferência humana antes de publicar: devolve as regras derivadas do texto
 * em edição e as limitações declaradas. Não há interpretação por IA — nada é
 * acrescentado ao que está escrito.
 */
export function revisarRegrasDoTexto(texto: string, escopo: string, hash: string | null) {
  const { regras, limitacoes } = extrairRegrasPublicadas(texto, { escopo, hash });
  return {
    regras,
    limitacoes,
    verificaveis: regras.filter(
      (r) => r.verificacao === "literal" || r.verificacao === "proibicao_de_conteudo",
    ).length,
    naoVerificaveis: regras.filter(
      (r) => r.verificacao === "semantica" || r.verificacao === "nao_interpretada",
    ).length,
  };
}
