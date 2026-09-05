/**
 * FASE 3 — movimentação em tempo real entre as Inboxes.
 *
 * A lista devolvida pelo backend já é a verdade do escopo atual (Minhas,
 * Nina, Não atribuídas, Fechadas, Todas). Aqui ficam só as decisões puras que
 * a tela precisa tomar quando essa lista muda: se a conversa aberta deixou de
 * pertencer ao usuário/filtro e qual aviso mostrar.
 */
import type { EscopoInbox } from "./escopo-inbox";

export type LinhaInbox = { id: string };

/**
 * A conversa aberta continua no escopo atual? Enquanto a lista ainda não
 * chegou (ou não há seleção) nada é removido.
 */
export function selecaoSaiuDoEscopo(
  selecionadaId: string | null,
  linhas: LinhaInbox[] | null | undefined,
): boolean {
  if (!selecionadaId || !linhas) return false;
  return !linhas.some((l) => l.id === selecionadaId);
}

/** Aviso curto, em linguagem do dia a dia, ao perder a conversa da tela. */
export function avisoSaidaEscopo(escopo: EscopoInbox): string {
  switch (escopo) {
    case "minhas":
      return "Esta conversa não está mais com você.";
    case "nina":
      return "Esta conversa não está mais com a Nina.";
    case "nao_atribuidas":
      return "Esta conversa já tem responsável.";
    case "fechadas":
      return "Esta conversa foi reaberta.";
    default:
      return "Esta conversa saiu deste filtro.";
  }
}

/**
 * Depois de uma conversa sair do escopo, a tela não deve escolher outra
 * sozinha — quem atende decide o próximo atendimento.
 */
export function devoAutoSelecionar(args: {
  temSelecao: boolean;
  removeuAgora: boolean;
  primeiraLinha: LinhaInbox | null | undefined;
}): boolean {
  if (args.temSelecao || args.removeuAgora) return false;
  return !!args.primeiraLinha;
}
