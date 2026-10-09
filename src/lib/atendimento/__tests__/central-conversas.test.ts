import { describe, expect, it } from "bun:test";
import { listarPaginaCentral } from "../central-conversas.server";
import {
  limitesPeriodoCentral,
  periodoCentralSchema,
  aplicarPeriodoCentral,
} from "../periodo-central";
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
    gte(...a: any[]) {
      calls.push(["gte", ...a]);
      return q;
    },
    lt(...a: any[]) {
      calls.push(["lt", ...a]);
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
  it("datas filtram a abertura antes da paginação e incluem o último dia de Brasília", async () => {
    const { db, calls } = fake([]);
    await listarPaginaCentral(db, {
      clinicaId: "clinica",
      situacao: "encerradas",
      offset: 50,
      limit: 50,
      de: "2026-10-02",
      ate: "2026-10-03",
    });
    expect(calls).toContainEqual(["gte", "created_at", "2026-10-02T03:00:00.000Z"]);
    expect(calls).toContainEqual(["lt", "created_at", "2026-10-04T03:00:00.000Z"]);
    expect(calls.findIndex((c) => c[0] === "lt")).toBeLessThan(
      calls.findIndex((c) => c[0] === "range"),
    );
    expect(calls).toContainEqual(["in", "status", ["closed", "finished"]]);
    expect(calls).toContainEqual(["range", 50, 100]);
  });
  it("aceita um único limite, o mesmo dia, fim de ano e fevereiro bissexto", () => {
    expect(limitesPeriodoCentral({})).toEqual({ inicio: undefined, fim: undefined });
    expect(limitesPeriodoCentral({ de: "2026-10-03" }).fim).toBeUndefined();
    expect(limitesPeriodoCentral({ ate: "2026-12-31" }).fim).toBe("2027-01-01T03:00:00.000Z");
    expect(limitesPeriodoCentral({ de: "2024-02-29", ate: "2024-02-29" })).toEqual({
      inicio: "2024-02-29T03:00:00.000Z",
      fim: "2024-03-01T03:00:00.000Z",
    });
  });
  it("rejeita data inexistente e período invertido", () => {
    expect(periodoCentralSchema.safeParse({ de: "2026-02-29" }).success).toBe(false);
    expect(periodoCentralSchema.safeParse({ de: "03/10/2026" }).success).toBe(false);
    expect(() => limitesPeriodoCentral({ de: "2026-10-04", ate: "2026-10-03" })).toThrow(
      "data inicial",
    );
  });
  it("busca por mensagens filtra a abertura da conversa vinculada, não a data da mensagem", () => {
    const calls: unknown[][] = [];
    const q = {
      gte(c: string, v: string) {
        calls.push(["gte", c, v]);
        return this;
      },
      lt(c: string, v: string) {
        calls.push(["lt", c, v]);
        return this;
      },
    };
    aplicarPeriodoCentral(q, { de: "2026-10-03", ate: "2026-10-03" }, "atend_conversas.created_at");
    expect(calls).toEqual([
      ["gte", "atend_conversas.created_at", "2026-10-03T03:00:00.000Z"],
      ["lt", "atend_conversas.created_at", "2026-10-04T03:00:00.000Z"],
    ]);
  });
});
