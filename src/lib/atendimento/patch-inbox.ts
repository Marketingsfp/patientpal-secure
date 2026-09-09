/**
 * FASE 4 — atualização pontual da lista de conversas (Inbox).
 *
 * Antes, qualquer mensagem nova mandava buscar de novo as 200 conversas do
 * filtro atual. Agora, quando o próprio evento em tempo real já traz o que
 * mudou, a linha da conversa é ajustada localmente: prévia, horário, não
 * lidas, responsável e status. A lista inteira só é conferida quando o evento
 * não é suficiente (conversa que entra ou sai do filtro, por exemplo).
 *
 * Isto é apresentação: nenhuma permissão, RLS ou validação do servidor é
 * dispensada aqui.
 */
import {
  conversaVisivelNoEscopo,
  type EscopoInbox,
  type ConversaEscopo,
} from "./escopo-inbox";

export type LinhaLista = {
  id: string;
  ultima_msg_preview?: string | null;
  ultima_msg_em?: string | null;
  nao_lidas?: number | null;
  [k: string]: any;
};

export type ResultadoPatch = {
  /** Lista já ajustada (mesma referência quando nada mudou). */
  lista: LinhaLista[];
  /** O evento foi suficiente: não é preciso recarregar a lista. */
  aplicado: boolean;
  /** É preciso conferir a lista no servidor (entrada/saída de filtro). */
  reconciliar: boolean;
};

function instante(v: any): number {
  const t = new Date(v ?? 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

function ordenar(lista: LinhaLista[]): LinhaLista[] {
  return [...lista].sort((a, b) => {
    const d = instante(b.ultima_msg_em) - instante(a.ultima_msg_em);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

function textoPrevia(linha: Record<string, any>): string | null {
  const bruto = linha["body"] ?? linha["content"] ?? linha["texto"] ?? null;
  if (typeof bruto !== "string") return null;
  const limpo = bruto.trim();
  if (!limpo) return null;
  return limpo.length > 160 ? `${limpo.slice(0, 160)}…` : limpo;
}

/**
 * Mensagem nova (Realtime de `whatsapp_mensagens`) → ajusta apenas a linha da
 * conversa correspondente. Conversa fora da lista atual devolve
 * `reconciliar: true` (pode ser uma conversa que acabou de entrar no filtro).
 */
export function patchListaPorMensagem(
  lista: LinhaLista[],
  linha: Record<string, any> | null | undefined,
  ctx: { conversaAberta: string | null },
): ResultadoPatch {
  const conversaId = String(linha?.["conversa_id"] ?? "");
  const quando = linha?.["created_at"] ?? linha?.["criado_em"] ?? null;
  if (!conversaId || !quando || !Array.isArray(lista)) {
    return { lista: lista ?? [], aplicado: false, reconciliar: true };
  }
  const alvo = lista.find((c) => c.id === conversaId);
  if (!alvo) return { lista, aplicado: false, reconciliar: true };

  const entrada = linha?.["direction"] === "in";
  const previa = textoPrevia(linha) ?? alvo.ultima_msg_preview ?? null;
  const maisNova = instante(quando) >= instante(alvo.ultima_msg_em);
  const contaNaoLida = entrada && ctx.conversaAberta !== conversaId;

  if (!maisNova && !contaNaoLida) return { lista, aplicado: true, reconciliar: false };

  const atualizada = lista.map((c) => {
    if (c.id !== conversaId) return c;
    return {
      ...c,
      ultima_msg_preview: maisNova ? previa : c.ultima_msg_preview,
      ultima_msg_em: maisNova ? String(quando) : c.ultima_msg_em,
      nao_lidas: contaNaoLida ? Number(c.nao_lidas ?? 0) + 1 : (c.nao_lidas ?? 0),
    };
  });
  return { lista: ordenar(atualizada), aplicado: true, reconciliar: false };
}

/**
 * Mudança na própria conversa (`atend_conversas`): responsável, status,
 * prévia, horário. Se a conversa passou a pertencer (ou deixou de pertencer)
 * ao filtro atual, a lista precisa ser conferida no servidor.
 */
export function patchListaPorConversa(
  lista: LinhaLista[],
  linha: Record<string, any> | null | undefined,
  ctx: { escopo: EscopoInbox; userId: string; gestor: boolean },
): ResultadoPatch {
  const id = String(linha?.["id"] ?? "");
  if (!id || !Array.isArray(lista)) {
    return { lista: lista ?? [], aplicado: false, reconciliar: true };
  }
  const visivel = conversaVisivelNoEscopo(linha as ConversaEscopo, ctx);
  const existente = lista.find((c) => c.id === id);

  // Entrou no filtro (nova, transferida para mim, devolvida à fila) ou saiu
  // dele: só a lista do servidor sabe a posição correta.
  if (!existente || !visivel) return { lista, aplicado: false, reconciliar: true };

  const mesclada = { ...existente, ...linha };
  const mudou = Object.keys(mesclada).some((k) => mesclada[k] !== existente[k]);
  if (!mudou) return { lista, aplicado: true, reconciliar: false };
  return {
    lista: ordenar(lista.map((c) => (c.id === id ? mesclada : c))),
    aplicado: true,
    reconciliar: false,
  };
}
