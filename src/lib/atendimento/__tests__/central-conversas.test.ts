import { describe, expect, it } from "bun:test";
import { listarPaginaCentral } from "../central-conversas.server";
function fake(rows: any[], error: { message: string } | null = null) {
  const calls: any[] = [];
  const q: any = {
    select(...a: any[]) {
      calls.push(["select", ...a]);
      return q;
    },
    eq(...a: any[]) {
      calls.push(["eq", ...a]);
      return q;
    },
    not(...a: any[]) {
      calls.push(["not", ...a]);
      return q;
    },
    in(...a: any[]) {
      calls.push(["in", ...a]);
      return q;
    },
    order(...a: any[]) {
      calls.push(["order", ...a]);
      return q;
    },
    async range(...a: any[]) {
      calls.push(["range", ...a]);
      return { data: rows, error };
    },
  };
  return {
    db: {
      from(t: string) {
        calls.push(["from", t]);
        return q;
      },
    } as never,
    calls,
  };
}
describe("central de conversas — todas as situações e paginação", () => {
  it("inclui abertas e encerradas sem filtrar status, mas isola clínica e ambiente", async () => {
    const { db, calls } = fake([
      { id: "aberta", status: "active" },
      { id: "fechada", status: "closed" },
      { id: "proxima", status: "waiting" },
    ]);
    const r = await listarPaginaCentral(db, {
      clinicaId: "clinica",
      situacao: "todas",
      offset: 0,
      limit: 2,
    });
    expect(r.conversas.map((c) => c.id)).toEqual(["aberta", "fechada"]);
    expect(r.temMais).toBe(true);
    expect(calls).toContainEqual(["eq", "clinica_id", "clinica"]);
    expect(calls).toContainEqual(["eq", "is_teste", false]);
    expect(calls.some((c) => c[0] === "not" || c[0] === "in")).toBe(false);
    expect(calls).toContainEqual(["range", 0, 2]);
  });
  it("página final não promete outras conversas e respeita offset", async () => {
    const { db, calls } = fake([{ id: "ultima" }]);
    expect(
      (
        await listarPaginaCentral(db, {
          clinicaId: "clinica",
          situacao: "todas",
          offset: 50,
          limit: 50,
        })
      ).temMais,
    ).toBe(false);
    expect(calls).toContainEqual(["range", 50, 100]);
  });
  it("filtros de abertas e encerradas usam ambos os estados de encerramento", async () => {
    for (const situacao of ["abertas", "encerradas"] as const) {
      const { db, calls } = fake([]);
      await listarPaginaCentral(db, { clinicaId: "clinica", situacao, offset: 0, limit: 50 });
      expect(calls).toContainEqual(
        situacao === "abertas"
          ? ["not", "status", "in", "(closed,finished)"]
          : ["in", "status", ["closed", "finished"]],
      );
    }
  });
  it("erro de leitura não se apresenta como lista vazia", async () => {
    const { db } = fake([], { message: "Falha de leitura" });
    await expect(
      listarPaginaCentral(db, { clinicaId: "clinica", situacao: "todas", offset: 0, limit: 50 }),
    ).rejects.toThrow("Falha de leitura");
  });
});
