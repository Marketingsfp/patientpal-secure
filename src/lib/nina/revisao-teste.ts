/**
 * FASE 9 — Achado do avaliador (Sol) → item da Revisão de aprendizados.
 *
 * Este módulo é puro (sem banco, sem rede) e concentra as decisões que
 * precisam ser previsíveis e testáveis:
 *
 *  - traduzir o achado do Sol para a classificação já usada pela Revisão;
 *  - definir prioridade e causa provável a partir da gravidade/componente;
 *  - montar o texto e o bloco de evidência do item de revisão;
 *  - montar o rascunho do cenário de regressão a partir do achado.
 *
 * IMPORTANTE — o Sol apenas PROPÕE. Nada aqui edita o Prompt Principal,
 * publica instruções, altera a Base de Conhecimentos, muda código ou cria
 * regra definitiva. O item nasce com status `pending`, para decisão humana.
 */

import type { Achado, Confianca, Gravidade } from "@/lib/nina/avaliador-sol";
import type { Criterio } from "@/lib/nina/cenarios";

/** Origem gravada em `nina_feedback_erros.origem` para achados do avaliador. */
export const ORIGEM_AVALIACAO_TESTE = "nina_test_evaluation";

/**
 * Tradução do componente apontado pelo Sol para a classificação existente da
 * Revisão de aprendizados. Quando não há correspondência clara, o item entra
 * como "a classificar" — nunca em uma categoria adivinhada.
 */
const REGRAS_CATEGORIA: { termos: string[]; categoria: string }[] = [
  { termos: ["preco", "preço", "valor", "tabela"], categoria: "valor_incorreto" },
  { termos: ["medico", "médico", "profissional"], categoria: "medico_incorreto" },
  { termos: ["unidade", "endereco", "endereço"], categoria: "unidade_incorreta" },
  { termos: ["horario", "horário", "agenda", "disponibilidade", "vaga"], categoria: "horario_incorreto" },
  { termos: ["procedimento", "exame", "catalogo", "catálogo"], categoria: "procedimento_incorreto" },
  { termos: ["preparo", "jejum", "orientacao", "orientação"], categoria: "preparo_incorreto" },
  { termos: ["alucin", "inventad", "sem respaldo", "sem embasamento"], categoria: "informacao_inventada" },
  { termos: ["nao encontrou", "não encontrou", "rag", "conhecimento", "base de conhecimento"], categoria: "informacao_nao_encontrada" },
  { termos: ["transferencia", "transferência", "handoff"], categoria: "handoff_deveria_ocorrer" },
  { termos: ["incompleta", "faltou responder"], categoria: "resposta_incompleta" },
  { termos: ["interpret", "entendimento", "memoria", "memória"], categoria: "interpretacao_incorreta" },
];

/** Categoria neutra: o humano classifica na Revisão. */
export const CATEGORIA_PADRAO_ACHADO = "nao_classificado";

