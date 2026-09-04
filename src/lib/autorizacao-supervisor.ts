/**
 * Quem pode autorizar cada ação privilegiada do sistema.
 *
 * Vive num arquivo sem nenhum import porque a mesma tabela é lida em três
 * lugares que não podem divergir: a tela (para saber se pede senha), a server
 * function que confere a senha e — no caso do sem faturamento — o gatilho do
 * banco. Se ela morasse junto de um módulo de tela, o código de servidor
 * arrastaria o cliente Supabase do navegador só para ler uma lista de papéis.
 *
 * As alçadas são diferentes de propósito:
 *
 *   - DESCONTO e CORTESIA reduzem um valor que a clínica ia receber, e o
 *     financeiro participa dessa decisão no dia a dia.
 *   - SEM FATURAMENTO apaga a cobrança inteira e some com o atendimento do
 *     caixa. É decisão de supervisão, não de conferência financeira, então o
 *     papel `financeiro` fica de fora e entra o `supervisor`.
 *
 * O escopo é sempre resolvido NO SERVIDOR a partir deste mapa. A tela nunca
 * manda a lista de papéis: se mandasse, bastaria adulterar a chamada para
 * pedir a autorização de qualquer perfil.
 */
export const ESCOPOS_AUTORIZACAO = {
  /** Isentar um atendimento de cobrança (Agenda → sem faturamento). */
  sem_faturamento: ["admin", "gestor", "supervisor"],
  /** Abater valor ou lançar cortesia (Agenda e Financeiro). */
  desconto: ["admin", "gestor", "financeiro"],
  /** Atender um paciente apesar de débito em atraso. */
  liberar_debito: ["admin", "gestor", "financeiro"],
} as const;

export type EscopoAutorizacao = keyof typeof ESCOPOS_AUTORIZACAO;

/** Papéis com alçada para o escopo pedido. */
export function rolesDoEscopo(escopo: EscopoAutorizacao): readonly string[] {
  return ESCOPOS_AUTORIZACAO[escopo];
}

/** true → este papel autoriza sozinho, sem precisar da senha de outra pessoa. */
export function podeAutorizar(escopo: EscopoAutorizacao, role: string | null | undefined): boolean {
  return rolesDoEscopo(escopo).includes(role ?? "");
}

/**
 * Nomes dos papéis em português, para a tela dizer a quem chamar.
 *
 * Antes o texto era fixo em "admin, gestor ou financeiro" em todos os
 * diálogos, o que mandava a funcionária chamar exatamente quem o sistema ia
 * recusar em seguida no caso do sem faturamento.
 */
const ROTULO_ROLE: Record<string, string> = {
  admin: "administrador",
  gestor: "gestor",
  financeiro: "financeiro",
  supervisor: "supervisor",
  caixa: "caixa",
  recepcao: "recepção",
};

/** "administrador, gestor ou supervisor" — para frases de tela. */
export function listaDePapeis(escopo: EscopoAutorizacao): string {
  const nomes = rolesDoEscopo(escopo).map((r) => ROTULO_ROLE[r] ?? r);
  if (nomes.length <= 1) return (nomes[0] ?? "supervisor") as string;
  return `${nomes.slice(0, -1).join(", ")} ou ${nomes[nomes.length - 1]}`;
}
