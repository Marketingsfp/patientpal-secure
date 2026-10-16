import { z } from "zod";

export const TAMANHO_LOTE_ATIVAS = 20;
/** Teto de uma recarga numa chamada só (o servidor aceita até 500). */
export const LIMITE_RECARGA_LISTA = 500;
export const cursorInboxSchema = z.object({
  entrada: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});
export type CursorInbox = z.infer<typeof cursorInboxSchema>;

/** A posição persistida não muda ao receber mensagem; exclusões não pulam a próxima conversa. */
export function filtroAposCursor(cursor: CursorInbox): string {
  const { entrada, id } = cursorInboxSchema.parse(cursor);
  return `inbox_entrada_em.gt.${entrada},and(inbox_entrada_em.eq.${entrada},id.gt.${id})`;
}

export async function carregarLotesAtivas<
  T extends { id: string; inbox_entrada_em?: string | null },
>(ctx: {
  buscar: (cursor: CursorInbox | null, tamanho: number) => Promise<T[]>;
  cursor?: CursorInbox | null;
  quantidade?: number;
  /** Tamanho de cada pedido ao servidor; a recarga pede tudo de uma vez. */
  tamanhoLote?: number;
  vigente: () => boolean;
}) {
  const linhas: T[] = [];
  let cursor = ctx.cursor ?? null;
  let temMais = true;
  const tamanho = ctx.tamanhoLote ?? TAMANHO_LOTE_ATIVAS;
  do {
    const lote = await ctx.buscar(cursor, tamanho);
    if (!ctx.vigente()) return null;
    linhas.push(...lote);
    temMais = lote.length === tamanho;
    const ultima = lote.at(-1);
    if (ultima) {
      const proximo = cursorInboxSchema.parse({ entrada: ultima.inbox_entrada_em, id: ultima.id });
      if (cursor?.entrada === proximo.entrada && cursor.id === proximo.id)
        throw new Error("Não foi possível avançar a lista de conversas. Tente novamente.");
      cursor = proximo;
    }
  } while (temMais && linhas.length < (ctx.quantidade ?? TAMANHO_LOTE_ATIVAS));
  return { linhas, cursor, temMais };
}
