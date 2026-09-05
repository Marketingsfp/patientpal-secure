/**
 * FASE 3 — Diagnóstico da causa real dos erros da Nina (catálogo puro).
 *
 * Este módulo NÃO altera planilha, Base de Conhecimentos, embeddings, prompt,
 * modelo, regras ou ferramentas. Ele apenas classifica o erro já reportado.
 *
 * Regra crítica: erro da Nina != planilha errada. Só `knowledge_error` e
 * `knowledge_missing` apontam para a planilha; as demais causas apontam para
 * busca (retrieval), interpretação, ferramenta ou fluxo.
 */

export const CAUSAS_RAIZ_NINA = [
  {
    valor: "knowledge_error",
    rotulo: "Planilha errada",
    descricao: "A informação oficial da planilha está errada ou desatualizada.",
    alvo: "planilha",
  },
  {
    valor: "knowledge_missing",
    rotulo: "Falta na planilha",
    descricao: "A informação deveria existir na Base, mas não está lá.",
    alvo: "planilha",
  },
  {
    valor: "retrieval_error",
    rotulo: "Falha na busca",
    descricao: "A informação correta existe, mas a Nina não recuperou ou pegou o item errado.",
    alvo: "busca",
  },
  {
    valor: "reasoning_error",
    rotulo: "Interpretação do modelo",
    descricao: "O dado correto chegou ao modelo, mas foi interpretado de forma errada.",
    alvo: "modelo",
  },
  {
    valor: "tool_error",
    rotulo: "Falha em ferramenta",
    descricao: "Problema na Agenda, no CRM ou em outra ferramenta.",
    alvo: "ferramenta",
  },
  {
    valor: "hallucination",
    rotulo: "Informação inventada",
    descricao: "A Nina afirmou algo sem respaldo na Base, Agenda, CRM ou ferramenta válida.",
    alvo: "modelo",
  },
  {
    valor: "workflow_error",
    rotulo: "Falha de fluxo",
    descricao: "Problema no fluxo do atendimento, como handoff ausente ou indevido.",
    alvo: "fluxo",
  },
] as const;

export type CausaRaizNina = (typeof CAUSAS_RAIZ_NINA)[number]["valor"];

export const VALORES_CAUSA_RAIZ = CAUSAS_RAIZ_NINA.map((c) => c.valor) as unknown as [
  CausaRaizNina,
  ...CausaRaizNina[],
];

export function rotuloCausaRaiz(v: string | null | undefined): string {
  if (!v) return "Sem diagnóstico";
  return CAUSAS_RAIZ_NINA.find((c) => c.valor === v)?.rotulo ?? v;
}

export const PRIORIDADES_NINA = [
  { valor: "critico", rotulo: "Crítico" },
  { valor: "alto", rotulo: "Alto" },
  { valor: "normal", rotulo: "Normal" },
] as const;

export type PrioridadeNina = (typeof PRIORIDADES_NINA)[number]["valor"];

export const VALORES_PRIORIDADE = PRIORIDADES_NINA.map((p) => p.valor) as unknown as [
  PrioridadeNina,
  ...PrioridadeNina[],
];

export function rotuloPrioridade(v: string | null | undefined): string {
  if (!v) return "Sem prioridade";
  return PRIORIDADES_NINA.find((p) => p.valor === v)?.rotulo ?? v;
}

const CATEGORIAS_CRITICAS = new Set([
  "valor_incorreto",
  "medico_incorreto",
  "unidade_incorreta",
  "informacao_inventada",
]);

const CATEGORIAS_NORMAIS = new Set(["resposta_incompleta", "outro"]);

/**
 * Prioridade sugerida a partir da causa raiz + categoria reportada.
 * É apenas sugestão: a supervisão pode mudar na tela.
 */
export function prioridadeSugerida(
  causa: CausaRaizNina | string | null | undefined,
  categoria: string | null | undefined,
): PrioridadeNina {
  if (causa === "hallucination" || causa === "tool_error") return "critico";
  if (categoria && CATEGORIAS_CRITICAS.has(categoria)) return "critico";
  if (
    causa === "retrieval_error" ||
    causa === "knowledge_error" ||
    causa === "knowledge_missing" ||
    causa === "reasoning_error" ||
    causa === "workflow_error"
  ) {
    return "alto";
  }
  if (categoria && CATEGORIAS_NORMAIS.has(categoria)) return "normal";
  return "normal";
}

function normalizar(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Chave de agrupamento: mesma categoria + mesmo assunto = mesmo problema.
 * Os registros individuais continuam existindo; só ficam vinculados.
 */
export function chaveAgrupamento(categoria: string, assunto: string): string {
  const a = normalizar(assunto).split(" ").slice(0, 4).join("-");
  return `${normalizar(categoria).replace(/\s/g, "-")}:${a || "geral"}`;
}

/** Assunto sugerido a partir do que a planilha devolveu e da pergunta. */
export function assuntoSugerido(
  itemPlanilha: string | null | undefined,
  pergunta: string | null | undefined,
): string {
  const item = String(itemPlanilha ?? "").trim();
  if (item) return item;
  const p = String(pergunta ?? "").trim();
  if (!p) return "Geral";
  return p.split(/\s+/).slice(0, 6).join(" ");
}
