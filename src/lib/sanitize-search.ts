/**
 * Remove caracteres reservados do PostgREST usados em `.or()`, `.ilike()`,
 * etc., para evitar injeção de filtros quando um valor vindo do usuário
 * é interpolado em uma string de filtro.
 *
 * Mesma abordagem usada em `atendimento.functions.ts` (busca de conversas).
 */
export function sanitizePostgrestSearch(input: string): string {
  return (input ?? "").replace(/[%_,.()'"\\:*]/g, "").trim();
}