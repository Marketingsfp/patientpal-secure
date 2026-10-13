/**
 * Normalização de telefone vindo da telefonia (Sufficit). Puro, sem I/O.
 * Formatos vistos na API: "+55" + 11 dígitos (13 no total), 10 dígitos sem DDI
 * e "+" com 12 dígitos (55 + DDD + fixo de 8).
 */
export type TelefoneNormalizado = { e164: string | null; original: string };

export function normalizarTelefone(valor: unknown): TelefoneNormalizado {
  const original = typeof valor === "string" ? valor : valor == null ? "" : String(valor);
  const d = original.replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return { e164: `+${d}`, original };
  if (d.length === 10 || d.length === 11) return { e164: `+55${d}`, original };
  return { e164: null, original };
}
