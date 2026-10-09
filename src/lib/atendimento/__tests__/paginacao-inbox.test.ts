import { expect, it } from "bun:test";
import {
  carregarLotesAtivas,
  cursorInboxSchema,
  filtroAposCursor,
  TAMANHO_LOTE_ATIVAS,
  type CursorInbox,
} from "../paginacao-inbox";
import { compararEntradaInbox } from "../ordem-inbox";

const linhas = Array.from({ length: 127 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  inbox_entrada_em: new Date(Date.UTC(2026, 7, 25, 10, Math.floor(i / 3))).toISOString(),
}));
function banco(dados = linhas) {
  const chamadas: Array<CursorInbox | null> = [];
  const buscar = async (cursor: CursorInbox | null) => {
    chamadas.push(cursor);
    return dados
      .filter(
        (c) =>
          !cursor ||
          compararEntradaInbox(c, { id: cursor.id, inbox_entrada_em: cursor.entrada }) > 0,
      )
      .slice(0, TAMANHO_LOTE_ATIVAS);
  };
  return { buscar, chamadas };
}
it("primeiro carregamento traz 20; cada descida traz mais 20, ultrapassando 100 sem duplicar", async () => {
  const { buscar, chamadas } = banco();
  let cursor: CursorInbox | null = null;
  const recebidas: string[] = [];
  do {
    const pagina: { linhas: typeof linhas; cursor: CursorInbox | null; temMais: boolean } | null =
      await carregarLotesAtivas({ buscar, cursor, vigente: () => true });
    expect(pagina!.linhas.length).toBeLessThanOrEqual(20);
    recebidas.push(...pagina!.linhas.map((c) => c.id));
    cursor = pagina!.cursor;
    if (!pagina!.temMais) break;
  } while (true);
  expect(chamadas).toHaveLength(7);
  expect(recebidas).toEqual(linhas.map((c) => c.id));
  expect(new Set(recebidas).size).toBe(127);
});
it("saída de uma conversa já carregada não pula a primeira da próxima página", async () => {
  const primeira = await carregarLotesAtivas({ ...banco(), vigente: () => true });
  const seguinte = await carregarLotesAtivas({
    ...banco(linhas.slice(1)),
    cursor: primeira!.cursor,
    vigente: () => true,
  });
  expect(seguinte!.linhas[0]!.id).toBe(linhas[20]!.id);
});
it("reconexão reconcilia apenas os lotes já abertos e mantém a fila", async () => {
  const b = banco();
  const r = await carregarLotesAtivas({ ...b, quantidade: 60, vigente: () => true });
  expect(b.chamadas).toHaveLength(3);
  expect(r!.linhas).toEqual(linhas.slice(0, 60));
  expect(r!.temMais).toBe(true);
});
it("troca de filtro descarta resposta antiga e interrompe lotes restantes", async () => {
  const b = banco();
  expect(await carregarLotesAtivas({ ...b, quantidade: 100, vigente: () => false })).toBeNull();
  expect(b.chamadas).toHaveLength(1);
});
it("fim vazio encerra carregamento e erro permite tentar o mesmo cursor novamente", async () => {
  const vazio = await carregarLotesAtivas({ ...banco([]), vigente: () => true });
  expect(vazio).toEqual({ linhas: [], cursor: null, temMais: false });
  await expect(
    carregarLotesAtivas({
      buscar: async () => {
        throw new Error("rede");
      },
      vigente: () => true,
    }),
  ).rejects.toThrow("rede");
});
it("cursor valida timestamp e UUID antes de construir o filtro de continuidade", () => {
  const cursor = { entrada: linhas[19]!.inbox_entrada_em, id: linhas[19]!.id };
  expect(filtroAposCursor(cursor)).toBe(
    `inbox_entrada_em.gt.${cursor.entrada},and(inbox_entrada_em.eq.${cursor.entrada},id.gt.${cursor.id})`,
  );
  expect(cursorInboxSchema.safeParse({ ...cursor, id: "id),owner_type.eq.AI" }).success).toBe(
    false,
  );
  expect(cursorInboxSchema.safeParse({ ...cursor, entrada: "inválido" }).success).toBe(false);
});
