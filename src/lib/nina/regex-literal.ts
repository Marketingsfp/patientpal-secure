/**
 * Texto do catálogo ou do paciente dentro de uma expressão regular, como texto
 * literal. "EAS (URINA TIPO I)" virava a palavra "(urina", e `\b(urina\b`
 * derrubava o turno inteiro da Nina (homologação 15/10/2026, 7 ciclos com
 * "Invalid regular expression: Unterminated group").
 */
export function literalRegex(texto: string): string {
  return String(texto ?? "").replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}