export function categoriaDoAchado(achado: Pick<Achado, "componente" | "observado" | "dimensao">): string {
  const texto = `${achado.componente ?? ""} ${achado.observado ?? ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  for (const regra of REGRAS_CATEGORIA) {
    if (
      regra.termos.some((t) =>
        texto.includes(t.normalize("NFD").replace(/[\u0300-\u036f]/g, "")),
      )
    ) {
      return regra.categoria;
    }
  }
  if (achado.dimensao === "nao_alucinacao") return "informacao_inventada";
  if (achado.dimensao === "transferencia") return "handoff_deveria_ocorrer";
  if (achado.dimensao === "uso_rag") return "informacao_nao_encontrada";
  return CATEGORIA_PADRAO_ACHADO;
}

/** Prioridade da fila a partir da gravidade atribuída pelo avaliador. */
export function prioridadeDoAchado(gravidade: Gravidade | null | undefined): "critico" | "alto" | "normal" {
  if (gravidade === "critica") return "critico";
  if (gravidade === "alta") return "alto";
  return "normal";
}

/**
 * Causa provável (root cause) sugerida. É só uma sugestão de triagem: o campo
 * continua editável pelo humano na Revisão.
 */
export function rootCauseDoAchado(
  achado: Pick<Achado, "componente" | "dimensao">,
): string | null {
  const comp = (achado.componente ?? "").toLowerCase();
  if (comp.includes("ferramenta") || comp.includes("tool") || comp.includes("integra")) return "tool_error";
  if (comp.includes("agenda") || comp.includes("disponibilidade")) return "tool_error";
  if (comp.includes("catálogo") || comp.includes("catalogo") || comp.includes("conhecimento")) {
    return "knowledge_error";
  }
  if (comp.includes("busca") || comp.includes("recupera")) return "retrieval_error";
  if (achado.dimensao === "nao_alucinacao") return "hallucination";
  if (achado.dimensao === "coerencia" || achado.dimensao === "qualidade_resposta") return "reasoning_error";
  if (achado.dimensao === "aderencia_instrucoes") return "workflow_error";
  return null;
}

/** Confiança em texto curto para o histórico da Revisão. */
export function rotuloConfianca(c: Confianca | null | undefined): string {
  return c === "alta" ? "alta" : c === "media" ? "média" : c === "baixa" ? "baixa" : "não informada";
}

export type ContextoAchado = {
  /** Identificação da execução de teste de onde veio o achado. */
  testeTipo: "manual" | "terra" | "cenarios" | "carga";
  testeExecucaoId: string | null;
  cenarioTexto: string | null;
  cenarioId: string | null;
  leadIndice: number | null;
  conversaId: string;
  avaliacaoId: string;
  avaliacaoResultado: string | null;
  avaliacaoScore: number | null;
  avaliacaoResumo: string | null;
  modeloAvaliador: string | null;
  promptVersao: number | null;
  promptVersaoId: string | null;
  traceIds: string[];
  /** Mensagem do paciente que originou o turno avaliado (quando localizada). */
  mensagemPaciente: string | null;
  /** Resposta da Nina relacionada ao achado (quando localizada). */
  respostaNina: string | null;
  mensagemId: string | null;
  /** Fontes consultadas (conhecimento) e chamadas de ferramenta daquela conversa. */
  fontes: string[];
  toolCalls: { ferramenta: string; ok: boolean; erro?: string | null }[];
};

/** Texto da "correção" (o que deveria ter acontecido), exigido pela fila. */
export function correcaoDoAchado(achado: Achado): string {
  return achado.esperado?.trim() || "Comportamento esperado não descrito pelo avaliador.";
}

/** Observação com o rastro humano-legível do achado. */
export function observacaoDoAchado(achado: Achado, ctx: ContextoAchado): string {
  const linhas = [
    `Achado da avaliação automática (${ctx.modeloAvaliador ?? "avaliador"}).`,
    ctx.cenarioTexto ? `Cenário: ${ctx.cenarioTexto}` : null,
    ctx.leadIndice !== null ? `Lead de teste: ${String(ctx.leadIndice).padStart(2, "0")}` : null,
    `Observado: ${achado.observado}`,
    `Esperado: ${achado.esperado}`,
    `Evidência: ${achado.fonte}`,
    `Componente provável: ${achado.componente} (confiança ${rotuloConfianca(achado.confianca)})`,
    ctx.avaliacaoScore !== null ? `Score da execução: ${ctx.avaliacaoScore}/100` : null,
  ].filter(Boolean);
  return linhas.join("\n").slice(0, 4000);
}

/**
 * Bloco de evidência gravado junto ao item — é o que a Fase 9 pede que o item
 * contenha (execução, cenário, lead, mensagem, resposta, avaliação, evidência,
 * classificação, trace, versão do prompt, fontes e tool calls).
 */
export function evidenciaDoAchado(achado: Achado, ctx: ContextoAchado, indice: number) {
  return {
    versao: 1,
    achado_indice: indice,
    teste: {
      tipo: ctx.testeTipo,
      execucao_id: ctx.testeExecucaoId,
      cenario_id: ctx.cenarioId,
      cenario: ctx.cenarioTexto,
      lead_indice: ctx.leadIndice,
      conversa_id: ctx.conversaId,
    },
    mensagem_paciente: ctx.mensagemPaciente,
    resposta_nina: ctx.respostaNina,
    avaliacao: {
      id: ctx.avaliacaoId,
      modelo: ctx.modeloAvaliador,
      resultado: ctx.avaliacaoResultado,
      score: ctx.avaliacaoScore,
      resumo: ctx.avaliacaoResumo,
    },
    achado: {
      mensagem: achado.mensagem,
      observado: achado.observado,
      esperado: achado.esperado,
      fonte: achado.fonte,
      componente: achado.componente,
      confianca: achado.confianca,
      gravidade: achado.gravidade,
      dimensao: achado.dimensao,
    },
    classificacao: {
      categoria: categoriaDoAchado(achado),
      prioridade: prioridadeDoAchado(achado.gravidade),
      root_cause: rootCauseDoAchado(achado),
    },
    trace_ids: ctx.traceIds,
    prompt: { versao: ctx.promptVersao, versao_id: ctx.promptVersaoId },
    fontes: ctx.fontes,
    tool_calls: ctx.toolCalls,
  };
}

/* ------------------------------------------------------------------ */
/* Teste de regressão                                                   */
/* ------------------------------------------------------------------ */

/**
 * Só um erro já analisado por um humano vira teste de regressão. Não basta o
 * Sol ter apontado: alguém precisa ter confirmado o problema ou aprovado /
 * aplicado a correção.
 */
export function podeVirarRegressao(item: {
  status?: string | null;
  decisao_humana?: string | null;
}): boolean {
  if (item.decisao_humana === "problema_confirmado") return true;
  return item.status === "approved" || item.status === "applied";
}

export function motivoBloqueioRegressao(item: {
  status?: string | null;
  decisao_humana?: string | null;
}): string | null {
  if (podeVirarRegressao(item)) return null;
  if (item.decisao_humana === "falso_positivo")
    return "Este achado foi marcado como falso positivo na Revisão.";
  return "Confirme o problema (ou aprove a correção) na Revisão de aprendizados antes de criar o teste de regressão.";
}

/**
 * Rascunho do cenário de regressão. Os critérios saem do que o achado diz que
 * deveria ter acontecido — nada é inventado: quando não dá para derivar um
 * critério verificável, fica apenas "não pode ocorrer erro técnico" e o humano
 * completa o cenário na biblioteca.
 */
export function rascunhoCenarioRegressao(input: {
  mensagemPaciente: string | null;
  achado: Pick<Achado, "observado" | "esperado" | "componente" | "dimensao">;
  cenarioTexto: string | null;
  toolCalls: { ferramenta: string }[];
}): {
  nome: string;
  categoria: "regressao";
  objetivo: string;
  descricao: string;
  criterios: Criterio[];
  tags: string[];
  maxTurnos: number;
  dadosSinteticos: Record<string, unknown>;
} {
  const base = (input.cenarioTexto ?? input.mensagemPaciente ?? input.achado.observado ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const nome = `Regressão — ${base.slice(0, 90) || "achado da homologação"}`;

  const criterios: Criterio[] = [{ tipo: "sem_erro" }];
  if (input.achado.dimensao === "transferencia") criterios.push({ tipo: "transferiu" });
  const ferramenta = input.toolCalls[0]?.ferramenta;
  if (ferramenta) criterios.push({ tipo: "usou_ferramenta", valor: ferramenta });

  return {
    nome,
    categoria: "regressao",
    objetivo: (input.achado.esperado ?? "Reproduzir o cenário corrigido.").slice(0, 600),
    descricao: [
      "Cenário criado a partir de um erro confirmado na homologação.",
      `Observado antes da correção: ${input.achado.observado}`,
      `Esperado: ${input.achado.esperado}`,
      input.mensagemPaciente ? `Mensagem inicial do paciente: ${input.mensagemPaciente}` : "",
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 1000),
    criterios,
    tags: ["regressao", "homologacao"],
    maxTurnos: 6,
    dadosSinteticos: input.mensagemPaciente ? { primeira_mensagem: input.mensagemPaciente } : {},
  };
}
