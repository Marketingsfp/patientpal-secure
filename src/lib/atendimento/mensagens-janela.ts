/**
 * Janela de mensagens da conversa (Fase 4 — desempenho).
 *
 * Ao abrir uma conversa carregamos apenas as mensagens mais recentes. As
 * antigas só são buscadas quando a atendente rola para cima. Isso evita
 * esperar o histórico inteiro de conversas longas antes de mostrar a tela.
 */

/** Quantas mensagens são carregadas ao abrir a conversa. */
export const JANELA_INICIAL = 40;
/** Quantas mensagens antigas são buscadas a cada "carregar anteriores". */
export const JANELA_ANTERIOR = 40;

function instante(m: any): number {
  return new Date(m?.recebida_em ?? m?.created_at ?? 0).getTime();
}

/**
 * Junta mensagens antigas às já exibidas, sem duplicar e mantendo a ordem
 * cronológica. Mensagens já presentes prevalecem (podem ter status novo).
 */
export function mesclarAnteriores(atuais: any[], antigas: any[]): any[] {
  const mapa = new Map<string, any>();
  for (const m of antigas ?? []) if (m?.id) mapa.set(m.id, m);
  for (const m of atuais ?? []) if (m?.id) mapa.set(m.id, m);
  return [...mapa.values()].sort((a, b) => instante(a) - instante(b));
}

/**
 * Ainda pode existir histórico mais antigo? Só quando a busca voltou cheia.
 */
export function podeCarregarMais(recebidas: number, limite: number): boolean {
  return recebidas >= limite;
}

/** Instante da mensagem mais antiga já exibida (cursor da paginação). */
export function cursorMaisAntigo(msgs: any[]): string | null {
  if (!msgs?.length) return null;
  let menor: any = null;
  for (const m of msgs) {
    if (!m?.recebida_em) continue;
    if (!menor || instante(m) < instante(menor)) menor = m;
  }
  return menor?.recebida_em ?? null;
}
