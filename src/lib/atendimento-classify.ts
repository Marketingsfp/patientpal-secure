/**
 * Classifica um lançamento financeiro em uma categoria de atendimento,
 * com base na descrição. Mensalidades, adesões e vendas de cartão NÃO são
 * atendimentos e retornam null.
 */
export type AtendCat = "cartao_consulta" | "consulta_particular" | "exame";

export function classifyAtendimento(descricao: string | null | undefined): AtendCat | null {
  if (!descricao) return null;
  const d = descricao.toUpperCase();
  // Vendas/adesões de cartão de benefícios não são atendimentos
  if (d.includes("ADESAO") || d.includes("ADESÃO")) return null;
  if (d.includes("CARTAO CONSULTA + SEGUROS") || d.includes("CARTÃO CONSULTA")) return null;
  if (d.includes("CARTAO BENEFICIOS") || d.includes("CARTÃO BENEFÍCIOS")) return null;
  if (d.includes("CONSULTA CARTAO") || d.includes("CONSULTA CARTÃO")) return "cartao_consulta";
  if (d.includes("EXAME CARTAO") || d.includes("EXAME CARTÃO")) return "exame";
  // "CONTRATO" na planilha legada veio rotulado errado — são consultas particulares
  if (d.includes("CONTRATO")) return "consulta_particular";
  if (d.includes("CONSULTA")) return "consulta_particular";
  // Demais procedimentos particulares (laboratório, raio-x, ultrassom, etc.) = exames
  return "exame";
}

export const CAT_LABELS: Record<AtendCat, string> = {
  cartao_consulta: "Consultas Cartão",
  consulta_particular: "Consultas Particulares",
  exame: "Exames",
};