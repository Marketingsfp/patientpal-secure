/**
 * FASE 6 — Detalhamento dos componentes de IA (prompt, conhecimento/RAG,
 * modelo e ferramentas).
 *
 * Módulo puro: recebe a metadata já gravada no trace daquela passagem e
 * devolve uma leitura organizada para o painel. Não executa nada, não
 * consulta banco e nunca amplia o que foi coletado.
 *
 * Regras inegociáveis:
 *  - nunca expor raciocínio interno do modelo (chain-of-thought);
 *  - nunca expor segredo, token, chave ou credencial;
 *  - dados pessoais sempre mascarados;
 *  - conteúdo sensível de negócio (texto do prompt, contexto enviado,
 *    argumentos de ferramenta) só para quem tem perfil técnico;
 *  - nunca mostrar fonte ou dado de outro paciente.
 */
import { mascarar, sanitizarMetadata } from "./tracing";

export type NivelAcesso = "admin" | "operacional";

/** Marcador usado quando o perfil do usuário não permite ver o conteúdo. */
export const RESTRITO = "[restrito ao seu perfil]";

/** Chaves que carregam raciocínio interno do modelo e nunca podem sair. */
const CHAVES_RACIOCINIO =
  /(chain[_-]?of[_-]?thought|reasoning|reasoning_details|thinking|thought|raciocinio|deliberacao|scratchpad|analise_interna)/i;

/** Remove qualquer campo de raciocínio interno, em qualquer profundidade. */
export function removerRaciocinio<T>(valor: T): T {
  if (Array.isArray(valor)) {
    return valor.map((item) => removerRaciocinio(item)) as unknown as T;
  }
  if (valor && typeof valor === "object") {
    const saida: Record<string, unknown> = {};
    for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
      if (CHAVES_RACIOCINIO.test(chave)) continue;
      saida[chave] = removerRaciocinio(item);
    }
    return saida as unknown as T;
  }
  return valor;
}

/** Metadata pronta para leitura: sem segredo, sem PII crua, sem raciocínio. */
export function metadataSegura(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return removerRaciocinio(sanitizarMetadata(metadata ?? {}));
}

function texto(valor: unknown): string | null {
  if (typeof valor === "string" && valor.trim()) return valor;
  if (typeof valor === "number") return String(valor);
  return null;
}

function numero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

function lista(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
}

/** Aplica a permissão: conteúdo sensível some para quem não é técnico. */
function protegido(valor: string | null, nivel: NivelAcesso): string | null {
  if (valor === null) return null;
  return nivel === "admin" ? valor : RESTRITO;
}

// ───────────────────────────── PROMPT ─────────────────────────────

export type DetalhePrompt = {
  tipo: "prompt";
  versao: string | null;
  publicadoEm: string | null;
  status: string | null;
  modulos: string[];
  /** Trecho das instruções efetivamente usadas (somente perfil técnico). */
  instrucoes: string | null;
};

export function lerDetalhePrompt(
  metadata: Record<string, unknown>,
  nivel: NivelAcesso,
): DetalhePrompt {
  const m = metadataSegura(metadata);
  return {
    tipo: "prompt",
    versao: texto(m["prompt_versao"] ?? m["versao"]),
    publicadoEm: texto(m["publicado_em"] ?? m["prompt_publicado_em"]),
    status: texto(m["prompt_status"] ?? m["status"]),
    modulos: lista(m["modulos"] ?? m["modulos_carregados"]),
    instrucoes: protegido(texto(m["instrucoes"] ?? m["prompt_trecho"]), nivel),
  };
}

// ──────────────────────── CONHECIMENTO / RAG ────────────────────────

export const TIPOS_RECUPERACAO = [
  "estruturada",
  "textual",
  "semantica",
  "rag",
  "desconhecida",
] as const;
export type TipoRecuperacao = (typeof TIPOS_RECUPERACAO)[number];

export type FonteConhecimento = {
  id: string | null;
  titulo: string;
  versao: string | null;
  score: number | null;
  selecionada: boolean;
};

export type DetalheConhecimento = {
  tipo: "conhecimento";
  consulta: string | null;
  recuperacao: TipoRecuperacao;
  fontes: FonteConhecimento[];
  fonteSelecionada: FonteConhecimento | null;
  /** Conteúdo realmente usado na resposta (somente perfil técnico). */
  conteudoUtilizado: string | null;
  /** Fontes descartadas por pertencerem a outro paciente. */
  fontesDeOutroPaciente: number;
  semResultados: boolean;
};

function normalizarRecuperacao(valor: unknown): TipoRecuperacao {
  const bruto = typeof valor === "string" ? valor.toLowerCase() : "";
  return (TIPOS_RECUPERACAO as readonly string[]).includes(bruto)
    ? (bruto as TipoRecuperacao)
    : "desconhecida";
}

export function lerDetalheConhecimento(
  metadata: Record<string, unknown>,
  nivel: NivelAcesso,
  pacienteDaExecucao?: string | null,
): DetalheConhecimento {
  const m = metadataSegura(metadata);
  const brutas = Array.isArray(m["fontes"]) ? (m["fontes"] as unknown[]) : [];
  const idSelecionada = texto(m["fonte_selecionada"]);

  let descartadas = 0;
  const fontes: FonteConhecimento[] = [];
  for (const item of brutas) {
    const f = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const paciente = texto(f["paciente_id"]);
    // Nunca exibir fonte vinculada a outro paciente.
    if (paciente && pacienteDaExecucao && paciente !== pacienteDaExecucao) {
      descartadas += 1;
      continue;
    }
    const id = texto(f["id"]);
    fontes.push({
      id,
      titulo: texto(f["titulo"]) ?? id ?? "fonte sem título",
      versao: texto(f["versao"]),
      score: numero(f["score"] ?? f["relevancia"]),
      selecionada: Boolean(id && idSelecionada && id === idSelecionada),
    });
  }

  return {
    tipo: "conhecimento",
    consulta: texto(m["consulta"] ?? m["query"]),
    recuperacao: normalizarRecuperacao(m["recuperacao"] ?? m["tipo_busca"]),
    fontes,
    fonteSelecionada: fontes.find((f) => f.selecionada) ?? null,
    conteudoUtilizado: protegido(texto(m["conteudo_utilizado"]), nivel),
    fontesDeOutroPaciente: descartadas,
    semResultados: fontes.length === 0,
  };
}

