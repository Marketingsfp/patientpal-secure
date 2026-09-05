/**
 * FASE 5 — OBSERVABILIDADE DA NINA (parte pura, testável).
 *
 * O que se registra por execução: modelo, nível de raciocínio, latência,
 * motivo operacional CURTO, status da Base, ferramentas, sucesso/falha,
 * handoff, tokens e id da conversa.
 *
 * O QUE NUNCA SE REGISTRA: chain-of-thought / raciocínio privado detalhado.
 * O motivo do roteador vira um código curto da lista abaixo, e o conteúdo das
 * mensagens não entra na telemetria.
 */
import type { NivelRaciocinio } from "./reasoning-router";
import type { KnowledgeStatus } from "./knowledge-contract";
import type { CategoriaErro } from "./erros";

/** Motivos operacionais permitidos. Lista fechada, sem texto livre. */
export const MOTIVOS_OPERACIONAIS = [
  "simple_faq",
  "direct_knowledge_lookup",
  "appointment_tool_required",
  "multiple_constraints",
  "conflicting_results",
] as const;

export type MotivoOperacional = (typeof MOTIVOS_OPERACIONAIS)[number];

/**
 * Traduz o motivo interno do Reasoning Router em um código curto.
 * Nada de frase livre: só os códigos acima chegam ao registro.
 */
export function motivoOperacional(motivoRouter: string, nivel: NivelRaciocinio): MotivoOperacional {
  const m = (motivoRouter ?? "").toLowerCase();
  if (m.includes("conflit") || m.includes("interdependent")) return "conflicting_results";
  if (m.includes("múltiplas restrições") || m.includes("multiplas restricoes")) {
    return "multiple_constraints";
  }
  if (m.includes("agenda") || m.includes("ferramenta")) return "appointment_tool_required";
  if (m.includes("administrativa") || m.includes("factual")) return "direct_knowledge_lookup";
  if (nivel === "high") return "conflicting_results";
  if (nivel === "medium") return "appointment_tool_required";
  return "simple_faq";
}

export type RegistroExecucao = {
  clinica_id: string | null;
  conversation_id: string | null;
  perfil: string;
  model: string;
  thinking_level: NivelRaciocinio;
  route_reason: MotivoOperacional;
  latency_ms: number;
  knowledge_status: KnowledgeStatus | null;
  tool_calls: string[];
  success: boolean;
  error_category: CategoriaErro | null;
  handoff: boolean;
  input_tokens: number | null;
  output_tokens: number | null;
  retries: number;
};

const CAMPOS_PROIBIDOS = /(reasoning|thought|chain_of_thought|raciocinio_detalhado|content)/i;

/**
 * Rede de proteção: remove qualquer campo que possa carregar raciocínio ou
 * conteúdo de mensagem antes de gravar.
 */
export function sanitizarRegistro(registro: Record<string, unknown>): Record<string, unknown> {
  const limpo: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(registro)) {
    if (CAMPOS_PROIBIDOS.test(k)) continue;
    limpo[k] = v;
  }
  return limpo;
}

/** Etiqueta de homologação. NUNCA pode ser enviada ao paciente. */
export function rotuloHomologacao(entrada: {
  model: string;
  thinking_level: NivelRaciocinio;
  knowledge_status?: KnowledgeStatus | null;
  tool_calls?: readonly string[];
}): string {
  const partes = [
    `Model: ${entrada.model}`,
    `Reasoning: ${entrada.thinking_level.toUpperCase()}`,
  ];
  if (entrada.knowledge_status) partes.push(`Knowledge: ${entrada.knowledge_status.toUpperCase()}`);
  if (entrada.tool_calls && entrada.tool_calls.length > 0) {
    partes.push(`Tools: ${entrada.tool_calls.join(", ")}`);
  }
  return partes.join(" | ");
}

export type Metricas = {
  total: number;
  pct_low: number;
  pct_medium: number;
  pct_high: number;
  latencia_media_ms: number;
  latencia_p95_ms: number;
  tokens_entrada: number;
  tokens_saida: number;
  consultas_base: number;
  knowledge_not_found: number;
  knowledge_conflict: number;
  tool_calls: number;
  handoffs: number;
  retries: number;
  erros: number;
  erros_por_categoria: Record<string, number>;
};

function pct(parte: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((parte / total) * 1000) / 10;
}

export function agregarMetricas(registros: readonly RegistroExecucao[]): Metricas {
  const total = registros.length;
  const latencias = registros.map((r) => r.latency_ms).sort((a, b) => a - b);
  const p95 = latencias.length
    ? latencias[Math.min(latencias.length - 1, Math.ceil(latencias.length * 0.95) - 1)]!
    : 0;
  const erros_por_categoria: Record<string, number> = {};
  for (const r of registros) {
    if (r.error_category) {
      erros_por_categoria[r.error_category] = (erros_por_categoria[r.error_category] ?? 0) + 1;
    }
  }
  const soma = (f: (r: RegistroExecucao) => number) => registros.reduce((a, r) => a + f(r), 0);

  return {
    total,
    pct_low: pct(registros.filter((r) => r.thinking_level === "low").length, total),
    pct_medium: pct(registros.filter((r) => r.thinking_level === "medium").length, total),
    pct_high: pct(registros.filter((r) => r.thinking_level === "high").length, total),
    latencia_media_ms: total ? Math.round(soma((r) => r.latency_ms) / total) : 0,
    latencia_p95_ms: p95,
    tokens_entrada: soma((r) => r.input_tokens ?? 0),
    tokens_saida: soma((r) => r.output_tokens ?? 0),
    consultas_base: registros.filter((r) => r.knowledge_status !== null).length,
    knowledge_not_found: registros.filter((r) => r.knowledge_status === "not_found").length,
    knowledge_conflict: registros.filter((r) => r.knowledge_status === "conflict").length,
    tool_calls: soma((r) => r.tool_calls.length),
    handoffs: registros.filter((r) => r.handoff).length,
    retries: soma((r) => r.retries),
    erros: registros.filter((r) => !r.success).length,
    erros_por_categoria,
  };
}
