/**
 * Perfil de atendimento: quem pode ser RESPONSÁVEL por uma conversa.
 *
 * Regra única do sistema: administrador enxerga toda a operação, mas nunca
 * atende paciente. Se a pessoa tem perfil de administrador, ela não recebe
 * conversa por nenhum caminho — automático, fila, transferência ou botão
 * "assumir" — mesmo que também tenha permissão de atendente.
 *
 * O perfil vem de `clinica_memberships.role`, a mesma fonte já usada pelas
 * telas. Não existe flag nova nem segunda lista de administradores.
 */

/** Perfil que nunca recebe conversa de atendimento. */
export const PERFIL_ADMIN = "admin";

/** Mensagem única mostrada quando um administrador tenta atender. */
export const MSG_ADMIN_NAO_ATENDE =
  "Administrador acompanha as conversas, mas não pode assumir nem responder ao paciente.";

/** Mensagem única mostrada quando alguém tenta transferir para quem está em pausa. */
export const MSG_DESTINO_EM_PAUSA =
  "Esta pessoa está em pausa e não pode receber conversas. Escolha alguém que esteja Online.";

/** Quem está em Pausa ou em Pausa para saída não recebe transferência manual. */
export function estadoBloqueiaTransferencia(estadoManual: string | null | undefined): boolean {
  return estadoManual === "PAUSA" || estadoManual === "PAUSA_SAIDA";
}

/** É perfil de administrador? */
export function ehPerfilAdmin(role: string | null | undefined): boolean {
  return (role ?? "").trim().toLowerCase() === PERFIL_ADMIN;
}

/**
 * Pode receber/assumir conversa? Administrador nunca pode; a condição de
 * administrador prevalece sobre qualquer outra permissão da pessoa.
 */
export function podeReceberConversa(role: string | null | undefined): boolean {
  return !ehPerfilAdmin(role);
}

/** Filtra uma lista de pessoas deixando só quem pode receber conversa. */
export function apenasDestinatariosValidos<T extends { role?: string | null }>(
  pessoas: readonly T[],
): T[] {
  return pessoas.filter((p) => podeReceberConversa(p.role));
}

/* ---------------------------------------------------------------
 * Presença exibida ao lado do nome na transferência.
 * Fonte já existente: `atend_agente_presenca` + `atend_pausas_log`.
 * ------------------------------------------------------------- */

export type PresencaAtendente = "ONLINE" | "PAUSA" | "PAUSA_SAIDA" | "OFFLINE";

/**
 * FASE 2 — a presença é MANUAL. `visto_em` (heartbeat) é apenas sinal técnico
 * de conexão e não participa mais deste cálculo: aba oculta, queda de rede,
 * página fechada ou heartbeat vencido não derrubam a escolha do atendente.
 */
export function statusPresenca(p: {
  status: string | null | undefined;
  /** Informativo apenas — mantido por compatibilidade de chamadas. */
  vistoEm?: string | null | undefined;
  emPausa: boolean;
}): PresencaAtendente {
  // A pausa para saída é um estado próprio; não se confunde com a pausa comum.
  if ((p.status ?? "").toUpperCase() === "PAUSA_SAIDA") return "PAUSA_SAIDA";
  // Pausa livre não cria o registro legado com motivo; a escolha manual basta.
  if (p.emPausa || (p.status ?? "").toUpperCase() === "PAUSA") return "PAUSA";
  if ((p.status ?? "").toUpperCase() === "ONLINE") return "ONLINE";
  return "OFFLINE";
}

/** Texto do status (a cor nunca é a única informação). */
export const ROTULO_PRESENCA: Record<PresencaAtendente, string> = {
  ONLINE: "Online",
  PAUSA: "Em pausa",
  PAUSA_SAIDA: "Em pausa para saída",
  OFFLINE: "Offline",
};
