/**
 * FASE 3 — CONTRATO DE CONHECIMENTO DA NINA (puro, testável).
 *
 * REGRA DA CASA: a planilha cadastrada na Base de Conhecimentos é a FONTE
 * OFICIAL de verdade dos fatos administrativos, operacionais e de catálogo.
 * O modelo entende, interpreta, organiza e conversa — mas NÃO cria fato.
 *
 * Este arquivo transforma os registros vindos da planilha em um objeto
 * estruturado, com status e rastreabilidade, para que o modelo só possa
 * responder com o que veio do retrieval.
 */

export type KnowledgeStatus = "found" | "not_found" | "conflict";

/** Registro cru vindo da planilha (subconjunto usado aqui). */
export type RegistroConhecimento = {
  id?: string;
  categoria?: string | null;
  tipo?: string | null;
  procedimento?: string | null;
  medico?: string | null;
  dia?: string | null;
  horario?: string | null;
  preco_dinheiro?: number | string | null;
  preco_cartao?: number | string | null;
  observacoes?: string | null;
  preparo?: string | null;
  linha_origem?: number | null;
  aba_origem?: string | null;
  extras?: Record<string, unknown> | null;
};

/** Rastreabilidade: de onde saiu cada fato usado na resposta. */
export type TraceConhecimento = {
  record_id: string | null;
  sheet: string | null;
  row: number | null;
  item: string | null;
};

export type ResultadoConhecimento = {
  found: boolean;
  knowledge_status: KnowledgeStatus;
  source: "nina_knowledge_base" | "nina_catalogo";
  source_type: "spreadsheet" | "catalog";
  base_version: number | null;
  base_file: string | null;
  procedure: string | null;
  price: string | null;
  doctors: string[];
  units: string[];
  days: string[];
  notes: string[];
  records: RegistroConhecimento[];
  trace: TraceConhecimento[];
  /** Só quando knowledge_status = "conflict". */
  conflicts?: Array<{ item: string; campo: string; valores: string[]; trace: TraceConhecimento[] }>;
  /** Instrução interna para o modelo. Nunca é mostrada ao paciente. */
  instrucao: string;
};

