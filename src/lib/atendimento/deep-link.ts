/**
 * Seleção interna da conversa na Inbox (sem endereço individual).
 *
 * Estas funções são puras: decidem em qual filtro a conversa escolhida deve
 * ser mostrada e impedem que a tela troque sozinha a conversa pedida por
 * outro ponto do sistema (busca por número, alerta, Central de Atenção).
 */
import {
  conversaVisivelNoEscopo,
  type ConversaEscopo,
  type EscopoInbox,
} from "./escopo-inbox";

/**
 * Quando já existe uma conversa escolhida, a Inbox NÃO pode trocar por outra
 * automaticamente — senão a lista abriria a conversa errada.
 */
export function devoAutoSelecionarComSelecao(args: {
  selecaoAtual: string | null | undefined;
  temSelecao: boolean;
  removeuAgora: boolean;
  temPrimeiraLinha: boolean;
}): boolean {
  if (args.selecaoAtual) return false;
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
