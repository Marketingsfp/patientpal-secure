/**
 * FASE 8 — Relatório da homologação (módulo puro).
 *
 * Sem rede e sem banco: só tipos, catálogo de categorias de erro e as contas
 * feitas sobre registros que JÁ existem (execuções da Nina, ferramentas
 * auditadas, avaliações do Sol). Nada aqui cria dados novos nem inventa custo:
 * quando o provedor não informa preço, o custo fica nulo e a tela diz isso.
 */

/** Tipos de execução de teste que já existem no sistema. */
export const TIPOS_RELATORIO = [
  { valor: "manual", rotulo: "Manual" },
  { valor: "terra", rotulo: "Terra" },
  { valor: "cenarios", rotulo: "Cenários" },
  { valor: "carga", rotulo: "Carga Luna" },
] as const;

export type TipoRelatorio = (typeof TIPOS_RELATORIO)[number]["valor"];

export function rotuloTipoRelatorio(valor: string): string {
  return TIPOS_RELATORIO.find((t) => t.valor === valor)?.rotulo ?? valor;
}

/** Classificação de erro pedida na Fase 8. */
export const CATEGORIAS_ERRO_RELATORIO = [
  { valor: "prompt", rotulo: "Prompt" },
  { valor: "conhecimento", rotulo: "Conhecimento" },
  { valor: "rag", rotulo: "RAG" },
  { valor: "agenda", rotulo: "Agenda" },
  { valor: "crm", rotulo: "CRM" },
  { valor: "tool", rotulo: "Tool" },
  { valor: "integracao", rotulo: "Integração" },
  { valor: "memoria", rotulo: "Memória" },
  { valor: "transferencia", rotulo: "Transferência" },
  { valor: "orquestracao", rotulo: "Orquestração" },
  { valor: "modelo", rotulo: "Modelo" },
  { valor: "frontend", rotulo: "Frontend" },
  { valor: "outro", rotulo: "Outro" },
] as const;

export type CategoriaErroRelatorio = (typeof CATEGORIAS_ERRO_RELATORIO)[number]["valor"];

export function rotuloCategoriaErroRelatorio(valor: string): string {
  return CATEGORIAS_ERRO_RELATORIO.find((c) => c.valor === valor)?.rotulo ?? valor;
}

const FERRAMENTAS_AGENDA = /agend|disponibilidade|horario|horário|vaga|cancelar|remarc/i;
const FERRAMENTAS_CRM = /paciente|lead|cadastr|contato|crm/i;
const FERRAMENTAS_TRANSFERENCIA = /atendente_humano|transfer|handoff/i;
const FERRAMENTAS_CONHECIMENTO = /conheciment|catalogo|catálogo|procediment|preco|preço|kb/i;

export type EntradaClassificacaoRelatorio = {
  /** Categoria técnica já registrada pela Nina (`nina_execucoes.error_category`). */
  categoria?: string | null;
  /** Ferramenta envolvida, quando o erro veio de uma tool auditada. */
  ferramenta?: string | null;
  /** Componente apontado pelo avaliador (Sol), quando houver. */
  componente?: string | null;
  /** Texto do erro/observação. Nunca contém raciocínio interno. */
  texto?: string | null;
};

/**
 * Classificação determinística. Preferimos o sinal mais específico: ferramenta
 * concreta > categoria técnica registrada > componente apontado > texto.
 * Sem sinal suficiente, fica "outro" — nunca chutamos culpa.
 */