export function normalizar(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normaliza preço para comparação e exibição.
 * Aceita número e também texto ("250,00", "R$ 1.250,00"): a planilha e o banco
 * podem devolver `numeric` como texto, e nesse caso o valor não pode virar
 * `null` em silêncio — se virasse, a detecção de conflito deixaria passar dois
 * preços diferentes para o mesmo item.
 */
function moeda(v: number | string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  let n: number;
  if (typeof v === "number") {
    n = v;
  } else {
    const limpo = v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
    if (limpo.trim() === "") return null;
    n = Number(limpo);
  }
  if (Number.isNaN(n)) return null;
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

function unico(lista: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const item of lista) {
    const t = String(item ?? "").trim();
    if (t) set.add(t);
  }
  return [...set];
}

function trace(r: RegistroConhecimento): TraceConhecimento {
  return {
    record_id: r.id ?? null,
    sheet: r.aba_origem ?? null,
    row: r.linha_origem ?? null,
    item: r.procedimento ?? r.categoria ?? null,
  };
}

/**
 * CONFLITO: a própria planilha traz o MESMO item com fatos incompatíveis
 * (ex.: dois preços diferentes para o mesmo procedimento e mesmo profissional).
 * Nesse caso a Nina não escolhe: o estado vira `conflict` e segue o fluxo
 * seguro/handoff.
 */
export function detectarConflitos(
  registros: readonly RegistroConhecimento[],
): NonNullable<ResultadoConhecimento["conflicts"]> {
  const grupos = new Map<string, RegistroConhecimento[]>();
  for (const r of registros) {
    const item = normalizar(r.procedimento);
    if (!item) continue;
    const chave = `${item}||${normalizar(r.medico)}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), r]);
  }

  const conflitos: NonNullable<ResultadoConhecimento["conflicts"]> = [];
  for (const [, itens] of grupos) {
    if (itens.length < 2) continue;
    const campos: Array<[string, (r: RegistroConhecimento) => string | null]> = [
      ["preco_dinheiro", (r) => moeda(r.preco_dinheiro)],
      ["preco_cartao", (r) => moeda(r.preco_cartao)],
      ["preparo", (r) => (r.preparo ? normalizar(r.preparo) : null)],
    ];
    for (const [campo, ler] of campos) {
      const valores = unico(itens.map(ler));
      if (valores.length > 1) {
        conflitos.push({
          item: itens[0]?.procedimento ?? "",
          campo,
          valores,
          trace: itens.map(trace),
        });
      }
    }
  }
  return conflitos;
}

const INSTRUCAO_FOUND =
  "Responda usando SOMENTE os fatos deste retorno (planilha oficial da clínica). " +
  "Não complete com conhecimento geral, prática de outras clínicas, valor médio, estimativa ou internet. " +
  "Horário aqui é escala administrativa, não vaga: disponibilidade real vem das ferramentas de agenda.";

const INSTRUCAO_NOT_FOUND =
  "A planilha oficial NÃO tem essa informação. É proibido deduzir, estimar ou usar conhecimento pré-treinado. " +
  "Peça o esclarecimento necessário quando fizer sentido, ou diga que vai verificar com a equipe e siga o fluxo de atendimento humano.";

const INSTRUCAO_CONFLICT =
  "A planilha oficial tem informações incompatíveis para este item. NÃO escolha nenhuma delas e NÃO invente. " +
  "Diga que precisa confirmar com a equipe e siga o fluxo de atendimento humano (handoff).";

/** Monta o contrato estruturado devolvido às ferramentas da Nina. */
export function montarResultadoConhecimento(entrada: {
  registros: readonly RegistroConhecimento[];
  base?: { versao: number | null; arquivo: string | null } | null;
  ambiguo?: boolean;
}): ResultadoConhecimento {
  const registros = [...entrada.registros];
  const base = {
    found: false,
    knowledge_status: "not_found" as KnowledgeStatus,
    source: "nina_knowledge_base" as const,
    source_type: "spreadsheet" as const,
    base_version: entrada.base?.versao ?? null,
    base_file: entrada.base?.arquivo ?? null,
    procedure: null as string | null,
    price: null as string | null,
    doctors: [] as string[],
    units: [] as string[],
    days: [] as string[],
    notes: [] as string[],
    records: registros,
    trace: registros.map(trace),
    instrucao: INSTRUCAO_NOT_FOUND,
  };

  if (registros.length === 0) return base;

  const conflitos = detectarConflitos(registros);
  const primeiro = registros[0]!;
  const preco = moeda(primeiro.preco_dinheiro) ?? moeda(primeiro.preco_cartao);

  const comum = {
    ...base,
    found: true,
    procedure: primeiro.procedimento ?? primeiro.categoria ?? null,
    price: preco,
    doctors: unico(registros.map((r) => r.medico)),
    units: unico(
      registros.map((r) => {
        const u = (r.extras as Record<string, unknown> | null | undefined)?.["unidade"];
        return typeof u === "string" ? u : null;
      }),
    ),
    days: unico(registros.map((r) => r.dia)),
    notes: unico([
      ...registros.map((r) => r.observacoes),
      ...registros.map((r) => (r.preparo ? `Preparo: ${r.preparo}` : null)),
    ]),
  };

  if (conflitos.length > 0) {
    return {
      ...comum,
      found: false,
      knowledge_status: "conflict",
      price: null,
      conflicts: conflitos,
      instrucao: INSTRUCAO_CONFLICT,
    };
  }

  return {
    ...comum,
    knowledge_status: "found",
    instrucao: entrada.ambiguo
      ? `${INSTRUCAO_FOUND} Há mais de uma opção parecida: pergunte ao paciente qual item está no pedido médico antes de afirmar preço ou preparo.`
      : INSTRUCAO_FOUND,
  };
}
