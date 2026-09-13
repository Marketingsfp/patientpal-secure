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

/**
 * Situação da CONVERSA que condiciona a regra. Diferente da condição por
 * mensagem: aqui o texto publicado não cita um conteúdo a comparar, e sim um
 * estado do atendimento ("quando ela já explicou o que precisa", "nas
 * mensagens seguintes", "na primeira mensagem").
 *
 * Sem isto, uma proibição válida apenas depois que a pessoa expôs a demanda
 * era lida como proibição universal — e reprovava até uma saudação correta.
 */
export type SituacaoRegra =
  /** A pessoa já declarou o que precisa. */
  | "demanda_declarada"
  /** A apresentação já foi feita antes deste turno. */
  | "apresentacao_ja_feita"
  /** É o primeiro turno respondido da sessão. */
  | "primeira_mensagem"
  /** A mensagem recebida é composta somente por saudação. */
  | "saudacao_pura"
  /** A mensagem recebida traz pergunta ou pedido concreto. */
  | "pedido_concreto";

export type CondicaoRegra =
  | { tipo: "sempre" }
  | { tipo: "mensagem_exata"; valor: string }
  | { tipo: "mensagem_contem"; valor: string }
  | { tipo: "situacao"; situacao: SituacaoRegra; valor: string }
  /** Várias situações exigidas ao mesmo tempo pela mesma regra. */
  | { tipo: "situacoes"; itens: SituacaoRegra[]; valor: string }
  /**
   * A condição publicada existe, mas o avaliador não sabe conferi-la com os
   * sinais do servidor. NUNCA vira "aplica" nem "não se aplica": fica
   * indeterminada e é declarada como limitação.
   */
  | { tipo: "nao_compreendida"; valor: string };

export type VerificacaoRegra =
  | "literal"
  | "proibicao_de_conteudo"
  | "semantica"
  | "nao_interpretada";

export type CategoriaProibida =
  | "saudacao"
  /** Repetir a APRESENTAÇÃO da assistente (diferente de cumprimentar). */
  | "apresentacao"
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
  /** Como o literal deve ser conferido. `null` quando não há literal. */
  operador: OperadorLiteral | null;
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
  /\b(nunca|jamais|sempre|obrigat|proibid|responda|responder|envie|enviar|escreva|escrever|retorne|use|utilize|inclua|acrescente|deve|dever[áa]|precisa|[ée] vedado|n[ãa]o pode|n[ãa]o deve|sem repetir|n[ãa]o repita|evite)\b/i;

