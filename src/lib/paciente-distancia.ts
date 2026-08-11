/**
 * Alerta de paciente vindo de município distante.
 *
 * Regra: só é "de longe" quando a cidade está preenchida e NÃO pertence ao
 * grupo de cidades vizinhas de São João de Meriti (Baixada Fluminense).
 * Cidades vizinhas não geram alerta de prioridade.
 */
export const LOCAL_CITIES = [
  "são joão de meriti",
  "belford roxo",
  "nilópolis",
  "mesquita",
  "duque de caxias",
  "nova iguaçu",
];

/** minúsculas + sem acentos + espaços normalizados. */
export function normalizarCidade(cidade: string | null | undefined): string {
  return (cidade ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const LOCAIS_NORMALIZADAS = new Set(LOCAL_CITIES.map(normalizarCidade));

export function isPacienteDistante(cidade: string | null | undefined): boolean {
  const c = normalizarCidade(cidade);
  if (!c) return false;
  return !LOCAIS_NORMALIZADAS.has(c);
}
