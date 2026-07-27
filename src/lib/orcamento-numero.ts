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