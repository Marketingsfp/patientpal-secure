/**
 * REGRAS PURAS DO SCROLL DO CHAT DE ATENDIMENTO.
 *
 * Comportamento de aplicativo de mensagens:
 *  - ao ABRIR uma conversa, a tela começa sempre na última interação real da
 *    linha do tempo (mensagem OU evento interno);
 *  - com a conversa já aberta, uma mensagem nova só puxa a tela para baixo se
 *    a atendente já estiver perto do fim. Se ela estiver lendo o histórico,
 *    a posição é preservada e aparece o indicador "↓ N novas mensagens".
 */

/** Distância do fim (px) em que ainda consideramos que a pessoa "está no fim". */
export const LIMIAR_PERTO_DO_FIM = 120;

export interface PosicaoScroll {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export function distanciaDoFim(p: PosicaoScroll): number {
  return Math.max(0, p.scrollHeight - p.scrollTop - p.clientHeight);
}

export function pertoDoFim(p: PosicaoScroll, limiar = LIMIAR_PERTO_DO_FIM): boolean {
  return distanciaDoFim(p) <= limiar;
}

export type AcaoScroll =
  | { tipo: "ir_ao_fim"; suave: boolean; zerarNovas: true }
  | { tipo: "manter"; novas: number };

/**
 * Decide o que fazer quando a linha do tempo muda de tamanho.
 *
 * - `primeiraCarga`: abertura/troca de conversa → sempre ao fim, sem animação
 *   (item 14: nada de assistir o chat percorrer o histórico).
 * - itens novos com a pessoa perto do fim → acompanha automaticamente.
 * - itens novos com a pessoa lendo o histórico → mantém a posição e acumula
 *   o contador do indicador.
 * - carregar mensagens ANTIGAS (o total cresce, mas o último item é o mesmo)
 *   nunca joga a pessoa para o fim.
 */
export function decidirScroll(args: {
  primeiraCarga: boolean;
  /**
   * Janela de abertura: a conversa acabou de ser aberta e a atendente ainda não
   * navegou por conta própria. Enquanto isso, qualquer conteúdo que chegue
   * depois (resumo da Nina, eventos internos, revalidação do cache) mantém a
   * tela colada no fim, em vez de virar "↓ novas mensagens".
   */
  emAbertura?: boolean;
  totalAnterior: number;
  totalAtual: number;
  ultimoIdAnterior: string | null;
  ultimoIdAtual: string | null;
  posicao: PosicaoScroll;
  novasAtuais: number;
  limiar?: number;
}): AcaoScroll {
  if (args.primeiraCarga) return { tipo: "ir_ao_fim", suave: false, zerarNovas: true };

  const chegouItemNovo =
    args.ultimoIdAtual !== args.ultimoIdAnterior && args.totalAtual > args.totalAnterior;
  if (!chegouItemNovo) return { tipo: "manter", novas: args.novasAtuais };

  if (args.emAbertura) return { tipo: "ir_ao_fim", suave: false, zerarNovas: true };

  const quantidade = args.totalAtual - args.totalAnterior;
  if (pertoDoFim(args.posicao, args.limiar)) {
    return { tipo: "ir_ao_fim", suave: false, zerarNovas: true };
  }
  return { tipo: "manter", novas: args.novasAtuais + quantidade };
}


export function rotuloNovasMensagens(n: number): string {
  return n === 1 ? "1 nova mensagem" : `${n} novas mensagens`;
}
