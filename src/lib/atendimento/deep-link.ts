/**
 * FASE 2 — Deep link, refresh (F5) e Voltar/Avançar do navegador.
 *
 * A URL representa a CONVERSA (nunca a sessão da Nina). Estas funções são
 * puras: decidem em qual filtro a conversa apontada pelo endereço deve ser
 * mostrada e impedem que a tela troque sozinha a conversa pedida no link.
 */
import {
  conversaVisivelNoEscopo,
  type ConversaEscopo,
  type EscopoInbox,
} from "./escopo-inbox";

/**
 * Quando o endereço já indica uma conversa, a Inbox NÃO pode escolher outra
 * automaticamente — senão um link colado ou um F5 abriria a conversa errada.
 */
export function devoAutoSelecionarComUrl(args: {
  conversaIdUrl: string | null | undefined;
  temSelecao: boolean;
  removeuAgora: boolean;
  temPrimeiraLinha: boolean;
}): boolean {
  if (args.conversaIdUrl) return false;
  if (args.temSelecao || args.removeuAgora) return false;
  return args.temPrimeiraLinha;
}

/**
 * Filtro em que a conversa do link é visível. Mantém o filtro atual sempre que
 * a conversa couber nele; caso contrário escolhe o filtro correspondente ao
 * estado real da conversa (Nina, Não atribuídas, Fechadas, Minhas, Equipe).
 *
 * Retorna null quando o usuário não tem nenhum filtro capaz de mostrá-la.
 */
export function escopoParaConversa(
  conversa: ConversaEscopo,
  args: { escopoAtual: EscopoInbox; userId: string; gestor: boolean },
): EscopoInbox | null {
  const candidatos: EscopoInbox[] = [
    args.escopoAtual,
    "minhas",
    "nina",
    "nao_atribuidas",
    "fechadas",
    "equipe",
  ];
  for (const escopo of candidatos) {
    if (escopo === "equipe" && !args.gestor) continue;
    if (conversaVisivelNoEscopo(conversa, { escopo, userId: args.userId, gestor: args.gestor })) {
      return escopo;
    }
  }
  return null;
}
