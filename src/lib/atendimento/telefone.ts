/**
 * Regra única de normalização de telefone do sistema.
 *
 * É a mesma regra usada no banco pela função `public.normalizar_telefone`
 * (colunas geradas `atend_conversas.contato_telefone_norm`,
 * `pacientes.telefone_norm` / `telefone2_norm`). Qualquer mudança aqui
 * precisa ser espelhada lá — caso contrário o vínculo por telefone deixa
 * de casar.
 *
 * Formato: apenas dígitos, sem DDI 55, no máximo os últimos 11 dígitos.
 */
export function normalizarTelefone(valor: string | null | undefined): string | null {
  const d = String(valor ?? "").replace(/\D/g, "");
  if (!d) return null;
  const semDdi = d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
  const norm = semDdi.slice(-11);
  return norm || null;
}
