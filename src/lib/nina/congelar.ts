/**
 * Congela um objeto e tudo dentro dele. Usado no catálogo compartilhado entre
 * as respostas da Nina (16/10/2026): em vez de uma cópia completa por
 * ferramenta, todas leem o mesmo objeto, e uma alteração por engano falha na
 * hora em vez de contaminar a resposta de outro paciente.
 */
export function congelarProfundo<T>(valor: T): T {
  if (valor === null || typeof valor !== "object" || Object.isFrozen(valor)) return valor;
  Object.freeze(valor);
  for (const filho of Object.values(valor as Record<string, unknown>)) congelarProfundo(filho);
  return valor;
}
