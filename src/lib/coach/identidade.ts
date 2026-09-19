/**
 * Identidade da atendente nas tabelas `coach_*`.
 *
 * O histórico importado do projeto antigo ficou com `user_id` nulo e só o nome
 * escrito à mão. Os registros novos gravam sempre o `user_id` da pessoa
 * avaliada. Para as duas coisas conviverem, toda leitura da trilha usa o mesmo
 * recorte: é meu quando o `user_id` é o meu OU quando não há `user_id` e o nome
 * bate com o do meu perfil.
 */

/** Trecho `or(...)` do PostgREST com o recorte acima. */
export function filtroDoAtendente(userId: string | null, nome: string): string {
  const seguro = nome.replace(/["\\]/g, " ").trim();
  const porNome = `and(user_id.is.null,atendente.eq."${seguro}")`;
  return userId ? `user_id.eq.${userId},${porNome}` : porNome;
}

/** Mesma regra aplicada a uma linha já carregada na memória. */
export function ehDoAtendente(
  linha: { user_id?: string | null; atendente?: string | null },
  userId: string | null,
  nome: string,
): boolean {
  if (linha.user_id) return Boolean(userId) && linha.user_id === userId;
  return (linha.atendente ?? "").trim().toLowerCase() === nome.trim().toLowerCase();
}

/**
 * Escopo do que fica guardado no aparelho (rascunho do treino, prova em
 * andamento, dificuldade). Antes a chave era só o nome, então dois usuários no
 * mesmo computador — ou a mesma pessoa em duas clínicas — misturavam estado.
 */
export function escopoLocalCoach(
  clinicaId: string | null,
  userId: string | null,
  nome = "",
): string {
  return `${clinicaId ?? "sem-clinica"}:${userId ?? (nome.trim().toLowerCase() || "anonimo")}`;
}
