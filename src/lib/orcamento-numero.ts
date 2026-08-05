/**
 * Formata o número do orçamento considerando a série.
 * Série "D" (Odontologia) → "D-2026-00001". Sem série → "202600001".
 */
export function formatNumeroOrcamento(
  serie: string | null | undefined,
  numero: number | null | undefined,
): string {
  const n = Number(numero ?? 0);
  const s = (serie ?? "").trim().toUpperCase();
  if (!s) return String(n);
  const ano = Math.floor(n / 100000);
  const seq = n % 100000;
  return `${s}-${ano}-${String(seq).padStart(5, "0")}`;
}

/**
 * Interpreta o que o usuário digitou no campo "Nº do orçamento".
 * Aceita:
 *   "D-2026-00001" / "d 2026 00001" / "D202600001" → { serie: "D", numero: 202600001 }
 *   "202600087"                                     → { serie: null, numero: 202600087 }
 *   "87" / "00087"                                  → { serie: null, numero: 87,
 *                                                        numeroAlternativo: <ano>00087 }
 */
export function parseNumeroOrcamento(input: string): {
  serie: string | null;
  numero: number | null;
  numeroAlternativo: number | null;
} {
  const raw = (input ?? "").trim().toUpperCase();
  const letras = raw.replace(/[^A-Z]/g, "");
  const serie = letras ? letras[0] : null;
  const digitos = raw.replace(/\D/g, "");
  if (!digitos) return { serie, numero: null, numeroAlternativo: null };

  const n = parseInt(digitos, 10);
  if (!Number.isFinite(n) || n <= 0) return { serie, numero: null, numeroAlternativo: null };

  // Formato completo (ano + 5 dígitos) → 9 dígitos.
  if (digitos.length >= 8) return { serie, numero: n, numeroAlternativo: null };

  // Número curto: tenta o valor exato e também como sequência do ano corrente.
  const ano = new Date().getFullYear();
  const alt = ano * 100000 + (n % 100000);
  return { serie, numero: n, numeroAlternativo: alt === n ? null : alt };
}