const PROIBICAO =
  /\b(n[ãa]o acrescente|n[ãa]o inclua|n[ãa]o use|n[ãa]o utilize|n[ãa]o envie|n[ãa]o responda|n[ãa]o mencione|n[ãa]o repita|n[ãa]o pode|n[ãa]o deve|nunca|jamais|sem repetir|evite|[ée] proibido|[ée] vedado)\b/i;

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
export function exigenciaLiteral(
  obrigacao: string,
): { literal: string; operador: OperadorLiteral } | null {
  const padroes: Array<[RegExp, OperadorLiteral]> = [
    [
      /(?:responda|responder|envie|enviar|retorne|retornar|escreva|escrever)\s+(?:exatamente|apenas|somente|literalmente)\s*[:\-]?\s*["“']?([^"”'\n.;]+)/i,
      "igualdade",
    ],
    [
      /(?:inclua|incluir|use|usar)\s+(?:o\s+)?(?:marcador|codigo|código|texto|token)\s*[:\-]?\s*["“']?([^"”'\n.;]+)/i,
      "inclusao",
    ],
    [
      /(?:responda|responder)\s+com\s+(?:o\s+)?(?:marcador|codigo|código|texto|token)\s*[:\-]?\s*["“']?([^"”'\n.;]+)/i,
      "inclusao",
    ],
  ];
  for (const [p, operador] of padroes) {
    const m = p.exec(obrigacao);
    const bruto = m?.[1]?.trim();
    if (bruto && bruto.length >= 2) return { literal: bruto, operador };
  }
  return null;
}

/** Compatibilidade: apenas o texto exigido, sem o operador. */
export function literalExigido(obrigacao: string): string | null {
  return exigenciaLiteral(obrigacao)?.literal ?? null;
}

/**
 * Operador de uma exigência literal escrita em bloco ("responda EXATAMENTE:").
 * "inclua"/"use"/"responda com o marcador" pedem presença; o resto pede que a
 * resposta INTEIRA seja o texto exigido.
 */
export function operadorDoBloco(plano: string): OperadorLiteral {
  return /\b(inclua|incluir|use|usar)\b/i.test(plano) || /\bcom\s*:\s*$/i.test(plano)
    ? "inclusao"
    : "igualdade";
}

const CATEGORIAS: Array<[CategoriaProibida, RegExp]> = [
  // "apresentação" é conferida à parte de "saudação": repetir quem você é não
  // é a mesma coisa que dizer "bom dia".
  ["apresentacao", /\bapresentacao\b/],
  ["saudacao", /\b(saudacao|cumprimento)\b/],
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

/** Palavra que condiciona a proibição a uma situação declarada no texto. */
const CONDICAO_NA_ORACAO = /\b(quando|se|caso|enquanto|sempre que|a menos que|salvo)\b/i;

/**
 * Recorta a oração que carrega a proibição, do "não …/nunca …" até o fim da
 * frase. Sem esse recorte, palavras da frase vizinha entram como conteúdo
 * proibido.
 */
function oracaoDaProibicao(plano: string): string {
  const m = PROIBICAO.exec(plano);
  if (!m || m.index === undefined) return plano;
  const resto = plano.slice(m.index);
  const fim = /[.;!?]\s/.exec(resto);
  return fim ? resto.slice(0, fim.index + 1) : resto;
}

function prioridadeDe(plano: string, verificacao: VerificacaoRegra): PrioridadeRegra {
  if (/\b(EXATAMENTE|NUNCA|JAMAIS|OBRIGAT[ÓO]RIO|PROIBIDO)\b/.test(plano)) return "critica";
  if (verificacao === "literal" || verificacao === "proibicao_de_conteudo") return "alta";
  return "normal";
}

/**
 * Situação da conversa declarada no próprio texto publicado. Determinístico e
 * por forma: nenhuma situação é inferida de conteúdo específico da clínica.
 */
const SITUACOES: Array<[SituacaoRegra, RegExp]> = [
  [
    "demanda_declarada",
    /\b(quando|se|caso|sempre que)\b[^.;!?]*\b(j[áa]\s+(explicou|disse|informou|falou|descreveu|pediu|perguntou|relatou)|j[áa]\s+fez\s+uma\s+pergunta)\b/i,
  ],
  [
    "apresentacao_ja_feita",
    /\b(nas mensagens seguintes|nas pr[óo]ximas mensagens|depois de (se )?apresentar|j[áa] (se )?apresentou|sem repetir a apresenta[çc][ãa]o|n[ãa]o repita a apresenta[çc][ãa]o)\b/i,
  ],
  [
    "primeira_mensagem",
    /\b(na primeira (mensagem|resposta)|no primeiro contato|ao iniciar (a|uma) (conversa|sess[ãa]o)|(de|em) uma nova sess[ãa]o)\b/i,
  ],
];

/** Lê a situação de conversa que condiciona a frase, quando declarada. */
export function situacaoDaFrase(plano: string): { situacao: SituacaoRegra; valor: string } | null {
  for (const [situacao, re] of SITUACOES) {
    const m = re.exec(plano);
    if (m) return { situacao, valor: m[0].trim() };
  }
  return null;
}

/**
 * Divide uma unidade em frases, preservando aspas: o texto exigido dentro de
 * aspas ("Olá, …! Sou a … Como posso ajudar?") continua inteiro, e cada frase
 * normativa passa a carregar a SUA condição em vez de herdar a da vizinha.
 */
export function frasesDaUnidade(plano: string): string[] {
  const frases: string[] = [];
  let atual = "";
  let aspas = false;
  const ABRE = /[«"“'']/;
  for (let i = 0; i < plano.length; i++) {
    const c = plano[i]!;
    if (ABRE.test(c)) aspas = !aspas;
    atual += c;
    if (!aspas && /[.;!?]/.test(c)) {
      const proximo = plano[i + 1];
      if (proximo === undefined || /\s/.test(proximo)) {
        if (atual.trim().length >= 12) {
          frases.push(atual.trim());
          atual = "";
        }
      }
    }
  }
  if (atual.trim() !== "") {
    if (frases.length > 0 && atual.trim().length < 12) {
      frases[frases.length - 1] = `${frases[frases.length - 1]} ${atual.trim()}`.trim();
    } else {
      frases.push(atual.trim());
    }
  }
  return frases.length > 0 ? frases : [plano.trim()];
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
            operador: operadorDoBloco(u.plano),
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
        operador: null,
        proibicoes: [],
        descricao: u.plano,
        interpretada: false,
        motivo: "TEXTO_EXIGIDO_NAO_DECLARADO",
      });
      continue;
    }

    // Uma unidade pode reunir várias frases normativas com CONDIÇÕES
    // DIFERENTES ("apresente-se assim: …" + "não acrescente … quando ela já
    // explicou"). Lidas juntas, a condição de uma contaminava a outra. Cada
    // frase vira sua própria regra, com a sua condição.
    const frases = frasesDaUnidade(u.plano);
    const normativas = frases.filter((f) => NORMATIVO.test(f));

    if (normativas.length === 0) {
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

    for (const frase of normativas) {
      // Condição escrita na própria frase da regra. A situação da conversa
      // tem precedência: "quando ela já explicou o que precisa" não é um
      // conteúdo a procurar na mensagem, é um estado do atendimento.
      let condicaoLocal: CondicaoRegra = condicao;
      const situacao = situacaoDaFrase(frase);
      if (situacao) {
        condicaoLocal = {
          tipo: "situacao",
          situacao: situacao.situacao,
          valor: situacao.valor,
        };
      } else {
        const inline = CONDICAO_INLINE.exec(frase);
        if (inline?.[1]) {
          const bruto = inline[1].trim();
          condicaoLocal = /\bexatamente\b/i.test(bruto)
            ? {
                tipo: "mensagem_exata",
                valor: bruto.replace(/.*\bexatamente\b\s*:?\s*/i, "").trim(),
              }
            : { tipo: "mensagem_contem", valor: bruto };
        }
      }

      const exigencia = exigenciaLiteral(frase);
      if (exigencia) {
        registrar(u, {
          condicao: condicaoLocal,
          ambiente: ambienteSecao,
          natureza: "exigencia",
          prioridade: prioridadeDe(frase, "literal"),
          verificacao: "literal",
          literal: exigencia.literal,
          operador: exigencia.operador,
          proibicoes: [],
          descricao: frase,
          interpretada: true,
          motivo: null,
        });
        continue;
      }

      if (PROIBICAO.test(frase)) {
        // A categoria proibida é lida SOMENTE na oração da proibição. Lida no
        // parágrafo inteiro, uma frase vizinha ("responda à pergunta") fazia a
        // regra proibir o que o próprio texto publicado manda fazer.
        const oracao = oracaoDaProibicao(frase);
        const proibicoes = categoriasProibidas(oracao);
        // Proibição condicionada ("… quando ela já explicou o que precisa") só
        // vale quando a condição vale. Se a condição não pôde ser representada,
        // a regra fica NÃO INTERPRETADA — nunca vira proibição para todo turno.
        const condicaoNaoRepresentada =
          condicaoLocal.tipo === "sempre" && CONDICAO_NA_ORACAO.test(oracao);
        if (proibicoes.length > 0 && condicaoNaoRepresentada) {
          limitacoes.push("CONDICAO_DA_PROIBICAO_NAO_VERIFICAVEL");
          registrar(u, {
            condicao: condicaoLocal,
            ambiente: ambienteSecao,
            natureza: "proibicao",
            prioridade: "normal",
            verificacao: "nao_interpretada",
            literal: null,
            operador: null,
            proibicoes: [],
            descricao: frase,
            interpretada: false,
            motivo: "CONDICAO_DA_PROIBICAO_NAO_VERIFICAVEL",
          });
          continue;
        }
        const verificacao: VerificacaoRegra =
          proibicoes.length > 0 ? "proibicao_de_conteudo" : "semantica";
        registrar(u, {
          condicao: condicaoLocal,
          ambiente: ambienteSecao,
          natureza: "proibicao",
          prioridade: prioridadeDe(frase, verificacao),
          verificacao,
          literal: null,
          operador: null,
          proibicoes,
          descricao: frase,
          interpretada: true,
          motivo: null,
        });
        continue;
      }

      registrar(u, {
        condicao: condicaoLocal,
        ambiente: ambienteSecao,
        natureza: "exigencia",
        prioridade: prioridadeDe(frase, "semantica"),
        verificacao: "semantica",
        literal: null,
        operador: null,
        proibicoes: [],
        descricao: frase,
        interpretada: true,
        motivo: null,
      });
    }
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
  /** A pessoa já declarou o que precisa nesta conversa. */
  demandaDeclarada?: boolean | null;
  /** A apresentação já havia sido feita ANTES deste turno. */
  apresentacaoJaFeita?: boolean | null;
  /** Este é o primeiro turno respondido da sessão. */
  primeiraMensagem?: boolean | null;
};

/**
 * "aplica" = vale para este turno; "nao_aplica" = a situação exigida não
 * ocorreu; "indeterminada" = o sistema não sabe dizer. Indeterminada NÃO é
 * descumprimento: só não conta como verificada.
 */
export type Aplicabilidade = "aplica" | "nao_aplica" | "indeterminada";

function sinalDaSituacao(s: SituacaoRegra, e: EntradaAplicabilidade): boolean | null {
  if (s === "demanda_declarada") return e.demandaDeclarada ?? null;
  if (s === "apresentacao_ja_feita") return e.apresentacaoJaFeita ?? null;
  if (e.primeiraMensagem != null) return e.primeiraMensagem;
  return e.apresentacaoJaFeita == null ? null : !e.apresentacaoJaFeita;
}

/** A regra vale para ESTE turno? Ambiente, situação da conversa e condição. */
export function aplicabilidadeDaRegra(
  regra: RegraPublicada,
  e: EntradaAplicabilidade,
): Aplicabilidade {
  if (regra.ambiente !== "qualquer" && e.ambiente && regra.ambiente !== e.ambiente) {
    return "nao_aplica";
  }
  if (regra.condicao.tipo === "sempre") return "aplica";
  if (regra.condicao.tipo === "situacao") {
    const sinal = sinalDaSituacao(regra.condicao.situacao, e);
    if (sinal === true) return "aplica";
    if (sinal === false) return "nao_aplica";
    return "indeterminada";
  }
  const msg = (e.mensagemPaciente ?? "").trim();
  if (msg === "") return "nao_aplica";
  const alvo = chave(regra.condicao.valor);
  const atual = chave(msg);
  const bate = regra.condicao.tipo === "mensagem_exata" ? atual === alvo : atual.includes(alvo);
  return bate ? "aplica" : "nao_aplica";
}

/** Compatibilidade: indeterminada continua entrando como candidata. */
export function regraSeAplica(regra: RegraPublicada, e: EntradaAplicabilidade): boolean {
  return aplicabilidadeDaRegra(regra, e) !== "nao_aplica";
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
