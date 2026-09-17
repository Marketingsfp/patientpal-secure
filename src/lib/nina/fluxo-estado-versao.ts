/**
 * Compara a versão lida sem colocar o estado inteiro (dados do paciente e
 * opções de agenda) na URL do PostgREST. Os campos da reserva também protegem
 * estados legados que ainda não têm updated_at.
 */
export function filtrosVersaoFluxo(bruto: unknown): Array<[string, string | null]> {
  return [
    ["session_id"],
    ["updated_at"],
    ["flow", "stage"],
    ["appointment", "appointment_id"],
    ["appointment", "confirmed_in_session"],
  ].map((caminho) => {
    let valor = bruto;
    for (const campo of caminho) {
      valor = valor && typeof valor === "object" ? (valor as Record<string, unknown>)[campo] : null;
    }
    const coluna =
      "nina_fluxo_estado" +
      caminho.map((campo, i) => `${i === caminho.length - 1 ? "->>" : "->"}${campo}`).join("");
    return [coluna, typeof valor === "string" ? valor : null];
  });
}