// ─────────────────────────────── IA ───────────────────────────────

export type DetalheIA = {
  tipo: "ia";
  provedor: string | null;
  modelo: string | null;
  horario: string | null;
  latenciaMs: number | null;
  tokensEntrada: number | null;
  tokensSaida: number | null;
  tokensTotais: number | null;
  custoEstimado: number | null;
  chamadas: number | null;
  status: string | null;
  instrucoes: string | null;
  contextoEnviado: string | null;
  conhecimentoRecuperado: string | null;
  toolCalls: string[];
  resultadoEstruturado: string | null;
};

export function lerDetalheIA(
  metadata: Record<string, unknown>,
  nivel: NivelAcesso,
): DetalheIA {
  const m = metadataSegura(metadata);
  const entrada = numero(m["tokens_entrada"] ?? m["prompt_tokens"]);
  const saida = numero(m["tokens_saida"] ?? m["completion_tokens"]);
  const totais =
    numero(m["tokens_totais"] ?? m["total_tokens"]) ??
    (entrada !== null && saida !== null ? entrada + saida : null);

  return {
    tipo: "ia",
    provedor: texto(m["provedor"] ?? m["provider"]),
    modelo: texto(m["modelo"] ?? m["model"]),
    horario: texto(m["horario"] ?? m["started_at"]),
    latenciaMs: numero(m["latencia_ms"] ?? m["duracao_ms"]),
    tokensEntrada: entrada,
    tokensSaida: saida,
    tokensTotais: totais,
    custoEstimado: numero(m["custo_estimado"]),
    chamadas: numero(m["chamadas"] ?? m["rodadas"]),
    status: texto(m["status"]),
    instrucoes: protegido(texto(m["instrucoes"]), nivel),
    contextoEnviado: protegido(texto(m["contexto"] ?? m["contexto_enviado"]), nivel),
    conhecimentoRecuperado: protegido(texto(m["conhecimento"]), nivel),
    toolCalls: lista(m["tool_calls"] ?? m["ferramentas"]),
    resultadoEstruturado: protegido(texto(m["resultado_estruturado"]), nivel),
  };
}

// ────────────────────────────── TOOLS ──────────────────────────────

export type DetalheTool = {
  tipo: "tool";
  ferramenta: string | null;
  /** Argumentos já mascarados (somente perfil técnico). */
  argumentos: Record<string, unknown> | null;
  resultado: string | null;
  validacoes: string[];
  status: string | null;
  latenciaMs: number | null;
  operacaoId: string | null;
  erro: string | null;
};

export function lerDetalheTool(
  metadata: Record<string, unknown>,
  nivel: NivelAcesso,
): DetalheTool {
  const m = metadataSegura(metadata);
  const args =
    m["argumentos"] && typeof m["argumentos"] === "object" && !Array.isArray(m["argumentos"])
      ? (m["argumentos"] as Record<string, unknown>)
      : null;

  return {
    tipo: "tool",
    ferramenta: texto(m["ferramenta"] ?? m["tool"]),
    argumentos: nivel === "admin" ? args : args ? { aviso: RESTRITO } : null,
    resultado: texto(m["resultado"]),
    validacoes: lista(m["validacoes"]),
    status: texto(m["status"]),
    latenciaMs: numero(m["latencia_ms"] ?? m["duracao_ms"]),
    operacaoId: texto(m["operacao_id"] ?? m["operation_id"]),
    erro: texto(m["erro"]),
  };
}

// ─────────────────────── Seleção por componente ───────────────────────

export type DetalheEspecifico =
  | DetalhePrompt
  | DetalheConhecimento
  | DetalheIA
  | DetalheTool
  | null;

const NODES_PROMPT = new Set([
  "prompt.compose",
  "instructions.catalog",
  "instructions.learnings",
]);
const NODES_CONHECIMENTO = new Set([
  "tool.catalog.lookup",
  "tool.knowledge.lookup",
  "tool.business_hours",
]);
const NODES_IA = new Set(["llm.generate", "llm.model_flag"]);

/**
 * Escolhe a leitura adequada ao componente. Componentes fora dos grupos de
 * IA não recebem detalhamento específico (o painel segue mostrando os dados
 * gerais da passagem).
 */
export function lerDetalheEspecifico(
  nodeId: string,
  metadata: Record<string, unknown> | null | undefined,
  nivel: NivelAcesso,
  pacienteDaExecucao?: string | null,
): DetalheEspecifico {
  const dados = metadata ?? {};
  if (NODES_PROMPT.has(nodeId)) return lerDetalhePrompt(dados, nivel);
  if (NODES_CONHECIMENTO.has(nodeId)) {
    return lerDetalheConhecimento(dados, nivel, pacienteDaExecucao);
  }
  if (NODES_IA.has(nodeId)) return lerDetalheIA(dados, nivel);
  if (nodeId.startsWith("tool.")) return lerDetalheTool(dados, nivel);
  return null;
}

/** Rótulo curto de um valor pessoal para exibição em tela. */
export function rotuloPessoal(valor: string | null | undefined): string {
  return valor ? mascarar(valor) : "—";
}
