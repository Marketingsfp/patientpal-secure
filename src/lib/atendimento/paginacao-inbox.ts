import { z } from "zod";

export const TAMANHO_LOTE_ATIVAS = 20;
export const cursorInboxSchema = z.object({ entrada: z.string().datetime({ offset: true }), id: z.string().uuid() });
export type CursorInbox = z.infer<typeof cursorInboxSchema>;

/** A posição persistida não muda ao receber mensagem; exclusões não pulam a próxima conversa. */
export function filtroAposCursor(cursor: CursorInbox): string {
  const { entrada, id } = cursorInboxSchema.parse(cursor);
  return `inbox_entrada_em.gt.${entrada},and(inbox_entrada_em.eq.${entrada},id.gt.${id})`;
}

export async function carregarLotesAtivas<T extends { id: string; inbox_entrada_em?: string | null }>(ctx: {
  buscar: (cursor: CursorInbox | null) => Promise<T[]>;
  cursor?: CursorInbox | null;
  quantidade?: number;
  vigente: () => boolean;
}) {
  const linhas: T[] = [];
  let cursor = ctx.cursor ?? null;
  let temMais = true;
  do {
    const lote = await ctx.buscar(cursor);
    if (!ctx.vigente()) return null;
    linhas.push(...lote);
    temMais = lote.length === TAMANHO_LOTE_ATIVAS;
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
