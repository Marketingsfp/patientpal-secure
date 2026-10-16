/**
 * Contatos bloqueados no atendimento (decisão do usuário, 16/10/2026).
 * Bloqueio no sistema: a mensagem do número continua guardada, mas a Nina não
 * responde, a conversa não entra na fila e ninguém é notificado. Só supervisão
 * e administração bloqueiam (regra `atend_pode_bloquear_contato` no banco).
 */

/** Só os dígitos do telefone, como o banco guarda e compara. */
export function telefoneDoBloqueio(telefone: string | null | undefined): string | null {
  const digitos = String(telefone ?? "").replace(/\D/g, "");
  return /^[0-9]{8,15}$/.test(digitos) ? digitos : null;
}

export const MSG_SEM_PERMISSAO_BLOQUEIO =
  "Só a supervisão e a administração podem bloquear ou desbloquear contatos.";
