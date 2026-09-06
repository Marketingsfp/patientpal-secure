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

export type PresencaAtendente = "ONLINE" | "PAUSA" | "OFFLINE";

/** Janela em que o heartbeat de presença ainda vale (igual à distribuição). */
const PRESENCA_VALIDA_MS = 5 * 60 * 1000;

export function statusPresenca(p: {
  status: string | null | undefined;
  vistoEm: string | null | undefined;
  emPausa: boolean;
}): PresencaAtendente {
  if (p.emPausa) return "PAUSA";
  const visto = p.vistoEm ? Date.parse(p.vistoEm) : NaN;
  const recente = Number.isFinite(visto) && Date.now() - visto < PRESENCA_VALIDA_MS;
  if ((p.status ?? "").toUpperCase() === "ONLINE" && recente) return "ONLINE";
  return "OFFLINE";
}

/** Texto do status (a cor nunca é a única informação). */
export const ROTULO_PRESENCA: Record<PresencaAtendente, string> = {
  ONLINE: "Online",
  PAUSA: "Em pausa",
  OFFLINE: "Offline",
};
