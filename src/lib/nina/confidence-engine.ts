/**
 * NINA CONFIDENCE DECISION ENGINE (parte pura, testável).
 *
 * Regra central: a Nina não afirma nada sensível porque "acha que sabe".
 * Antes de a resposta sair, o texto é confrontado com o ESTADO REAL do
 * sistema desta rodada (quais ferramentas rodaram, se deram certo, se o
 * catálogo publicado devolveu registro, se a agenda confirmou, se o
 * paciente foi identificado).
 *
 * Saída:
 *   alta         -> responder
 *   intermediária-> esclarecer com o paciente (uma vez) e reavaliar
 *   baixa        -> transferir para atendimento humano
 *
 * Bloqueios absolutos derrubam a decisão para "transferir" mesmo com
 * pontuação alta. Este módulo é puro: nada de banco, rede ou I/O.
 */

/** Tipos de afirmação que exigem dado real do sistema. */
export type CategoriaConfianca =
  | "valor"
  | "horario"
  | "profissional"
  | "disponibilidade"
  | "preparo"
  | "regra"
  | "agendamento"
  | "clinico_administrativo";

/** Bloqueios absolutos definidos com a equipe. */
export type BloqueioConfianca =
  | "VALOR_SEM_CATALOGO"
  | "AGENDA_SEM_CONFIRMACAO"
  | "FERRAMENTA_FALHOU"
  | "PREPARO_SEM_FONTE";

export type AcaoConfianca = "responder" | "esclarecer" | "transferir";

/** O que uma ferramenta fez nesta rodada (vem do Tool Broker). */
export type EvidenciaFerramenta = {
  nome: string;
  capacidade: string | null;
  fonte: string | null;
  success: boolean;
  erro?: string | undefined;
};

export type EvidenciasConfianca = {
  ferramentas: EvidenciaFerramenta[];
  /** O catálogo publicado devolveu ao menos um registro utilizável. */
  catalogoEncontrou: boolean;
  /** Agendamento realmente gravado e verificado no banco. */
  agendamentoConfirmado: boolean;
  /** Paciente identificado no CRM nesta conversa. */
  pacienteIdentificado: boolean;
  /** A rodada de esclarecimento já foi usada neste turno. */
  esclarecimentoUsado: boolean;
  /** O próprio handoff já foi pedido pelo modelo. */
  handoffSolicitado: boolean;
};

export type DecisaoConfianca = {
  score: number;
  acao: AcaoConfianca;
  bloqueio: BloqueioConfianca | null;
  categorias: CategoriaConfianca[];
  motivos: string[];
};

export const LIMITE_ALTA = 80;
export const LIMITE_MEDIA = 50;

const PADROES: Array<{ categoria: CategoriaConfianca; re: RegExp }> = [
  {
    categoria: "valor",
    re: /(r\$\s?\d|\d+\s?reais|custa|pre[çc]o|valor(es)?\b|tabela de pre|particular fica)/i,
  },
  {
    categoria: "horario",
    re: /(\b\d{1,2}[:h]\d{2}\b|\b\d{1,2}\s?h\b|de segunda a|hor[áa]rio de (funcionamento|atendimento)|abrimos|fechamos)/i,
  },
  {
    categoria: "profissional",
    re: /(\bdr\.?\s|\bdra\.?\s|doutor|doutora|com o m[ée]dico|com a m[ée]dica|especialista \w+ atende)/i,
  },
  {
    categoria: "disponibilidade",
    re: /(temos (vaga|hor[áa]rio)|dispon[íi]vel|vaga (para|no dia)|pr[óo]xima vaga|tem hor[áa]rio (no|na|para))/i,
  },
  {
    categoria: "preparo",
    re: /(jejum|preparo|n[ãa]o (comer|beber)|beber \d+\s?(ml|litros)|suspender medica|bexiga cheia|trazer (exames|pedido))/i,
  },
  {
    categoria: "regra",
    re: /(n[ãa]o atendemos|s[óo] atendemos|é obrigat[óo]rio|precisa (levar|apresentar|trazer)|conv[êe]nio (n[ãa]o )?(cobre|aceito)|regra da cl[íi]nica|toler[âa]ncia de)/i,
  },
  {
    categoria: "agendamento",
    re: /(agendei|agendado|agendada|marquei|marcada|reservei|reservado|confirmad[oa] (seu|sua) (consulta|hor[áa]rio|agendamento))/i,
  },
  {
    categoria: "clinico_administrativo",
    re: /(seu (exame|resultado|prontu[áa]rio)|seu cadastro (est[áa]|consta)|seu conv[êe]nio (est[áa]|consta)|sua consulta (est[áa]|consta))/i,
  },
];

/** Quais afirmações sensíveis o texto contém. */
export function detectarCategorias(texto: string): CategoriaConfianca[] {
  const t = texto ?? "";
  const achadas: CategoriaConfianca[] = [];
  for (const p of PADROES) if (p.re.test(t) && !achadas.includes(p.categoria)) achadas.push(p.categoria);
  return achadas;
}

const CAP_CATALOGO = new Set(["searchKnowledgeBase", "listCatalog"]);
const CAP_AGENDA = new Set(["checkAvailability", "createAppointment"]);