export function classificarErroRelatorio(
  entrada: EntradaClassificacaoRelatorio,
): CategoriaErroRelatorio {
  const ferramenta = (entrada.ferramenta ?? "").trim();
  const categoria = (entrada.categoria ?? "").trim();
  const componente = (entrada.componente ?? "").toLowerCase();
  const texto = (entrada.texto ?? "").toLowerCase();

  if (ferramenta) {
    if (FERRAMENTAS_TRANSFERENCIA.test(ferramenta)) return "transferencia";
    if (FERRAMENTAS_AGENDA.test(ferramenta)) return "agenda";
    if (FERRAMENTAS_CRM.test(ferramenta)) return "crm";
    if (FERRAMENTAS_CONHECIMENTO.test(ferramenta)) return "conhecimento";
    return "tool";
  }

  switch (categoria) {
    case "knowledge_error":
    case "knowledge_not_found":
      return "conhecimento";
    case "tool_error":
      return "tool";
    case "business_rule":
      return "orquestracao";
    case "gemini_error":
    case "bad_request":
      return "modelo";
    case "timeout":
    case "provider_temporary":
    case "provider_config":
      return "integracao";
    default:
      break;
  }

  const alvo = `${componente} ${texto}`;
  if (/prompt|instru[cç]/.test(alvo)) return "prompt";
  if (/\brag\b|busca vetorial|embedding/.test(alvo)) return "rag";
  if (/conheciment|cat[aá]logo|base de/.test(alvo)) return "conhecimento";
  if (/agenda|hor[aá]rio|vaga|agendament/.test(alvo)) return "agenda";
  if (/crm|paciente|cadastro|lead/.test(alvo)) return "crm";
  if (/transfer|handoff|atendente/.test(alvo)) return "transferencia";
  if (/mem[oó]ria|contexto anterior|hist[oó]rico/.test(alvo)) return "memoria";
  if (/orquestra|fluxo|regra/.test(alvo)) return "orquestracao";
  if (/modelo|llm|gemini|gpt/.test(alvo)) return "modelo";
  if (/integra|webhook|meta|whatsapp|provedor/.test(alvo)) return "integracao";
  if (/tela|interface|frontend|bot[aã]o/.test(alvo)) return "frontend";
  if (/tool|ferramenta/.test(alvo)) return "tool";
  return "outro";
}

export type ErroRelatorio = {
  categoria: CategoriaErroRelatorio;
  descricao: string;
  origem: "execucao" | "ferramenta" | "item" | "avaliacao";
  quando: string | null;
  conversaId: string | null;
};

export type ItemRelatorio = {
  chave: string;
  cenario: string | null;
  leadIndice: number | null;
  leadNome: string | null;
  tipo: TipoRelatorio;
  conversaId: string | null;
  cicloId: string | null;
  modeloNina: string | null;
  promptVersao: number | null;
  promptVersaoId: string | null;
  inicio: string | null;
  fim: string | null;
  duracaoMs: number | null;
  mensagens: number;
  tools: number;
  rag: number;
  agendamentos: number;
  transferencias: number;
  erros: ErroRelatorio[];
  inputTokens: number;
  outputTokens: number;
  /** Nulo quando o provedor não informa preço — não inventamos valor. */
  custoEstimado: number | null;
  traceIds: string[];
};

/** Soma dos itens para o cabeçalho do relatório. */
export function somarItens(itens: ItemRelatorio[]) {
  const total = {
    itens: itens.length,
    mensagens: 0,
    tools: 0,
    rag: 0,
    agendamentos: 0,
    transferencias: 0,
    erros: 0,
    inputTokens: 0,
    outputTokens: 0,
    custoEstimado: null as number | null,
  };
  let temCusto = false;
  let custo = 0;
  for (const i of itens) {
    total.mensagens += i.mensagens;
    total.tools += i.tools;
    total.rag += i.rag;
    total.agendamentos += i.agendamentos;
    total.transferencias += i.transferencias;
    total.erros += i.erros.length;
    total.inputTokens += i.inputTokens;
    total.outputTokens += i.outputTokens;
    if (typeof i.custoEstimado === "number") {
      temCusto = true;
      custo += i.custoEstimado;
    }
  }
  if (temCusto) total.custoEstimado = custo;
  return total;
}

/** Contagem de erros por categoria, na ordem do catálogo. */
export function errosPorCategoria(itens: ItemRelatorio[]) {
  const mapa = new Map<CategoriaErroRelatorio, number>();
  for (const item of itens) {
    for (const erro of item.erros) mapa.set(erro.categoria, (mapa.get(erro.categoria) ?? 0) + 1);
  }
  return CATEGORIAS_ERRO_RELATORIO.filter((c) => mapa.has(c.valor)).map((c) => ({
    categoria: c.valor,
    rotulo: c.rotulo,
    total: mapa.get(c.valor) ?? 0,
  }));
}

export function duracaoMs(inicio: string | null, fim: string | null): number | null {
  if (!inicio || !fim) return null;
  const a = Date.parse(inicio);
  const b = Date.parse(fim);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return b - a;
}

export function formatarDuracao(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `${m}min ${String(r).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}min`;
}
