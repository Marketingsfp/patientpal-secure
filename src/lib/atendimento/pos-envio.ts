/**
 * FASE 3 — o que acontece DEPOIS de enviar uma mensagem.
 *
 * Antes, cada envio disparava uma recarga completa da conversa (mensagens,
 * contato, notas, eventos) só para a mensagem enviada aparecer. Isso não é
 * necessário: a bolha já entra na hora (Fase 1) e o servidor devolve a linha
 * definitiva com o mesmo identificador do clique (Fase 2).
 *
 * Aqui ficam apenas ajustes locais, pequenos e testáveis:
 * - atualizar a mensagem daquela conversa dentro do cache, sem apagar o resto;
 * - mostrar o texto recém-enviado na lista, mantendo a ordem correta.
 *
 * O tempo real continua sendo a autoridade sobre o que vem de fora: qualquer
 * divergência é corrigida na próxima confirmação do servidor.
 */

import type { CacheConversas } from "./conversa-cache";
import { mesclarOficial } from "./envio-otimista";

/**
 * Substitui a bolha otimista pela mensagem definitiva DENTRO do cache da
 * conversa de origem. Contato, notas e eventos guardados continuam intactos —
 * enviar um texto não muda nenhum deles.
 */
export function atualizarMensagemNoCache(
  cache: CacheConversas,
  conversaId: string,
  oficial: any,
): boolean {
  if (!conversaId || !oficial) return false;
  const atual = cache.obter(conversaId);
  if (!atual) return false;
  cache.guardar(conversaId, { ...atual, msgs: mesclarOficial(atual.msgs, oficial) });
  return true;
}

/** Aplica a mesma transformação nas mensagens em cache (falha, reenvio...). */
export function transformarMensagensNoCache(
  cache: CacheConversas,
  conversaId: string,
  transformar: (msgs: any[]) => any[],
): boolean {
  if (!conversaId) return false;
  const atual = cache.obter(conversaId);
  if (!atual) return false;
  cache.guardar(conversaId, { ...atual, msgs: transformar(atual.msgs) });
  return true;
}

export type LinhaInbox = {
  id: string;
  ultima_msg_preview?: string | null;
  ultima_msg_em?: string | null;
  [k: string]: any;
};

function instante(v: any): number {
  const t = new Date(v ?? 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Mostra o texto recém-enviado na linha da conversa, sem recarregar a Inbox
 * inteira. A ordem por mais recente é preservada; o servidor confirma depois.
 *
 * Conversa que não está na lista atual (outro filtro) não é inserida aqui.
 */
export function aplicarPreviaLocalEnvio(
  lista: LinhaInbox[],
  params: { conversaId: string; texto: string; quando: string },
): LinhaInbox[] {
  const { conversaId, texto, quando } = params;
  if (!conversaId || !lista?.length) return lista ?? [];
  let mudou = false;
  const atualizada = lista.map((c) => {
    if (c.id !== conversaId) return c;
    // Uma confirmação mais nova do servidor não é sobrescrita por este palpite.
    if (instante(c.ultima_msg_em) > instante(quando)) return c;
    mudou = true;
    return { ...c, ultima_msg_preview: texto, ultima_msg_em: quando };
  });
  if (!mudou) return lista;
  return [...atualizada].sort((a, b) => {
    const d = instante(b.ultima_msg_em) - instante(a.ultima_msg_em);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

/**
 * Contador técnico de chamadas do envio (só para diagnóstico em
 * desenvolvimento). Não guarda nome, telefone, texto nem dado clínico.
 */
export type ContagemEnvio = { post: number; get: number };

export function criarContagemEnvio(): {
  registrar: (tipo: "post" | "get") => void;
  total: () => ContagemEnvio;
  zerar: () => void;
} {
  let post = 0;
  let get = 0;
  return {
    registrar(tipo) {
      if (tipo === "post") post += 1;
      else get += 1;
    },
    total: () => ({ post, get }),
    zerar() {
      post = 0;
      get = 0;
    },
  };
}