function houve(ferramentas: EvidenciaFerramenta[], caps: Set<string>): boolean {
  return ferramentas.some((f) => f.capacidade !== null && caps.has(f.capacidade) && f.success && !f.erro);
}

/** Alguma ferramenta falhou, deu erro ou não respondeu. */
export function houveFalhaDeFerramenta(ferramentas: EvidenciaFerramenta[]): boolean {
  return ferramentas.some((f) => !f.success || Boolean(f.erro));
}

/**
 * Avalia a resposta contra as evidências reais e devolve a decisão.
 * Nunca lança: em caso de dúvida estrutural, a decisão é a mais conservadora.
 */
export function avaliarConfianca(params: {
  texto: string;
  evidencias: EvidenciasConfianca;
}): DecisaoConfianca {
  const { texto, evidencias: ev } = params;
  const categorias = detectarCategorias(texto);
  const motivos: string[] = [];

  // Handoff já pedido pelo modelo: o pipeline de transferência assume.
  if (ev.handoffSolicitado) {
    return {
      score: 100,
      acao: "responder",
      bloqueio: null,
      categorias,
      motivos: ["handoff já solicitado pelo modelo"],
    };
  }

  const temCatalogo = houve(ev.ferramentas, CAP_CATALOGO) && ev.catalogoEncontrou;
  const temAgenda = houve(ev.ferramentas, CAP_AGENDA);

  // ------------------------- bloqueios absolutos -------------------------
  let bloqueio: BloqueioConfianca | null = null;

  if (houveFalhaDeFerramenta(ev.ferramentas)) {
    bloqueio = "FERRAMENTA_FALHOU";
    motivos.push("uma consulta ao sistema falhou ou não respondeu");
  } else if (categorias.includes("valor") && !temCatalogo) {
    bloqueio = "VALOR_SEM_CATALOGO";
    motivos.push("valor informado sem registro publicado no catálogo");
  } else if (
    (categorias.includes("agendamento") && !ev.agendamentoConfirmado) ||
    ((categorias.includes("disponibilidade") || categorias.includes("horario")) && !temAgenda && !temCatalogo) ||
    (categorias.includes("profissional") && !temCatalogo && !temAgenda)
  ) {
    bloqueio = "AGENDA_SEM_CONFIRMACAO";
    motivos.push("agenda, disponibilidade ou profissional sem confirmação do sistema");
  } else if ((categorias.includes("preparo") || categorias.includes("regra")) && !temCatalogo) {
    bloqueio = "PREPARO_SEM_FONTE";
    motivos.push("preparo ou regra clínica sem fonte publicada");
  }

  if (bloqueio) {
    return { score: 0, acao: "transferir", bloqueio, categorias, motivos };
  }

  // ----------------------------- pontuação ------------------------------
  let score = 100;

  if (categorias.length > 0 && ev.ferramentas.length === 0) {
    score -= 45;
    motivos.push("afirmação sensível sem nenhuma consulta ao sistema");
  }
  if (categorias.includes("clinico_administrativo") && !ev.pacienteIdentificado) {
    score -= 30;
    motivos.push("dado do paciente citado sem identificação confirmada");
  }
  if (categorias.length >= 3) {
    score -= 15;
    motivos.push("muitas afirmações sensíveis na mesma resposta");
  }
  if (ev.ferramentas.some((f) => f.capacidade === "searchKnowledgeBase") && !ev.catalogoEncontrou) {
    score -= 25;
    motivos.push("catálogo consultado sem registro correspondente");
  }
  if (!texto.trim()) {
    score -= 60;
    motivos.push("resposta vazia");
  }

  score = Math.max(0, Math.min(100, score));

  let acao: AcaoConfianca;
  if (score >= LIMITE_ALTA) acao = "responder";
  else if (score >= LIMITE_MEDIA) acao = ev.esclarecimentoUsado ? "transferir" : "esclarecer";
  else acao = "transferir";

  if (acao === "transferir" && motivos.length === 0) motivos.push("confiança abaixo do mínimo");
  if (motivos.length === 0) motivos.push("evidências suficientes no sistema");

  return { score, acao, bloqueio: null, categorias, motivos };
}

/** Instrução interna para a rodada de esclarecimento (não vai ao paciente). */
export function instrucaoEsclarecimento(d: DecisaoConfianca): string {
  return (
    "[SISTEMA] Confiança insuficiente para afirmar isso agora " +
    `(${d.motivos.join("; ")}). Não repita a afirmação. Faça UMA pergunta objetiva ao paciente ` +
    "para esclarecer o que ele precisa (procedimento, convênio, unidade ou profissional) " +
    "e, se ainda faltar informação confirmada no sistema, chame a ferramenta correspondente."
  );
}

/** Motivo legível registrado no handoff quando a confiança é baixa. */
export function motivoHandoffConfianca(d: DecisaoConfianca): string {
  const base = d.bloqueio ? `bloqueio ${d.bloqueio}` : `confiança ${d.score}`;
  return `Confiabilidade insuficiente (${base}): ${d.motivos.join("; ")}`.slice(0, 500);
}
