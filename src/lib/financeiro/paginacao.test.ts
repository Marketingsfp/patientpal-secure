import { describe, expect, it } from "bun:test";
import { buscarPaginado, buscarPorLotes } from "./paginacao";

/**
 * Banco de mentira: devolve as linhas pedidas pelo `range`, guardando quais
 * faixas foram pedidas e em que ordem — é assim que se prova que as páginas
 * saem em paralelo e voltam na ordem certa.
 */
function bancoFake(totalLinhas: number, atraso: (p: number) => number = () => 0) {
  const pedidos: Array<[number, number]> = [];
  const montar = () => ({
    range: (de: number, ate: number) => {
      pedidos.push([de, ate]);
      const linhas: Array<{ i: number }> = [];
      for (let i = de; i <= ate && i < totalLinhas; i++) linhas.push({ i });
      const p = Math.floor(de / 10);
      return new Promise<{ data: Array<{ i: number }> | null; error: unknown }>((r) =>
        setTimeout(() => r({ data: linhas, error: null }), atraso(p)),
      );
    },
  });
  return { montar, pedidos };
}

describe("buscarPaginado", () => {
  it("devolve todas as linhas, na ordem das páginas", async () => {
    const { montar } = bancoFake(35);
    const linhas = await buscarPaginado(montar, { pagina: 10, maxPaginas: 10, porOnda: 4 });
    expect(linhas.length).toBe(35);
    expect(linhas.map((l) => l.i)).toEqual(Array.from({ length: 35 }, (_, i) => i));
  });

  it("mantém a ordem mesmo quando a página 1 responde depois da 3", async () => {
    // A primeira página demora 30ms; as outras voltam na hora.
    const { montar } = bancoFake(35, (p) => (p === 0 ? 30 : 0));
    const linhas = await buscarPaginado(montar, { pagina: 10, maxPaginas: 10, porOnda: 4 });
    expect(linhas.map((l) => l.i)).toEqual(Array.from({ length: 35 }, (_, i) => i));
  });

  it("pede as páginas da onda de uma vez, não uma esperando a outra", async () => {
    const { montar, pedidos } = bancoFake(35, () => 10);
    const t0 = Date.now();
    await buscarPaginado(montar, { pagina: 10, maxPaginas: 10, porOnda: 4 });
    const gasto = Date.now() - t0;
    // 4 páginas de 10ms em fila indiana levariam 40ms só na primeira onda.
    // Em paralelo, as duas ondas ficam perto de 20ms.
    expect(gasto).toBeLessThan(40);
    expect(pedidos.length).toBeGreaterThanOrEqual(4);
  });

  it("para na página incompleta e não conta as páginas seguintes da onda", async () => {
    const { montar } = bancoFake(12);
    const linhas = await buscarPaginado(montar, { pagina: 10, maxPaginas: 10, porOnda: 4 });
    expect(linhas.length).toBe(12);
  });

  it("respeita o teto de páginas", async () => {
    const { montar } = bancoFake(1000);
    const linhas = await buscarPaginado(montar, { pagina: 10, maxPaginas: 2, porOnda: 4 });
    expect(linhas.length).toBe(20);
  });

  it("não devolve meia lista quando uma página falha", async () => {
    const montar = () => ({
      range: (de: number) =>
        Promise.resolve(
          de === 0
            ? { data: Array.from({ length: 10 }, (_, i) => ({ i })), error: null }
            : { data: null, error: { message: "caiu" } },
        ),
    });
    await expect(
      buscarPaginado(montar, { pagina: 10, maxPaginas: 4, porOnda: 4 }),
    ).rejects.toBeTruthy();
  });

  it("lista vazia devolve lista vazia", async () => {
    const { montar } = bancoFake(0);
    expect(await buscarPaginado(montar, { pagina: 10, maxPaginas: 4 })).toEqual([]);
  });
});

describe("buscarPorLotes", () => {
  it("quebra os ids em lotes e junta o resultado na ordem", async () => {
    const ids = Array.from({ length: 7 }, (_, i) => `id${i}`);
    const out = await buscarPorLotes(ids, 3, async (lote) => lote.map((id) => ({ id })));
    expect(out.map((o) => o.id)).toEqual(ids);
  });

  it("lista vazia não consulta nada", async () => {
    let chamadas = 0;
    const out = await buscarPorLotes([], 3, async () => {
      chamadas++;
      return [];
    });
    expect(out).toEqual([]);
    expect(chamadas).toBe(0);
  });
});
