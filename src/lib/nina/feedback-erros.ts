/**
 * Feedback de erros da Nina — catálogo compartilhado (UI + servidor).
 *
 * FASE 1: registrar o erro é APENAS registro. Nada aqui altera catálogo,
 * Base de Conhecimentos, embeddings, prompt, modelo, regras ou ferramentas.
 */

export const CATEGORIAS_FEEDBACK_NINA = [
  { valor: "valor_incorreto", rotulo: "Valor incorreto" },
  { valor: "medico_incorreto", rotulo: "Médico incorreto" },
  { valor: "unidade_incorreta", rotulo: "Unidade incorreta" },
  { valor: "horario_incorreto", rotulo: "Horário/dia incorreto" },
  { valor: "procedimento_incorreto", rotulo: "Procedimento incorreto" },
  { valor: "preparo_incorreto", rotulo: "Preparo incorreto" },
  { valor: "informacao_inexistente", rotulo: "Informação inexistente" },
  { valor: "informacao_inventada", rotulo: "Informação inventada" },
  { valor: "informacao_nao_encontrada", rotulo: "Informação existente não encontrada" },
  { valor: "handoff_deveria_ocorrer", rotulo: "Handoff deveria ter ocorrido" },
  { valor: "handoff_desnecessario", rotulo: "Handoff desnecessário" },
  { valor: "resposta_incompleta", rotulo: "Resposta incompleta" },
  { valor: "interpretacao_incorreta", rotulo: "Interpretação incorreta" },
  { valor: "outro", rotulo: "Outro" },
] as const;

export type CategoriaFeedbackNina = (typeof CATEGORIAS_FEEDBACK_NINA)[number]["valor"];

export const VALORES_CATEGORIA_FEEDBACK = CATEGORIAS_FEEDBACK_NINA.map(
  (c) => c.valor,
) as unknown as [CategoriaFeedbackNina, ...CategoriaFeedbackNina[]];

export function rotuloCategoriaFeedback(valor: string): string {
  return CATEGORIAS_FEEDBACK_NINA.find((c) => c.valor === valor)?.rotulo ?? valor;
}
