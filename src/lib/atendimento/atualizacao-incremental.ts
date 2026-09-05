/**
 * Atualização incremental do chat (Fase 4 — desempenho).
 *
 * Quando chega uma mensagem nova por Realtime, não recarregamos a conversa
 * inteira (mensagens + contato + notas + eventos). Buscamos apenas o que é
 * novo a partir da última mensagem já exibida e juntamos ao que está na tela.
 *
 * Regras mantidas das fases anteriores:
 * - tudo é sempre tratado pelo `conversation_id` da conversa aberta;
 * - nada de uma conversa entra na tela ou no cache de outra;
 * - se não houver referência (tela vazia), o carregamento normal assume.
 */

function instante(m: any): number {
  return new Date(m?.recebida_em ?? m?.created_at ?? 0).getTime();
}

/** Instante da mensagem mais recente já exibida (cursor do incremento). */
export function cursorMaisRecente(msgs: any[]): string | null {
  if (!msgs?.length) return null;
  let maior: any = null;
  for (const m of msgs) {
    if (!m?.recebida_em) continue;
    if (!maior || instante(m) > instante(maior)) maior = m;
  }
  return maior?.recebida_em ?? null;
}

/**
 * Junta as mensagens novas às já exibidas. Sem duplicar e sem "pular" o
 * histórico: as novas prevalecem (status de entrega pode ter mudado).
 */
export function mesclarNovas(atuais: any[], novas: any[]): any[] {
  const mapa = new Map<string, any>();
  for (const m of atuais ?? []) if (m?.id) mapa.set(m.id, m);
  for (const m of novas ?? []) if (m?.id) mapa.set(m.id, m);
  return [...mapa.values()].sort((a, b) => instante(a) - instante(b));
}

/** Junta eventos internos novos, também sem duplicar. */
export function mesclarEventos<T extends { id: string; created_at: string }>(
  atuais: T[],
  novos: T[],
): T[] {
  const mapa = new Map<string, T>();
  for (const e of atuais ?? []) if (e?.id) mapa.set(e.id, e);
  for (const e of novos ?? []) if (e?.id) mapa.set(e.id, e);
  return [...mapa.values()].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

/**
 * Dá para atualizar só o que é novo? Só quando a conversa aberta é a mesma e
 * já existe uma mensagem na tela para servir de referência.
 */
export function podeAtualizarIncremental(params: {
  conversaAberta: string | null;
  conversaCarregada: string | null;
  cursor: string | null;
}): boolean {
  const { conversaAberta, conversaCarregada, cursor } = params;
  if (!conversaAberta) return false;
  if (conversaAberta !== conversaCarregada) return false;
  return !!cursor;
}
