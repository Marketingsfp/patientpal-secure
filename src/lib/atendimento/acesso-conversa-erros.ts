export const ERRO_CONVERSA_NAO_ENCONTRADA = "CONVERSA_NAO_ENCONTRADA";
export const ERRO_CONVERSA_SEM_PERMISSAO = "CONVERSA_SEM_PERMISSAO";
export const MSG_CONVERSA_NAO_ENCONTRADA = "Conversa não encontrada.";
export const MSG_CONVERSA_SEM_PERMISSAO =
  "Você não possui permissão para visualizar esta conversa.";

/** Falha de rede/servidor não comprova que uma conversa deixou de ser acessível. */
export function erroConfirmaConversaIndisponivel(erro: unknown): boolean {
  if (!erro || typeof erro !== "object") return false;
  const { motivo, message } = erro as { motivo?: unknown; message?: unknown };
  return (
    motivo === ERRO_CONVERSA_NAO_ENCONTRADA ||
    motivo === ERRO_CONVERSA_SEM_PERMISSAO ||
    message === MSG_CONVERSA_NAO_ENCONTRADA ||
    message === MSG_CONVERSA_SEM_PERMISSAO
  );
}
