/**
 * Quem pode isentar um atendimento de cobrança.
 *
 * Vive num arquivo próprio, sem nenhum import, porque a mesma lista é lida em
 * três lugares que não podem divergir: a tela da Agenda, a server function que
 * confere a senha do supervisor e o gatilho do banco. Se ela morasse em
 * `sem-faturamento.ts`, o código de servidor arrastaria junto o cliente
 * Supabase do navegador só para ler um array de três palavras.
 */
export const ROLES_AUTORIZAM_SEM_FATURAMENTO = ["admin", "gestor", "supervisor"] as const;

/** true → o papel deste usuário pode marcar/desmarcar sozinho, sem pedir senha. */
export function podeAutorizarSemFaturamento(role: string | null | undefined): boolean {
  return (ROLES_AUTORIZAM_SEM_FATURAMENTO as readonly string[]).includes(role ?? "");
}
